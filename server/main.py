import asyncio
import json
import logging
import os
import shutil
import subprocess
import tempfile
import time
from typing import List

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from starlette.background import BackgroundTask

from analysis import analyze_video_stream, search_analysis_stream
from db import (
    delete_history,
    get_version_scenes,
    init_db,
    list_history,
    save_analysis,
    save_analysis_error,
    save_history,
    save_search_result,
    save_video_file,
    update_video_selection,
)
from sse import sse_event
from video_folder import get_video_folder, get_video_path, scan_folder

# Load .env.local then .env
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

FFMPEG_PATH = shutil.which("ffmpeg")
if not FFMPEG_PATH:
    logger.warning("ffmpeg not found on PATH — /api/trim will not work")


@app.on_event("startup")
def startup():
    init_db()
    logger.info("SQLite database initialized")
    video_folder = os.environ.get("VIDEO_FOLDER", "")
    if video_folder:
        logger.info(f"VIDEO_FOLDER: {video_folder}")
    else:
        logger.warning("VIDEO_FOLDER not set — /api/videos will not work")


# --- Health & Config ---


@app.get("/api/health")
async def health():
    return {"status": "ok", "ffmpeg": FFMPEG_PATH is not None}


@app.get("/api/config")
async def config():
    video_folder = os.environ.get("VIDEO_FOLDER", "")
    try:
        videos = scan_folder()
        return {
            "video_folder": video_folder,
            "video_folder_configured": True,
            "video_count": len(videos),
            "model": "qwen3.6-plus",
        }
    except ValueError:
        return {
            "video_folder": video_folder,
            "video_folder_configured": False,
            "video_count": 0,
            "model": "qwen3.6-plus",
        }


# --- Video folder ---


@app.get("/api/videos")
async def list_videos():
    return await asyncio.to_thread(scan_folder)


@app.post("/api/videos/upload")
async def upload_videos(files: List[UploadFile] = File(...)):
    """Upload video files to the configured VIDEO_FOLDER. Renames on conflict."""
    from pathlib import Path as _Path

    folder = get_video_folder()
    saved = []
    for f in files:
        if not f.filename:
            continue

        # Deduplicate filename
        stem = _Path(f.filename).stem
        suffix = _Path(f.filename).suffix
        dest = folder / f.filename
        counter = 1
        while dest.exists():
            dest = folder / f"{stem}_{counter}{suffix}"
            counter += 1

        final_name = dest.name

        with open(dest, "wb") as out:
            while chunk := await f.read(1024 * 1024):
                out.write(chunk)

        # Save to DB
        stat = dest.stat()
        save_video_file(final_name, stat.st_size, stat.st_mtime)

        saved.append(
            {
                "filename": final_name,
                "original": f.filename,
                "size_mb": round(stat.st_size / (1024 * 1024), 1),
            }
        )
    return {"uploaded": saved}


@app.get("/api/videos/{filename}/stream")
async def stream_video(filename: str):
    path = await asyncio.to_thread(get_video_path, filename)
    return FileResponse(
        path=str(path),
        media_type="video/mp4",
        filename=filename,
    )


# --- Analysis ---


class AnalyzeRequest(BaseModel):
    filename: str
    keywords: str = ""
    history_id: str | None = None


class SearchRequest(BaseModel):
    version_id: str
    keywords: str


class SelectionPayload(BaseModel):
    history_id: str
    filename: str
    current_version_index: int
    current_search_keywords: str = ""


def _parse_sse_event(event: str) -> tuple[str | None, dict | None]:
    event_name = None
    payload = None

    for line in event.splitlines():
        if line.startswith("event: "):
            event_name = line[7:].strip()
        elif line.startswith("data: "):
            try:
                payload = json.loads(line[6:].strip())
            except json.JSONDecodeError:
                payload = None

    return event_name, payload


