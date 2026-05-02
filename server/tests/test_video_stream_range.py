"""Tests for the `/api/videos/{filename}/stream` Range-aware endpoint.

Regression coverage for the bug where Starlette 0.38.x's `FileResponse`
silently ignored `Range:` headers and returned the entire file with status
200, leaving browsers unable to seek into a video before it was fully
buffered. The user-visible symptom was: clicking some footage matches
played the correct segment while others "played from second 0", purely
based on whether the file was small enough to be fully buffered at click
time.
"""
import os
import sys
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

SERVER_DIR = Path(__file__).resolve().parents[1]
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

import db  # noqa: E402
import main  # noqa: E402


class VideoStreamRangeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.video_dir = Path(self.temp_dir.name) / "videos"
        self.video_dir.mkdir()
        self.db_path = os.path.join(self.temp_dir.name, "test.db")

        self.original_db_path = db.DB_PATH
        self.original_video_folder = os.environ.get("VIDEO_FOLDER")

        self._reset_db_connection()
        db.DB_PATH = self.db_path
        os.environ["VIDEO_FOLDER"] = str(self.video_dir)

        self.client = TestClient(main.app, raise_server_exceptions=False)
        self.client.__enter__()

        # Deterministic ASCII payload makes byte-range assertions trivial.
        self.payload = bytes(range(256)) * 16  # 4096 bytes of pattern.
        self.filename = "demo.mp4"
        path = self.video_dir / self.filename
        path.write_bytes(self.payload)
        stat = path.stat()
        db.save_video_file(self.filename, stat.st_size, stat.st_mtime)

    def tearDown(self) -> None:
        self.client.__exit__(None, None, None)
        db.DB_PATH = self.original_db_path
        self._reset_db_connection()

        if self.original_video_folder is None:
            os.environ.pop("VIDEO_FOLDER", None)
        else:
            os.environ["VIDEO_FOLDER"] = self.original_video_folder

        try:
            self.temp_dir.cleanup()
        except PermissionError:
            pass

    def _reset_db_connection(self) -> None:
        conn = getattr(db._local, "conn", None)
        if conn is not None:
            conn.close()
            delattr(db._local, "conn")

    def test_full_request_advertises_accept_ranges_so_browser_knows_seeking_works(self) -> None:
        # If the response omits `Accept-Ranges`, the browser will not attempt
        # range requests and will fall back to "play whatever is buffered",
        # which is the original bug.
        response = self.client.get(f"/api/videos/{self.filename}/stream")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("accept-ranges"), "bytes")
        self.assertEqual(response.headers.get("content-length"), str(len(self.payload)))
        self.assertEqual(response.content, self.payload)

    def test_partial_range_returns_206_with_correct_content_range_and_body(self) -> None:
        response = self.client.get(
            f"/api/videos/{self.filename}/stream",
            headers={"Range": "bytes=100-199"},
        )
        self.assertEqual(response.status_code, 206)
        self.assertEqual(response.headers.get("accept-ranges"), "bytes")
        self.assertEqual(
            response.headers.get("content-range"),
            f"bytes 100-199/{len(self.payload)}",
        )
        self.assertEqual(response.headers.get("content-length"), "100")
        self.assertEqual(response.content, self.payload[100:200])

    def test_open_ended_range_serves_to_eof(self) -> None:
        # `Range: bytes=N-` is what browsers use when seeking forward.
        start = 3000
        response = self.client.get(
            f"/api/videos/{self.filename}/stream",
            headers={"Range": f"bytes={start}-"},
        )
        self.assertEqual(response.status_code, 206)
        self.assertEqual(
            response.headers.get("content-range"),
            f"bytes {start}-{len(self.payload) - 1}/{len(self.payload)}",
        )
        self.assertEqual(response.content, self.payload[start:])

    def test_suffix_range_serves_last_n_bytes(self) -> None:
        response = self.client.get(
            f"/api/videos/{self.filename}/stream",
            headers={"Range": "bytes=-256"},
        )
        self.assertEqual(response.status_code, 206)
        self.assertEqual(
            response.headers.get("content-range"),
            f"bytes {len(self.payload) - 256}-{len(self.payload) - 1}/{len(self.payload)}",
        )
        self.assertEqual(response.content, self.payload[-256:])

    def test_unsatisfiable_range_returns_416_with_content_range_hint(self) -> None:
        response = self.client.get(
            f"/api/videos/{self.filename}/stream",
            headers={"Range": f"bytes={len(self.payload) + 100}-"},
        )
        self.assertEqual(response.status_code, 416)
        self.assertEqual(
            response.headers.get("content-range"),
            f"bytes */{len(self.payload)}",
        )

    def test_malformed_range_header_returns_416(self) -> None:
        response = self.client.get(
            f"/api/videos/{self.filename}/stream",
            headers={"Range": "bytes=abc-xyz"},
        )
        self.assertEqual(response.status_code, 416)


if __name__ == "__main__":
    unittest.main()
