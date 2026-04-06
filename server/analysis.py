import base64
import json
import logging
import os
import re
from collections.abc import AsyncGenerator
from pathlib import Path

import httpx

from sse import sse_event

ANALYSIS_MODEL = "qwen3.6-plus"
DASHSCOPE_CHAT_URL = (
    "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions"
)
logger = logging.getLogger(__name__)


def _get_api_key() -> str:
    key = os.environ.get("DASHSCOPE_API_KEY", "")
    if not key:
        raise ValueError("DASHSCOPE_API_KEY environment variable is not set")
    return key


def create_full_analysis_prompt() -> str:
    return (
        "Analyze the full video and split it into meaningful scenes in chronological order.\n"
        "Return ONLY a valid JSON array.\n"
        "Each item must have this exact shape:\n"
        '{"keyword":"short Vietnamese scene label","start":12.3,"end":18.7,"description":"Vietnamese description"}\n'
        "Write every field in Vietnamese except numbers.\n"
        "Use concise scene labels for keyword.\n"
        "Include the notable scenes needed to understand the entire video.\n"
        "If no useful scenes can be identified, return []."
    )


def create_search_prompt(scenes: list[dict], keywords: str) -> str:
    source_scenes = json.dumps(scenes, ensure_ascii=False)
    return (
        "You are given a JSON array of scenes that were already extracted from a video.\n"
        f"Find the scenes that match these keywords: {keywords}\n"
        "Return ONLY a valid JSON array using the exact same shape as the source scenes.\n"
        "Keep the original start, end, and description values from the source scene.\n"
        "Set keyword to the most relevant matched keyword or short matched phrase in Vietnamese.\n"
        "If nothing matches, return [].\n\n"
        f"Source scenes:\n{source_scenes}"
    )


def extract_scenes(response_text: str) -> list[dict]:
    trimmed = response_text.strip()
    candidates = [trimmed]

    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)```", trimmed, re.IGNORECASE)
    if fenced and fenced.group(1):
        candidates.append(fenced.group(1).strip())

    array_start = trimmed.find("[")
    array_end = trimmed.rfind("]")
    if array_start != -1 and array_end != -1 and array_end > array_start:
        candidates.append(trimmed[array_start : array_end + 1])

    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
            if not isinstance(parsed, list):
                continue
            return [
                {
                    "keyword": str(s.get("keyword", "")),
                    "start": float(s.get("start", 0)),
                    "end": float(s.get("end", 0)),
                    "description": str(s.get("description", "")),
                }
                for s in parsed
            ]
        except (json.JSONDecodeError, ValueError):
            continue

    raise ValueError("Qwen trả về dữ liệu không đúng định dạng JSON scenes.")


def file_to_base64(filepath: Path) -> str:
    return base64.b64encode(filepath.read_bytes()).decode("ascii")


def _get_mime_type(suffix: str) -> str:
    mapping = {
        ".mp4": "video/mp4",
        ".mov": "video/quicktime",
        ".avi": "video/x-msvideo",
        ".mkv": "video/x-matroska",
        ".webm": "video/webm",
    }
    return mapping.get(suffix.lower(), "video/mp4")


def _extract_response_text(payload: dict) -> str:
    content = payload.get("choices", [{}])[0].get("message", {}).get("content", "")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
                continue
            if not isinstance(item, dict):
                continue
            text = item.get("text")
            if isinstance(text, str):
                parts.append(text)
        return "".join(parts)
    return ""


async def _request_completion(message_content: str | list[dict]) -> str:
    api_key = _get_api_key()
    payload = {
        "model": ANALYSIS_MODEL,
        "messages": [{"role": "user", "content": message_content}],
        "modalities": ["text"],
    }

    async with httpx.AsyncClient(timeout=httpx.Timeout(300.0)) as client:
        resp = await client.post(
            DASHSCOPE_CHAT_URL,
            json=payload,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
        )

    if resp.status_code != 200:
        try:
            err = resp.json()
            msg = err.get("error", {}).get("message", resp.text)
        except Exception:
            msg = resp.text
        raise RuntimeError(f"DashScope lỗi: {msg}")

    return _extract_response_text(resp.json())


async def analyze_video_stream(filepath: Path) -> AsyncGenerator[str, None]:
    """Analyze a video into full-scene results and yield SSE events."""
    try:
        _get_api_key()
    except ValueError as exc:
        logger.error("Missing DASHSCOPE_API_KEY for full analysis")
        yield sse_event("error", {"message": str(exc)})
        return

    size_mb = round(filepath.stat().st_size / (1024 * 1024), 1)
    logger.info("Reading video %s (%.1f MB)", filepath.name, size_mb)
    yield sse_event(
        "log", {"message": f"Đang đọc video {filepath.name} ({size_mb} MB)..."}
    )
    yield sse_event("log", {"message": "Đang chuyển video sang base64..."})

    b64 = file_to_base64(filepath)
    mime = _get_mime_type(filepath.suffix)
    data_url = f"data:{mime};base64,{b64}"
    del b64

    try:
        logger.info(
            "Starting full analysis for %s with model %s", filepath.name, ANALYSIS_MODEL
        )
        yield sse_event(
            "log", {"message": f"Đang phân tích toàn bộ video bằng {ANALYSIS_MODEL}..."}
        )
        response_text = await _request_completion(
            [
                {"type": "video_url", "video_url": {"url": data_url}},
                {"type": "text", "text": create_full_analysis_prompt()},
            ]
        )
        scenes = extract_scenes(response_text)
        logger.info(
            "Full analysis finished for %s with %d scenes", filepath.name, len(scenes)
        )
        yield sse_event(
            "log",
            {"message": f"Đã phân tích xong {len(scenes)} phân cảnh toàn bộ video"},
        )
        yield sse_event("full_result", {"scenes": scenes})
    except Exception as exc:
        logger.exception("Full analysis failed for %s", filepath.name)
        yield sse_event("error", {"message": str(exc)})


async def search_analysis_stream(
    scenes: list[dict], keywords: str
) -> AsyncGenerator[str, None]:
    """Search keywords from an existing full-analysis scene list."""
    try:
        _get_api_key()
    except ValueError as exc:
        logger.error("Missing DASHSCOPE_API_KEY for search analysis")
        yield sse_event("search_error", {"message": str(exc)})
        return

    try:
        logger.info("Starting search-from-analysis for keywords: %s", keywords)
        yield sse_event(
            "log",
            {
                "message": f"Đang tìm kiếm trong kết quả phân tích với từ khóa: {keywords}"
            },
        )
        response_text = await _request_completion(
            create_search_prompt(scenes, keywords)
        )
        matched_scenes = extract_scenes(response_text)
        logger.info(
            "Search-from-analysis finished for keywords %s with %d matches",
            keywords,
            len(matched_scenes),
        )
        yield sse_event(
            "log", {"message": f"Tìm thấy {len(matched_scenes)} phân cảnh khớp từ khóa"}
        )
        yield sse_event("search_result", {"scenes": matched_scenes})
    except Exception as exc:
        logger.exception("Search-from-analysis failed for keywords %s", keywords)
        yield sse_event("search_error", {"message": str(exc)})
