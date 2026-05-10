import pytest

from video_folder import get_video_path


def test_get_video_path_rejects_sibling_path_with_shared_prefix(tmp_path, monkeypatch):
    video_folder = tmp_path / "videos"
    sibling_folder = tmp_path / "videos2"
    video_folder.mkdir()
    sibling_folder.mkdir()
    (sibling_folder / "file.mp4").write_bytes(b"video")
    monkeypatch.setenv("VIDEO_FOLDER", str(video_folder))

    with pytest.raises(ValueError):
        get_video_path("../videos2/file.mp4")
