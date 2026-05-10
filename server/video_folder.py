import os
from pathlib import Path

VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm"}


def get_video_folder() -> Path:
    folder = os.environ.get("VIDEO_FOLDER", "")
    if not folder:
        raise ValueError("VIDEO_FOLDER environment variable is not set")
    p = Path(folder)
    if not p.is_dir():
        raise ValueError(f"VIDEO_FOLDER does not exist: {folder}")
    return p


def scan_folder() -> list[dict]:
    folder = get_video_folder()
    results = []
    for f in sorted(folder.iterdir()):
        if f.is_file() and f.suffix.lower() in VIDEO_EXTENSIONS:
            stat = f.stat()
            results.append({
                "filename": f.name,
                "size_bytes": stat.st_size,
                "size_mb": round(stat.st_size / (1024 * 1024), 1),
                "modified_at": stat.st_mtime,
            })
    return results


def get_video_path(filename: str) -> Path:
    """Resolve a filename within VIDEO_FOLDER, preventing path traversal."""
    folder = get_video_folder().resolve()
    path = (folder / filename).resolve()
    try:
        path.relative_to(folder)
    except ValueError as exc:
        raise ValueError("Invalid filename") from exc
    if not path.is_file():
        raise FileNotFoundError(f"Video not found: {filename}")
    return path


def _ensure_path_in_video_folder(path: Path) -> None:
    try:
        path.resolve().relative_to(get_video_folder().resolve())
    except ValueError as exc:
        raise ValueError("Invalid filename") from exc


def validate_video_filename(filename: str) -> str:
    normalized = Path(filename.strip()).name
    if not normalized:
        raise ValueError("Tên file không được để trống")
    if normalized != filename.strip():
        raise ValueError("Tên file không hợp lệ")
    if Path(normalized).suffix.lower() not in VIDEO_EXTENSIONS:
        raise ValueError("Định dạng video không được hỗ trợ")
    return normalized


def rename_video_file(old_filename: str, new_filename: str) -> str:
    source = get_video_path(old_filename)
    normalized_new_name = validate_video_filename(new_filename)
    if source.name == normalized_new_name:
        raise ValueError("Tên file mới phải khác tên hiện tại")

    destination = (get_video_folder() / normalized_new_name).resolve()
    try:
        _ensure_path_in_video_folder(destination)
    except ValueError as exc:
        raise ValueError("Tên file không hợp lệ") from exc
    if destination.exists():
        raise FileExistsError(f"Video already exists: {normalized_new_name}")

    source.rename(destination)
    return normalized_new_name