@app.post("/api/analyze")
async def analyze(req: AnalyzeRequest):
    filepath = await asyncio.to_thread(get_video_path, req.filename)
    history_id = req.history_id or str(int(time.time() * 1000))
    search_keywords = req.keywords.strip()

    async def event_stream():
        full_scenes = None
        full_error = None
        matched_scenes = None
        search_error = None

        async for event in analyze_video_stream(filepath):
            yield event

            event_name, payload = _parse_sse_event(event)
            if event_name == "full_result" and payload is not None:
                full_scenes = payload.get("scenes", [])
            elif event_name == "error" and payload is not None:
                full_error = payload.get("message", "Unknown error")

        if full_scenes is None:
            if full_error:
                await asyncio.to_thread(
                    save_analysis_error,
                    history_id,
                    req.filename,
                    search_keywords,
                    full_error,
                )
            yield sse_event("done", {})
            return

        saved = await asyncio.to_thread(
            save_analysis, history_id, req.filename, search_keywords, full_scenes
        )
        saved_history = saved["history"]
        version_id = saved["version_id"]

        if search_keywords:
            async for event in search_analysis_stream(full_scenes, search_keywords):
                yield event

                event_name, payload = _parse_sse_event(event)
                if event_name == "search_result" and payload is not None:
                    matched_scenes = payload.get("scenes", [])
                elif event_name == "search_error" and payload is not None:
                    search_error = payload.get("message", "Unknown error")

            saved_history = await asyncio.to_thread(
                save_search_result,
                version_id,
                search_keywords,
                matched_scenes or [],
                search_error,
            )

        if saved_history is not None:
            yield sse_event("saved", {"history": saved_history})
        elif full_error:
            await asyncio.to_thread(
                save_analysis_error,
                history_id,
                req.filename,
                search_keywords,
                full_error,
            )

        yield sse_event("done", {})

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/api/search")
async def search(req: SearchRequest):
    keywords = req.keywords.strip()
    if not keywords:
        raise HTTPException(status_code=400, detail="keywords is required")

    full_scenes = await asyncio.to_thread(get_version_scenes, req.version_id)
    if full_scenes is None:
        raise HTTPException(status_code=404, detail="version not found")

    matched_scenes = []
    search_error = None

    async for event in search_analysis_stream(full_scenes, keywords):
        event_name, payload = _parse_sse_event(event)
        if event_name == "search_result" and payload is not None:
            matched_scenes = payload.get("scenes", [])
        elif event_name == "search_error" and payload is not None:
            search_error = payload.get("message", "Unknown error")

    saved_history = await asyncio.to_thread(
        save_search_result,
        req.version_id,
        keywords,
        matched_scenes,
        search_error,
    )
    return {"history": saved_history, "searchError": search_error}


# --- Trim ---


class TrimRequest(BaseModel):
    filename: str
    start: float
    end: float


def _run_ffmpeg(args: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(
        [FFMPEG_PATH, *args],
        capture_output=True,
        timeout=600,
    )


def _trim(input_path: str, output_path: str, start: float, end: float) -> None:
    result = _run_ffmpeg(
        [
            "-y",
            "-i",
            input_path,
            "-ss",
            str(start),
            "-to",
            str(end),
            "-c",
            "copy",
            "-avoid_negative_ts",
            "make_zero",
            output_path,
        ]
    )

    if result.returncode == 0 and os.path.getsize(output_path) > 0:
        return

    logger.info("Stream copy failed or empty output, falling back to re-encode")

    result = _run_ffmpeg(
        [
            "-y",
            "-i",
            input_path,
            "-ss",
            str(start),
            "-to",
            str(end),
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-c:a",
            "aac",
            output_path,
        ]
    )

    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {result.stderr.decode(errors='replace')}")


@app.post("/api/trim")
async def trim_video(req: TrimRequest):
    if not FFMPEG_PATH:
        return {"error": "ffmpeg not found on server"}, 500

    source_path = await asyncio.to_thread(get_video_path, req.filename)

    tmpdir = tempfile.mkdtemp(prefix="trim_")
    output_path = os.path.join(tmpdir, "output.mp4")

    try:
        await asyncio.to_thread(
            _trim, str(source_path), output_path, req.start, req.end
        )

        safe_name = req.filename.rsplit(".", 1)[0]
        download_name = f"{safe_name}_{int(req.start)}s-{int(req.end)}s.mp4"

        return FileResponse(
            path=output_path,
            media_type="video/mp4",
            filename=download_name,
            background=BackgroundTask(shutil.rmtree, tmpdir, ignore_errors=True),
        )
    except Exception:
        shutil.rmtree(tmpdir, ignore_errors=True)
        raise


# --- History ---


class HistoryPayload(BaseModel):
    id: str
    date: int
    keywords: str
    videos: list[dict]


@app.get("/api/history")
async def get_history():
    return await asyncio.to_thread(list_history)


@app.post("/api/history")
async def post_history(payload: HistoryPayload):
    return await asyncio.to_thread(save_history, payload.model_dump())


@app.post("/api/history/selection")
async def post_history_selection(payload: SelectionPayload):
    updated = await asyncio.to_thread(
        update_video_selection,
        payload.history_id,
        payload.filename,
        payload.current_version_index,
        payload.current_search_keywords,
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="history item not found")
    return {"history": updated}


@app.delete("/api/history/{history_id}")
async def remove_history(history_id: str):
    deleted = await asyncio.to_thread(delete_history, history_id)
    if not deleted:
        return {"error": "not found"}, 404
    return {"ok": True}
