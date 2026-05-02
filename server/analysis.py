import base64
import json
import logging
import os
import re
from collections.abc import AsyncGenerator
from pathlib import Path
from typing import Any

import httpx

from sse import sse_event

DASHSCOPE_CHAT_URL = (
    "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions"
)
DEFAULT_MODEL = "qwen3.6-plus"
DASHSCOPE_TIMEOUT_SECONDS = float(os.environ.get("DASHSCOPE_TIMEOUT_SECONDS", "600"))
MAX_STORYBOARD_SCENES = 200
logger = logging.getLogger(__name__)
SCENE_STRING_FIELDS = (
    "keyword",
    "description",
    "context",
    "mood",
    "shot_type",
    "relevance_notes",
)
SCENE_LIST_FIELDS = ("subjects", "actions", "marketing_uses")
SCENE_NUMBER_FIELDS = ("start", "end")
SCENE_REQUIRED_FIELDS = SCENE_STRING_FIELDS + SCENE_LIST_FIELDS + SCENE_NUMBER_FIELDS


def _get_api_key() -> str:
    key = os.environ.get("DASHSCOPE_API_KEY", "")
    if not key:
        raise ValueError("DASHSCOPE_API_KEY environment variable is not set")
    return key


def get_model_config() -> dict[str, str]:
    return {
        "video_analysis_model": os.environ.get("VIDEO_ANALYSIS_MODEL", DEFAULT_MODEL),
        "script_planning_model": os.environ.get("SCRIPT_PLANNING_MODEL", DEFAULT_MODEL),
        "scene_matching_model": os.environ.get("SCENE_MATCHING_MODEL", DEFAULT_MODEL),
    }


def _model_for_task(task: str) -> str:
    config = get_model_config()
    mapping = {
        "video_analysis": config["video_analysis_model"],
        "script_planning": config["script_planning_model"],
        "scene_matching": config["scene_matching_model"],
    }
    return mapping[task]


def create_full_analysis_prompt() -> str:
    return (
        "Analyze the full video and split it into meaningful scenes in chronological order.\n"
        "Return ONLY a valid JSON array.\n"
        "Each item must use this exact shape with all fields present:\n"
        '{"keyword":"short Vietnamese scene label","start":12.3,"end":18.7,"description":"Vietnamese description","context":"Vietnamese scene context","subjects":["item"],"actions":["item"],"mood":"Vietnamese mood","shot_type":"Vietnamese shot type","marketing_uses":["item"],"relevance_notes":"Vietnamese note"}\n'
        "Write all text fields in Vietnamese except numbers.\n"
        "Use concise labels.\n"
        "marketing_uses should describe how the scene could be used in marketing, such as hook, problem, solution, benefit, lifestyle, testimonial, social proof, or cta support.\n"
        "The scenes must cover the important content of the whole video.\n"
        "If no useful scenes can be identified, return []."
    )


def create_search_prompt(scenes: list[dict], keywords: str) -> str:
    source_scenes = json.dumps(scenes, ensure_ascii=False)
    return (
        "You are given a JSON array of scenes that were already extracted from a video.\n"
        f"Find the scenes that match these keywords: {keywords}\n"
        "Return ONLY a valid JSON array.\n"
        "Keep the original timing and scene meaning.\n"
        "Preserve any existing metadata fields when possible.\n"
        "If nothing matches, return [].\n\n"
        f"Source scenes:\n{source_scenes}"
    )


def create_script_planning_prompt(product: dict[str, str], script_text: str) -> str:
    product_context = json.dumps(product, ensure_ascii=False)
    return (
        "You are helping build a storyboard for a short marketing video.\n"
        "Split the script into ordered storyboard beats.\n"
        "Return ONLY a valid JSON array.\n"
        "Each beat must use this exact shape:\n"
        '{"id":"beat-1","label":"hook","text":"Vietnamese beat text","intent":"Vietnamese intent","desired_visuals":"Vietnamese visual guidance","duration_hint":3.5}\n'
        "Use Vietnamese for all text fields.\n"
        "Keep the beat order natural for editing.\n"
        "If the script does not fit hook/problem/solution/benefit/cta perfectly, still split it into practical editing beats.\n\n"
        f"Product context:\n{product_context}\n\n"
        f"Script:\n{script_text}"
    )


