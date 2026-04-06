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
    folder = get_video_folder()
    path = (folder / filename).resolve()
    if not str(path).startswith(str(folder.resolve())):
        raise ValueError("Invalid filename")
    if not path.is_file():
        raise FileNotFoundError(f"Video not found: {filename}")
    return path
