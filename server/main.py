import asyncio
import json
import logging
import os
import re
import shutil
import subprocess
import tempfile
import time
import zipfile
from pathlib import Path
from typing import Any, List

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response, StreamingResponse
from pydantic import BaseModel, ConfigDict, model_validator
from starlette.background import BackgroundTask

from analysis import (
    analyze_video_stream,
    build_candidate_snapshot,
    generate_storyboard,
    get_model_config,
    normalize_imported_storyboard,
    search_analysis_stream,
    validate_import_scenes,
)
from db import (
    create_storyboard_timeline,
    create_product_folder,
    delete_dataset,
    delete_product_folder,
    delete_history,
    delete_storyboard_project,
    delete_storyboard_timeline,
    get_storyboard_project,
    get_storyboard_timeline,
    get_video_file_filename,
    get_version_scenes,
    get_video_versions_for_storyboard,
    init_db,
    list_history,
    list_product_folders,
    list_storyboard_projects,
    list_storyboard_timelines,
    rename_product_folder,
    replace_storyboard_timeline_clips,
    save_analysis,
    save_analysis_error,
    save_history,
    save_import_analysis,
    save_search_result,
    save_storyboard_project,
    save_video_file,
    update_video_file,
    update_dataset_product_name,
    update_video_selection_by_db_video_id,
    update_history_product_name,
    update_storyboard_timeline,
    update_video_selection,
)
from sse import sse_event
from video_folder import (
    get_video_folder,
    get_video_path,
    rename_video_file,
    scan_folder,
    validate_video_filename,
)