def create_storyboard_matching_prompt(
    product: dict[str, str], beats: list[dict], candidate_scenes: list[dict]
) -> str:
    product_context = json.dumps(product, ensure_ascii=False)
    beats_json = json.dumps(beats, ensure_ascii=False)
    scenes_json = json.dumps(candidate_scenes, ensure_ascii=False)
    return (
        "You are matching storyboard beats to candidate footage scenes.\n"
        "Some scenes are direct product footage. Some scenes are reusable illustrative B-roll.\n"
        "Your job is to pick the best scenes for each beat.\n"
        "Return ONLY a valid JSON array.\n"
        "Each item must use this exact shape:\n"
        '{"beat_id":"beat-1","matches":[{"candidate_id":"version:scene","score":0.93,"match_reason":"Vietnamese reason","usage_type":"direct_product"}]}\n'
        "score must be between 0 and 1.\n"
        "usage_type must be either direct_product or illustrative_broll.\n"
        "Return up to 5 matches per beat, sorted from best to worst.\n"
        "Prefer variety across beats when possible, but reuse is allowed if a scene is genuinely strong.\n"
        "Use Vietnamese for match_reason.\n\n"
        f"Product context:\n{product_context}\n\n"
        f"Storyboard beats:\n{beats_json}\n\n"
        f"Candidate scenes:\n{scenes_json}"
    )