# Load .env.local then .env
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_origin_regex=r"chrome-extension://.*|moz-extension://.*",
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
    models = get_model_config()
    video_folder = os.environ.get("VIDEO_FOLDER", "")
    try:
        videos = scan_folder()
        return {
            "video_folder": video_folder,
            "video_folder_configured": True,
            "video_count": len(videos),
            "model": models["video_analysis_model"],
            "models": models,
        }
    except ValueError:
        return {
            "video_folder": video_folder,
            "video_folder_configured": False,
            "video_count": 0,
            "model": models["video_analysis_model"],
            "models": models,
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


_STREAM_CHUNK_SIZE = 1024 * 1024  # 1 MiB per read; balances throughput and memory.


def _parse_range_header(range_header: str, file_size: int) -> tuple[int, int] | None:
    """Parse a single-range `Range: bytes=start-end` header into a [start, end] pair.

    Returns `None` if the header is malformed or the range falls outside the file.
    Multi-range requests are intentionally not supported (browsers requesting
    video playback always use a single range).
    """
    if not range_header or not range_header.lower().startswith("bytes="):
        return None

    spec = range_header[len("bytes=") :].strip()
    if "," in spec:
        return None

    start_str, _, end_str = spec.partition("-")
    try:
        if start_str == "":
            # Suffix range: bytes=-N -> last N bytes.
            if end_str == "":
                return None
            length = int(end_str)
            if length <= 0:
                return None
            start = max(file_size - length, 0)
            end = file_size - 1
        else:
            start = int(start_str)
            end = int(end_str) if end_str else file_size - 1
    except ValueError:
        return None

    if start < 0 or start >= file_size or end < start:
        return None

    end = min(end, file_size - 1)
    return start, end


async def _iter_file_range(path: Path, start: int, end: int):
    """Async generator yielding `path[start:end+1]` in `_STREAM_CHUNK_SIZE` chunks."""
    remaining = end - start + 1

    def _open_and_seek():
        f = open(path, "rb")
        f.seek(start)
        return f

    fh = await asyncio.to_thread(_open_and_seek)
    try:
        while remaining > 0:
            chunk_size = min(_STREAM_CHUNK_SIZE, remaining)
            chunk = await asyncio.to_thread(fh.read, chunk_size)
            if not chunk:
                break
            remaining -= len(chunk)
            yield chunk
    finally:
        await asyncio.to_thread(fh.close)


@app.get("/api/videos/{filename}/stream")
async def stream_video(filename: str, range: str | None = Header(default=None)):
    """Stream a video file with full HTTP Range support.

    The previous implementation returned `FileResponse` which on Starlette
    0.38.x ignores `Range` headers, returns the entire file with 200 OK and
    omits `Accept-Ranges`. Browsers that cannot do range requests cannot seek
    into a video before it has fully buffered, which presented as the bug
    "some footage matches play from the correct moment, others play from
    second 0" — small files happened to be fully buffered at click time, big
    ones were not.
    """
    path = await asyncio.to_thread(get_video_path, filename)
    stat_result = await asyncio.to_thread(os.stat, str(path))
    file_size = stat_result.st_size

    common_headers = {
        "Accept-Ranges": "bytes",
        "Content-Disposition": f'inline; filename="{filename}"',
        "Cache-Control": "public, max-age=3600",
    }

    if range is None:
        # No range requested: return the full file but advertise Accept-Ranges
        # so the browser knows it can seek on subsequent requests.
        return StreamingResponse(
            _iter_file_range(path, 0, file_size - 1),
            status_code=200,
            media_type="video/mp4",
            headers={
                **common_headers,
                "Content-Length": str(file_size),
            },
        )

    parsed = _parse_range_header(range, file_size)
    if parsed is None:
        # Malformed or unsatisfiable range -> 416 with a Content-Range hint.
        return Response(
            status_code=416,
            headers={
                **common_headers,
                "Content-Range": f"bytes */{file_size}",
            },
        )

    start, end = parsed
    chunk_length = end - start + 1
    return StreamingResponse(
        _iter_file_range(path, start, end),
        status_code=206,
        media_type="video/mp4",
        headers={
            **common_headers,
            "Content-Length": str(chunk_length),
            "Content-Range": f"bytes {start}-{end}/{file_size}",
        },
    )


# --- Analysis ---


class AnalyzeRequest(BaseModel):
    filename: str
    keywords: str = ""
    history_id: str | None = None
    product_name: str = ""


class SearchRequest(BaseModel):
    version_id: str
    keywords: str


class ImportAnalysisRequest(BaseModel):
    filename: str
    scenes: list[dict[str, Any]]
    source: str = "chat.qwen.ai"
    product_name: str = ""


class SelectionPayload(BaseModel):
    history_id: str
    filename: str
    current_version_index: int
    current_search_keywords: str = ""


class DatasetSelectionPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    dbVideoId: int | None = None
    db_video_id: int | None = None
    current_version_index: int
    current_search_keywords: str = ""

    @model_validator(mode="after")
    def validate_db_video_id(self):
        if self.dbVideoId is None and self.db_video_id is None:
            raise ValueError("dbVideoId is required")
        return self

    def resolved_db_video_id(self) -> int:
        return self.dbVideoId if self.dbVideoId is not None else self.db_video_id


class StoryboardRequest(BaseModel):
    product_name: str
    product_description: str = ""
    category: str = ""
    target_audience: str = ""
    tone: str = ""
    key_benefits: str = ""
    script_text: str
    selected_version_ids: list[str]
    folder_id: int | None = None


class ImportStoryboardRequest(StoryboardRequest):
    result_json: Any


class TimelineCreateRequest(BaseModel):
    name: str | None = None


class TimelineUpdateRequest(BaseModel):
    name: str | None = None
    position: int | None = None


class TimelineClipPayload(BaseModel):
    id: str | None = None
    beatId: str | None = None
    label: str
    filename: str
    start: float
    end: float
    sceneIndex: int | None = None


class TimelineClipsReplaceRequest(BaseModel):
    clips: list[TimelineClipPayload]


class HistoryProductPayload(BaseModel):
    product_name: str = ""


class DatasetProductPayload(BaseModel):
    product_name_override: str = ""


class ProductFolderPayload(BaseModel):
    name: str


class UpdateVideoFilePayload(BaseModel):
    filename: str | None = None
    folder_id: int | None = None

    @model_validator(mode="after")
    def validate_changes_present(self):
        if self.filename is None and self.folder_id is None:
            raise ValueError("filename hoặc folder_id là bắt buộc")
        return self


def _http_exception_for_value_error(exc: ValueError) -> HTTPException:
    detail = str(exc)
    if detail in {"Không tìm thấy thư mục", "Không tìm thấy video"}:
        return HTTPException(status_code=404, detail=detail)
    return HTTPException(status_code=400, detail=detail)


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


def _resolve_library_filename(filename: str) -> str:
    requested = Path(filename.strip()).name
    if not requested:
        raise ValueError("filename is required")

    videos = scan_folder()
    for video in videos:
        if video["filename"] == requested:
            return video["filename"]

    if os.name == "nt":
        requested_folded = requested.casefold()
        for video in videos:
            if video["filename"].casefold() == requested_folded:
                return video["filename"]

    raise FileNotFoundError(f"Video not found in library: {requested}")


@app.post("/api/import-analysis")
async def import_analysis(req: ImportAnalysisRequest):
    logger.info(
        "Import analysis request: filename=%s source=%s scenes=%d",
        req.filename,
        req.source or "<empty>",
        len(req.scenes),
    )

    try:
        resolved_filename = await asyncio.to_thread(
            _resolve_library_filename, req.filename
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    try:
        scenes = validate_import_scenes(req.scenes)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        video_path = await asyncio.to_thread(get_video_path, resolved_filename)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    stat = await asyncio.to_thread(video_path.stat)
    video_file_id = await asyncio.to_thread(
        save_video_file, resolved_filename, stat.st_size, stat.st_mtime
    )
    saved = await asyncio.to_thread(
        save_import_analysis,
        resolved_filename,
        video_file_id,
        scenes,
        req.product_name,
    )
    return saved


@app.post("/api/analyze")
async def analyze(req: AnalyzeRequest):
    filepath = await asyncio.to_thread(get_video_path, req.filename)
    history_id = req.history_id or str(int(time.time() * 1000))
    search_keywords = req.keywords.strip()
    logger.info(
        "Analyze request: filename=%s history_id=%s keywords=%s",
        req.filename,
        history_id,
        search_keywords or "<empty>",
    )

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
                    req.product_name,
                )
            yield sse_event("done", {})
            return

        saved = await asyncio.to_thread(
            save_analysis,
            history_id,
            req.filename,
            search_keywords,
            full_scenes,
            req.product_name,
        )
        saved_history = saved["history"]
        version_id = saved["version_id"]
        logger.info(
            "Saved full analysis for %s as version %s",
            req.filename,
            version_id,
        )

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
            if search_error:
                logger.warning(
                    "Search result saved with error for %s version=%s keywords=%s: %s",
                    req.filename,
                    version_id,
                    search_keywords,
                    search_error,
                )
            else:
                logger.info(
                    "Saved search result for %s version=%s keywords=%s",
                    req.filename,
                    version_id,
                    search_keywords,
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
                req.product_name,
            )

        yield sse_event("done", {})

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/api/search")
async def search(req: SearchRequest):
    keywords = req.keywords.strip()
    if not keywords:
        raise HTTPException(status_code=400, detail="keywords is required")

    logger.info("Search request: version_id=%s keywords=%s", req.version_id, keywords)

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
    if search_error:
        logger.warning(
            "Search request completed with error for version=%s keywords=%s: %s",
            req.version_id,
            keywords,
            search_error,
        )
    else:
        logger.info(
            "Search request completed for version=%s keywords=%s with %d matches",
            req.version_id,
            keywords,
            len(matched_scenes),
        )
    return {"history": saved_history, "searchError": search_error}


@app.post("/api/storyboard/generate")
async def storyboard_generate(req: StoryboardRequest):
    if not req.script_text.strip():
        raise HTTPException(status_code=400, detail="script_text is required")
    if not req.selected_version_ids:
        raise HTTPException(status_code=400, detail="selected_version_ids is required")

    logger.info(
        "Storyboard request: product=%s selected_versions=%d",
        req.product_name or "<empty>",
        len(req.selected_version_ids),
    )

    candidate_versions = await asyncio.to_thread(
        get_video_versions_for_storyboard, req.selected_version_ids
    )
    if not candidate_versions:
        raise HTTPException(status_code=404, detail="No analyzed video versions found")

    product = {
        "name": req.product_name.strip(),
        "description": req.product_description.strip(),
        "category": req.category.strip(),
        "target_audience": req.target_audience.strip(),
        "tone": req.tone.strip(),
        "key_benefits": req.key_benefits.strip(),
    }

    try:
        result = await generate_storyboard(
            product, req.script_text.strip(), candidate_versions
        )
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _storyboard_product(req: StoryboardRequest) -> dict[str, str]:
    return {
        "name": req.product_name.strip(),
        "description": req.product_description.strip(),
        "category": req.category.strip(),
        "target_audience": req.target_audience.strip(),
        "tone": req.tone.strip(),
        "key_benefits": req.key_benefits.strip(),
    }


async def _load_storyboard_candidates(req: StoryboardRequest) -> tuple[list[dict], list[dict], dict]:
    if not req.script_text.strip():
        raise HTTPException(status_code=400, detail="script_text is required")
    if not req.selected_version_ids:
        raise HTTPException(status_code=400, detail="selected_version_ids is required")

    candidate_versions = await asyncio.to_thread(
        get_video_versions_for_storyboard, req.selected_version_ids
    )
    if not candidate_versions:
        raise HTTPException(status_code=404, detail="No analyzed video versions found")

    candidate_snapshot, candidate_map = build_candidate_snapshot(candidate_versions)
    return candidate_versions, candidate_snapshot, candidate_map


def _storyboard_save_payload(
    req: StoryboardRequest, candidate_snapshot: list[dict], result: dict, source: str
) -> dict[str, Any]:
    return {
        "product_name": req.product_name.strip(),
        "product_description": req.product_description.strip(),
        "category": req.category.strip(),
        "target_audience": req.target_audience.strip(),
        "tone": req.tone.strip(),
        "key_benefits": req.key_benefits.strip(),
        "script_text": req.script_text.strip(),
        "selected_version_ids": req.selected_version_ids,
        "folder_id": req.folder_id,
        "candidate_snapshot": candidate_snapshot,
        "result": result,
        "source": source,
    }


@app.get("/api/storyboards")
async def storyboards_list():
    return {"storyboards": await asyncio.to_thread(list_storyboard_projects)}


@app.get("/api/storyboards/{storyboard_id}")
async def storyboards_get(storyboard_id: str):
    storyboard = await asyncio.to_thread(get_storyboard_project, storyboard_id)
    if not storyboard:
        raise HTTPException(status_code=404, detail="Storyboard not found")
    return storyboard


@app.post("/api/storyboards/generate")
async def storyboards_generate(req: StoryboardRequest):
    candidate_versions, candidate_snapshot, _candidate_map = await _load_storyboard_candidates(req)
    try:
        result = await generate_storyboard(
            _storyboard_product(req), req.script_text.strip(), candidate_versions
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except httpx.TimeoutException as exc:
        raise HTTPException(
            status_code=504,
            detail="Model tạo storyboard quá thời gian chờ. Hãy thử lại hoặc chọn ít video hơn.",
        ) from exc

    return await asyncio.to_thread(
        save_storyboard_project,
        _storyboard_save_payload(req, candidate_snapshot, result, "generated"),
    )


@app.post("/api/storyboards/import")
async def storyboards_import(req: ImportStoryboardRequest):
    _candidate_versions, candidate_snapshot, candidate_map = await _load_storyboard_candidates(req)
    try:
        result = normalize_imported_storyboard(req.result_json, candidate_map)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return await asyncio.to_thread(
        save_storyboard_project,
        _storyboard_save_payload(req, candidate_snapshot, result, "imported"),
    )


@app.delete("/api/storyboards/{storyboard_id}")
async def storyboards_delete(storyboard_id: str):
    deleted = await asyncio.to_thread(delete_storyboard_project, storyboard_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Storyboard not found")
    return {"deleted": True}


@app.get("/api/storyboards/{storyboard_id}/timelines")
async def storyboard_timelines_list(storyboard_id: str):
    storyboard = await asyncio.to_thread(get_storyboard_project, storyboard_id)
    if not storyboard:
        raise HTTPException(status_code=404, detail="Storyboard not found")
    timelines = await asyncio.to_thread(list_storyboard_timelines, storyboard_id)
    return {"timelines": timelines}


@app.post("/api/storyboards/{storyboard_id}/timelines")
async def storyboard_timelines_create(storyboard_id: str, req: TimelineCreateRequest):
    timeline = await asyncio.to_thread(
        create_storyboard_timeline, storyboard_id, req.name
    )
    if not timeline:
        raise HTTPException(status_code=404, detail="Storyboard not found")
    return timeline


@app.patch("/api/storyboard-timelines/{timeline_id}")
async def storyboard_timeline_update(timeline_id: str, req: TimelineUpdateRequest):
    payload = req.model_dump(exclude_unset=True)
    timeline = await asyncio.to_thread(update_storyboard_timeline, timeline_id, payload)
    if not timeline:
        raise HTTPException(status_code=404, detail="Timeline not found")
    return timeline


@app.delete("/api/storyboard-timelines/{timeline_id}")
async def storyboard_timeline_delete(timeline_id: str):
    deleted = await asyncio.to_thread(delete_storyboard_timeline, timeline_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Timeline not found")
    return {"deleted": True}


@app.put("/api/storyboard-timelines/{timeline_id}/clips")
async def storyboard_timeline_clips_replace(
    timeline_id: str, req: TimelineClipsReplaceRequest
):
    clips = [clip.model_dump() for clip in req.clips]
    try:
        for clip in clips:
            clip["filename"] = validate_video_filename(clip["filename"])
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if any(clip["end"] <= clip["start"] for clip in clips):
        raise HTTPException(status_code=400, detail="Invalid clip range")
    timeline = await asyncio.to_thread(
        replace_storyboard_timeline_clips, timeline_id, clips
    )
    if not timeline:
        raise HTTPException(status_code=404, detail="Timeline not found")
    return timeline


# --- Trim ---


class TrimRequest(BaseModel):
    filename: str
    start: float
    end: float


def _slug_filename_part(value: str, fallback: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9]+", "-", value.strip()).strip("-").lower()
    return slug or fallback


def _format_time_for_filename(seconds: float) -> str:
    total_seconds = max(0, int(seconds))
    minutes = total_seconds // 60
    remaining_seconds = total_seconds % 60
    return f"{minutes:02d}-{remaining_seconds:02d}"


def _timeline_clip_download_name(index: int, clip: dict) -> str:
    label = _slug_filename_part(str(clip.get("label") or ""), "clip")
    source = _slug_filename_part(Path(str(clip.get("filename") or "video")).stem, "video")
    start = _format_time_for_filename(float(clip.get("start") or 0))
    end = _format_time_for_filename(float(clip.get("end") or 0))
    return f"{index + 1:02d}_{label}_{source}_{start}_{end}.mp4"


def _timeline_zip_download_name(timeline: dict) -> str:
    storyboard = get_storyboard_project(timeline["storyboardId"])
    product_name = _slug_filename_part(
        str((storyboard or {}).get("productName") or "storyboard"), "storyboard"
    )
    timeline_name = _slug_filename_part(str(timeline.get("name") or "clips"), "clips")
    return f"storyboard_{product_name}_{timeline_name}.zip"


def _export_timeline_zip(timeline: dict, tmpdir: str, zip_path: str) -> None:
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as archive:
        for index, clip in enumerate(timeline.get("clips") or []):
            source_path = get_video_path(validate_video_filename(clip["filename"]))
            clip_name = _timeline_clip_download_name(index, clip)
            output_path = os.path.join(tmpdir, clip_name)
            _trim(
                str(source_path),
                output_path,
                float(clip["start"]),
                float(clip["end"]),
            )
            archive.write(output_path, arcname=clip_name)


def _run_ffmpeg(args: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(
        [FFMPEG_PATH, *args],
        capture_output=True,
        timeout=600,
    )


def _trim(input_path: str, output_path: str, start: float, end: float) -> None:
    duration = end - start
    if duration <= 0:
        raise ValueError(f"Invalid trim range: start={start}, end={end}")

    # Always re-encode so the very first frame is a clean keyframe.
    # Stream-copy (`-c copy`) starts at the nearest keyframe BEFORE `start`,
    # leaving the player with corrupt / frozen frames until the next keyframe
    # inside the requested window arrives — the user sees a still image with
    # the progress bar moving.
    #
    # `-ss` BEFORE `-i` (input seeking) makes ffmpeg jump near the target
    # position using the container index before decoding, so it's fast even
    # for large files.  `-t` limits by *duration* (not absolute timestamp).
    result = _run_ffmpeg(
        [
            "-y",
            "-ss",
            str(start),
            "-i",
            input_path,
            "-t",
            str(duration),
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "18",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-movflags",
            "+faststart",
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


@app.post("/api/storyboard-timelines/{timeline_id}/export")
async def storyboard_timeline_export(timeline_id: str):
    if not FFMPEG_PATH:
        raise HTTPException(status_code=500, detail="ffmpeg not found on server")

    timeline = await asyncio.to_thread(get_storyboard_timeline, timeline_id)
    if not timeline:
        raise HTTPException(status_code=404, detail="Timeline not found")

    clips = timeline.get("clips") or []
    if not clips:
        raise HTTPException(status_code=400, detail="Timeline is empty")
    if any(float(clip.get("end") or 0) <= float(clip.get("start") or 0) for clip in clips):
        raise HTTPException(status_code=400, detail="Invalid clip range")

    tmpdir = tempfile.mkdtemp(prefix="storyboard_timeline_")
    zip_path = os.path.join(tmpdir, "clips.zip")
    try:
        await asyncio.to_thread(_export_timeline_zip, timeline, tmpdir, zip_path)

        download_name = await asyncio.to_thread(_timeline_zip_download_name, timeline)
        return FileResponse(
            path=zip_path,
            media_type="application/zip",
            filename=download_name,
            background=BackgroundTask(shutil.rmtree, tmpdir, ignore_errors=True),
        )
    except FileNotFoundError as exc:
        shutil.rmtree(tmpdir, ignore_errors=True)
        raise HTTPException(status_code=404, detail="Source video not found") from exc
    except ValueError as exc:
        shutil.rmtree(tmpdir, ignore_errors=True)
        raise HTTPException(status_code=400, detail="Invalid video filename") from exc
    except Exception:
        shutil.rmtree(tmpdir, ignore_errors=True)
        raise


# --- History ---


class HistoryPayload(BaseModel):
    id: str
    date: int
    keywords: str
    productName: str = ""
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


@app.post("/api/datasets/selection")
async def post_dataset_selection(payload: DatasetSelectionPayload):
    updated = await asyncio.to_thread(
        update_video_selection_by_db_video_id,
        payload.resolved_db_video_id(),
        payload.current_version_index,
        payload.current_search_keywords,
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="dataset not found")
    return {"history": updated}


@app.delete("/api/history/{history_id}")
async def remove_history(history_id: str):
    deleted = await asyncio.to_thread(delete_history, history_id)
    if not deleted:
        return {"error": "not found"}, 404
    return {"ok": True}


@app.delete("/api/datasets/{db_video_id}")
async def remove_dataset(db_video_id: int):
    deleted = await asyncio.to_thread(delete_dataset, db_video_id)
    if deleted is None:
        raise HTTPException(status_code=404, detail="dataset not found")
    return {"ok": True, **deleted}


@app.post("/api/history/{history_id}/product")
async def update_history_product(history_id: str, payload: HistoryProductPayload):
    updated = await asyncio.to_thread(
        update_history_product_name, history_id, payload.product_name
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="history item not found")
    return {"history": updated}


@app.post("/api/datasets/{db_video_id}/product")
async def update_dataset_product(db_video_id: int, payload: DatasetProductPayload):
    updated = await asyncio.to_thread(
        update_dataset_product_name, db_video_id, payload.product_name_override
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="dataset not found")
    return {"history": updated}


@app.get("/api/product-folders")
async def get_product_folders():
    return {"folders": await asyncio.to_thread(list_product_folders)}


@app.post("/api/product-folders")
async def post_product_folder(payload: ProductFolderPayload):
    try:
        return await asyncio.to_thread(create_product_folder, payload.name)
    except ValueError as exc:
        raise _http_exception_for_value_error(exc) from exc


@app.patch("/api/product-folders/{folder_id}")
async def patch_product_folder(folder_id: int, payload: ProductFolderPayload):
    try:
        return await asyncio.to_thread(rename_product_folder, folder_id, payload.name)
    except ValueError as exc:
        raise _http_exception_for_value_error(exc) from exc


@app.delete("/api/product-folders/{folder_id}")
async def remove_product_folder(folder_id: int):
    try:
        return await asyncio.to_thread(delete_product_folder, folder_id)
    except ValueError as exc:
        raise _http_exception_for_value_error(exc) from exc


@app.patch("/api/video-files/{video_file_id}")
async def patch_video_file(video_file_id: int, payload: UpdateVideoFilePayload):
    current_filename = await asyncio.to_thread(get_video_file_filename, video_file_id)
    if current_filename is None:
        raise HTTPException(status_code=404, detail="video file not found")

    normalized_filename = None
    renamed_on_disk = False
    try:
        if payload.filename is not None:
            normalized_filename = validate_video_filename(payload.filename)
            if normalized_filename != current_filename:
                await asyncio.to_thread(
                    rename_video_file, current_filename, normalized_filename
                )
                renamed_on_disk = True
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileExistsError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    try:
        return await asyncio.to_thread(
            update_video_file,
            video_file_id,
            normalized_filename,
            payload.folder_id,
        )
    except ValueError as exc:
        if renamed_on_disk and normalized_filename:
            try:
                await asyncio.to_thread(
                    rename_video_file, normalized_filename, current_filename
                )
            except Exception:
                pass
        raise _http_exception_for_value_error(exc) from exc
    except Exception:
        if renamed_on_disk and normalized_filename:
            try:
                await asyncio.to_thread(
                    rename_video_file, normalized_filename, current_filename
                )
            except Exception:
                pass
        raise