def _extract_json_payload(response_text: str) -> Any:
    trimmed = response_text.strip()
    candidates = [trimmed]

    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)```", trimmed, re.IGNORECASE)
    if fenced and fenced.group(1):
        candidates.append(fenced.group(1).strip())

    array_start = trimmed.find("[")
    array_end = trimmed.rfind("]")
    if array_start != -1 and array_end != -1 and array_end > array_start:
        candidates.append(trimmed[array_start : array_end + 1])

    object_start = trimmed.find("{")
    object_end = trimmed.rfind("}")
    if object_start != -1 and object_end != -1 and object_end > object_start:
        candidates.append(trimmed[object_start : object_end + 1])

    for candidate in candidates:
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            continue

    raise ValueError("Model trả về dữ liệu JSON không đúng định dạng.")


def _normalize_string_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    return []


def normalize_scene(scene: dict[str, Any]) -> dict[str, Any]:
    return {
        "keyword": str(scene.get("keyword", "")).strip(),
        "start": float(scene.get("start", 0) or 0),
        "end": float(scene.get("end", 0) or 0),
        "description": str(scene.get("description", "")).strip(),
        "context": str(scene.get("context", "")).strip(),
        "subjects": _normalize_string_list(scene.get("subjects")),
        "actions": _normalize_string_list(scene.get("actions")),
        "mood": str(scene.get("mood", "")).strip(),
        "shot_type": str(scene.get("shot_type", "")).strip(),
        "marketing_uses": _normalize_string_list(scene.get("marketing_uses")),
        "relevance_notes": str(scene.get("relevance_notes", "")).strip(),
    }


def validate_import_scenes(payload: Any) -> list[dict[str, Any]]:
    if not isinstance(payload, list):
        raise ValueError("Du lieu import phai la mot JSON array cua scenes.")

    normalized_scenes: list[dict[str, Any]] = []
    for index, scene in enumerate(payload, start=1):
        if not isinstance(scene, dict):
            raise ValueError(f"Scene {index} phai la mot object JSON.")

        missing_fields = [
            field for field in SCENE_REQUIRED_FIELDS if field not in scene
        ]
        if missing_fields:
            raise ValueError(
                f"Scene {index} dang thieu field bat buoc: {', '.join(missing_fields)}."
            )

        for field in SCENE_STRING_FIELDS:
            if not isinstance(scene[field], str):
                raise ValueError(f"Scene {index} co field '{field}' phai la string.")

        for field in SCENE_LIST_FIELDS:
            value = scene[field]
            if not isinstance(value, list):
                raise ValueError(f"Scene {index} co field '{field}' phai la array.")
            if any(not isinstance(item, str) for item in value):
                raise ValueError(
                    f"Scene {index} co field '{field}' chi duoc chua string."
                )

        for field in SCENE_NUMBER_FIELDS:
            value = scene[field]
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise ValueError(f"Scene {index} co field '{field}' phai la number.")

        normalized_scene = normalize_scene(scene)
        if normalized_scene["end"] < normalized_scene["start"]:
            raise ValueError(f"Scene {index} co 'end' phai lon hon hoac bang 'start'.")

        normalized_scenes.append(normalized_scene)

    return normalized_scenes


def extract_scenes(response_text: str) -> list[dict[str, Any]]:
    payload = _extract_json_payload(response_text)
    if not isinstance(payload, list):
        raise ValueError("Model không trả về danh sách scenes hợp lệ.")
    return [
        normalize_scene(scene if isinstance(scene, dict) else {}) for scene in payload
    ]


def extract_script_beats(response_text: str) -> list[dict[str, Any]]:
    payload = _extract_json_payload(response_text)
    if not isinstance(payload, list):
        raise ValueError("Model không trả về danh sách storyboard beat hợp lệ.")

    beats: list[dict[str, Any]] = []
    for index, beat in enumerate(payload, start=1):
        beat_obj = beat if isinstance(beat, dict) else {}
        duration_hint = beat_obj.get("duration_hint")
        try:
            normalized_duration = (
                float(duration_hint) if duration_hint not in (None, "") else None
            )
        except (TypeError, ValueError):
            normalized_duration = None

        beat_id = str(beat_obj.get("id") or f"beat-{index}")
        beats.append(
            {
                "id": beat_id,
                "label": str(beat_obj.get("label") or f"beat-{index}").strip(),
                "text": str(beat_obj.get("text") or "").strip(),
                "intent": str(beat_obj.get("intent") or "").strip(),
                "desiredVisuals": str(beat_obj.get("desired_visuals") or "").strip(),
                "durationHint": normalized_duration,
                "position": index - 1,
            }
        )

    return beats


def _normalize_usage_type(value: Any) -> str:
    return (
        "direct_product"
        if str(value).strip() == "direct_product"
        else "illustrative_broll"
    )


def _normalize_imported_usage_type(value: Any) -> str:
    if value in (None, ""):
        return _normalize_usage_type(value)
    normalized = str(value).strip()
    if normalized not in {"direct_product", "illustrative_broll"}:
        raise ValueError(f"usageType không hợp lệ: {normalized}")
    return normalized


def build_candidate_snapshot(
    candidate_versions: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
    candidate_scenes: list[dict[str, Any]] = []
    candidate_map: dict[str, dict[str, Any]] = {}

    for version in candidate_versions:
        version_id = version["versionId"]
        file_name = version["fileName"]
        scenes = version.get("scenes", [])
        for scene_index, scene in enumerate(scenes):
            normalized_scene = normalize_scene(scene if isinstance(scene, dict) else {})
            candidate_id = f"{version_id}:{scene_index}"
            candidate_entry = {
                "candidate_id": candidate_id,
                "file_name": file_name,
                "video_version_id": version_id,
                "scene_index": scene_index,
                "keyword": normalized_scene["keyword"],
                "description": normalized_scene["description"],
                "context": normalized_scene["context"],
                "subjects": normalized_scene["subjects"],
                "actions": normalized_scene["actions"],
                "mood": normalized_scene["mood"],
                "shot_type": normalized_scene["shot_type"],
                "marketing_uses": normalized_scene["marketing_uses"],
                "relevance_notes": normalized_scene["relevance_notes"],
                "start": normalized_scene["start"],
                "end": normalized_scene["end"],
            }
            candidate_scenes.append(candidate_entry)
            candidate_map[candidate_id] = {
                "videoVersionId": version_id,
                "fileName": file_name,
                "sceneIndex": scene_index,
                "scene": normalized_scene,
            }

    return candidate_scenes, candidate_map


def _normalize_score(value: Any) -> float:
    try:
        score = float(value)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, min(score, 1.0))


def _normalize_imported_beat(beat: Any, index: int) -> dict[str, Any]:
    beat_obj = beat if isinstance(beat, dict) else {}
    duration_hint = beat_obj.get("durationHint", beat_obj.get("duration_hint"))
    try:
        normalized_duration = (
            float(duration_hint) if duration_hint not in (None, "") else None
        )
    except (TypeError, ValueError):
        normalized_duration = None

    return {
        "id": str(beat_obj.get("id") or f"beat-{index + 1}").strip(),
        "label": str(beat_obj.get("label") or f"beat-{index + 1}").strip(),
        "text": str(beat_obj.get("text") or "").strip(),
        "intent": str(beat_obj.get("intent") or "").strip(),
        "desiredVisuals": str(
            beat_obj.get("desiredVisuals", beat_obj.get("desired_visuals")) or ""
        ).strip(),
        "durationHint": normalized_duration,
        "position": beat_obj.get("position", index),
    }


def normalize_imported_storyboard(
    payload: Any, candidate_map: dict[str, dict[str, Any]]
) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("Storyboard import phải là JSON object.")

    raw_beats = payload.get("beats")
    if not isinstance(raw_beats, list) or not raw_beats:
        raise ValueError("Storyboard import thiếu danh sách beat.")

    beats = [_normalize_imported_beat(beat, index) for index, beat in enumerate(raw_beats)]
    by_beat_id: dict[str, list[dict[str, Any]]] = {beat["id"]: [] for beat in beats}

    raw_beat_matches = payload.get("beatMatches", [])
    if not isinstance(raw_beat_matches, list):
        raw_beat_matches = []

    for beat_entry in raw_beat_matches:
        if not isinstance(beat_entry, dict):
            continue
        beat_id = str(beat_entry.get("beatId", beat_entry.get("beat_id")) or "").strip()
        if beat_id not in by_beat_id:
            continue
        matches = beat_entry.get("matches", [])
        if not isinstance(matches, list):
            continue

        normalized_matches: list[dict[str, Any]] = []
        for match in matches[:5]:
            if not isinstance(match, dict):
                continue
            candidate_id = str(
                match.get("candidateId", match.get("candidate_id")) or ""
            ).strip()
            candidate = candidate_map.get(candidate_id)
            if not candidate:
                raise ValueError(f"Không tìm thấy candidate scene: {candidate_id}")

            normalized_matches.append(
                {
                    "id": f"{beat_id}:{candidate_id}",
                    "beatId": beat_id,
                    "videoVersionId": candidate["videoVersionId"],
                    "fileName": candidate["fileName"],
                    "sceneIndex": candidate["sceneIndex"],
                    "score": _normalize_score(match.get("score")),
                    "matchReason": str(
                        match.get("matchReason", match.get("match_reason")) or ""
                    ).strip(),
                    "usageType": _normalize_imported_usage_type(
                        match.get("usageType", match.get("usage_type"))
                    ),
                    "scene": candidate["scene"],
                }
            )
        by_beat_id[beat_id] = normalized_matches

    return {
        "beats": beats,
        "beatMatches": [
            {"beatId": beat["id"], "matches": by_beat_id.get(beat["id"], [])}
            for beat in beats
        ],
        "models": get_model_config(),
    }


def extract_storyboard_matches(
    response_text: str,
    candidate_map: dict[str, dict[str, Any]],
    beats: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    payload = _extract_json_payload(response_text)
    if not isinstance(payload, list):
        raise ValueError("Model không trả về danh sách storyboard match hợp lệ.")

    by_beat_id: dict[str, list[dict[str, Any]]] = {beat["id"]: [] for beat in beats}

    for beat_entry in payload:
        if not isinstance(beat_entry, dict):
            continue
        beat_id = str(beat_entry.get("beat_id") or "").strip()
        if beat_id not in by_beat_id:
            continue

        matches = beat_entry.get("matches", [])
        if not isinstance(matches, list):
            continue

        normalized_matches: list[dict[str, Any]] = []
        for match in matches[:5]:
            if not isinstance(match, dict):
                continue
            candidate_id = str(match.get("candidate_id") or "").strip()
            candidate = candidate_map.get(candidate_id)
            if not candidate:
                continue

            normalized_matches.append(
                {
                    "id": f"{beat_id}:{candidate_id}",
                    "beatId": beat_id,
                    "videoVersionId": candidate["videoVersionId"],
                    "fileName": candidate["fileName"],
                    "sceneIndex": candidate["sceneIndex"],
                    "score": _normalize_score(match.get("score", 0)),
                    "matchReason": str(match.get("match_reason") or "").strip(),
                    "usageType": _normalize_usage_type(match.get("usage_type")),
                    "scene": candidate["scene"],
                }
            )

        by_beat_id[beat_id] = normalized_matches

    return [
        {
            "beatId": beat["id"],
            "matches": by_beat_id.get(beat["id"], []),
        }
        for beat in beats
    ]


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


def _extract_response_text(payload: dict[str, Any]) -> str:
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


async def _request_completion(
    task: str, message_content: str | list[dict[str, Any]]
) -> str:
    api_key = _get_api_key()
    model = _model_for_task(task)
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": message_content}],
        "modalities": ["text"],
    }

    async with httpx.AsyncClient(timeout=httpx.Timeout(DASHSCOPE_TIMEOUT_SECONDS)) as client:
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
        model = _model_for_task("video_analysis")
        logger.info("Starting full analysis for %s with model %s", filepath.name, model)
        yield sse_event(
            "log", {"message": f"Đang phân tích toàn bộ video bằng {model}..."}
        )
        response_text = await _request_completion(
            "video_analysis",
            [
                {"type": "video_url", "video_url": {"url": data_url}},
                {"type": "text", "text": create_full_analysis_prompt()},
            ],
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
    scenes: list[dict[str, Any]], keywords: str
) -> AsyncGenerator[str, None]:
    """Search keywords from an existing full-analysis scene list."""
    try:
        _get_api_key()
    except ValueError as exc:
        logger.error("Missing DASHSCOPE_API_KEY for search analysis")
        yield sse_event("search_error", {"message": str(exc)})
        return

    try:
        model = _model_for_task("scene_matching")
        logger.info("Starting search-from-analysis for keywords: %s", keywords)
        yield sse_event(
            "log",
            {
                "message": f"Đang tìm kiếm trong kết quả phân tích với từ khóa: {keywords}"
            },
        )
        response_text = await _request_completion(
            "scene_matching", create_search_prompt(scenes, keywords)
        )
        matched_scenes = extract_scenes(response_text)
        logger.info(
            "Search-from-analysis finished with model %s for keywords %s and %d matches",
            model,
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


async def generate_storyboard(
    product: dict[str, str], script_text: str, candidate_versions: list[dict[str, Any]]
) -> dict[str, Any]:
    try:
        _get_api_key()
    except ValueError as exc:
        raise ValueError(str(exc)) from exc

    if not script_text.strip():
        raise ValueError("Thiếu nội dung kịch bản để tạo storyboard.")
    if not candidate_versions:
        raise ValueError("Không có video đã phân tích nào để tạo storyboard.")

    candidate_scenes, candidate_map = build_candidate_snapshot(candidate_versions)

    if len(candidate_scenes) > MAX_STORYBOARD_SCENES:
        raise ValueError(
            f"Đã chọn {len(candidate_scenes)} scene để match storyboard. Hãy chọn ít video hơn (tối đa {MAX_STORYBOARD_SCENES} scene)."
        )

    logger.info(
        "Generating storyboard with %d candidate scenes from %d versions",
        len(candidate_scenes),
        len(candidate_versions),
    )
    beats_response = await _request_completion(
        "script_planning", create_script_planning_prompt(product, script_text)
    )
    beats = extract_script_beats(beats_response)
    logger.info("Generated %d storyboard beats", len(beats))

    matches_response = await _request_completion(
        "scene_matching",
        create_storyboard_matching_prompt(product, beats, candidate_scenes),
    )
    beat_matches = extract_storyboard_matches(matches_response, candidate_map, beats)
    logger.info("Generated storyboard matches for %d beats", len(beat_matches))

    return {
        "beats": beats,
        "beatMatches": beat_matches,
        "models": get_model_config(),
    }
