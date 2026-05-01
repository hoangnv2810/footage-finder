import os
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

SERVER_DIR = Path(__file__).resolve().parents[1]
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

import db  # noqa: E402
import main  # noqa: E402


class VideoFileApiTests(unittest.TestCase):
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

    def _create_video_file(self, filename: str) -> None:
        path = self.video_dir / filename
        path.write_bytes(b"fake video data")
        stat = path.stat()
        db.save_video_file(filename, stat.st_size, stat.st_mtime)

    def _scene(self, label: str, start: float, end: float) -> dict:
        return {
            "keyword": label,
            "start": start,
            "end": end,
            "description": f"Mo ta {label}",
            "context": f"Boi canh {label}",
            "subjects": ["san pham"],
            "actions": ["gioi thieu"],
            "mood": "tuoi sang",
            "shot_type": "canh trung",
            "marketing_uses": ["hook"],
            "relevance_notes": f"Ghi chu {label}",
        }

    def test_patch_video_file_rename_updates_all_datasets_and_selection_by_db_video_id(self) -> None:
        self._create_video_file("shared.mp4")

        first = db.save_analysis(
            "history-1",
            "shared.mp4",
            "kem",
            [{"start": 0, "end": 1, "description": "scene 1"}],
            product_name="Kem chống nắng",
        )
        time.sleep(0.001)
        second = db.save_analysis(
            "history-2",
            "shared.mp4",
            "serum",
            [{"start": 1, "end": 2, "description": "scene 2"}],
            product_name="Serum dưỡng",
        )

        first_video = first["history"]["videos"][0]
        second_video = second["history"]["videos"][0]
        self.assertEqual(first_video["videoFileId"], second_video["videoFileId"])

        response = self.client.patch(
            f"/api/video-files/{first_video['videoFileId']}",
            json={"filename": "renamed.mp4"},
        )
        self.assertEqual(response.status_code, 200, response.text)

        payload = response.json()
        histories_by_id = {history["id"]: history for history in payload["histories"]}
        self.assertEqual(
            histories_by_id["history-1"]["videos"][0]["fileName"], "renamed.mp4"
        )
        self.assertEqual(
            histories_by_id["history-2"]["videos"][0]["fileName"], "renamed.mp4"
        )
        self.assertTrue((self.video_dir / "renamed.mp4").is_file())
        self.assertFalse((self.video_dir / "shared.mp4").exists())

        selection_response = self.client.post(
            "/api/datasets/selection",
            json={
                "dbVideoId": second_video["dbVideoId"],
                "current_version_index": 0,
                "current_search_keywords": "duong am",
            },
        )
        self.assertEqual(selection_response.status_code, 200, selection_response.text)

        selected_history = selection_response.json()["history"]
        selected_video = next(
            video
            for video in selected_history["videos"]
            if video["dbVideoId"] == second_video["dbVideoId"]
        )
        self.assertEqual(selected_video["fileName"], "renamed.mp4")
        self.assertEqual(selected_video["currentSearchKeywords"], "duong am")
        self.assertEqual(selected_history["keywords"], "duong am")

    def test_patch_video_file_moves_folder(self) -> None:
        self._create_video_file("move.mp4")
        saved = db.save_analysis(
            "history-1",
            "move.mp4",
            "kem",
            [self._scene("canh-1", 0, 1)],
            product_name="Kem chống nắng",
        )
        video = saved["history"]["videos"][0]

        folder_response = self.client.post(
            "/api/product-folders",
            json={"name": "Marketing"},
        )
        self.assertEqual(folder_response.status_code, 200, folder_response.text)
        marketing_folder = next(
            folder
            for folder in folder_response.json()["folders"]
            if folder["name"] == "Marketing"
        )

        patch_response = self.client.patch(
            f"/api/video-files/{video['videoFileId']}",
            json={"folder_id": marketing_folder["id"]},
        )
        self.assertEqual(patch_response.status_code, 200, patch_response.text)
        moved_video = patch_response.json()["histories"][0]["videos"][0]

        self.assertEqual(moved_video["folder"]["name"], "Marketing")
        self.assertEqual(moved_video["fileName"], "move.mp4")

    def test_patch_video_file_can_rename_and_move_together(self) -> None:
        self._create_video_file("combo.mp4")
        saved = db.save_analysis(
            "history-1",
            "combo.mp4",
            "kem",
            [self._scene("canh-1", 0, 1)],
            product_name="Kem chống nắng",
        )
        video = saved["history"]["videos"][0]

        folder_response = self.client.post(
            "/api/product-folders",
            json={"name": "Mùa hè"},
        )
        self.assertEqual(folder_response.status_code, 200, folder_response.text)
        summer_folder = next(
            folder
            for folder in folder_response.json()["folders"]
            if folder["name"] == "Mùa hè"
        )

        patch_response = self.client.patch(
            f"/api/video-files/{video['videoFileId']}",
            json={"filename": "combo-renamed.mp4", "folder_id": summer_folder["id"]},
        )
        self.assertEqual(patch_response.status_code, 200, patch_response.text)
        updated_video = patch_response.json()["histories"][0]["videos"][0]

        self.assertEqual(updated_video["fileName"], "combo-renamed.mp4")
        self.assertEqual(updated_video["folder"]["name"], "Mùa hè")
        self.assertTrue((self.video_dir / "combo-renamed.mp4").is_file())
        self.assertFalse((self.video_dir / "combo.mp4").exists())

    def test_import_reuses_existing_extension_history_after_rename(self) -> None:
        self._create_video_file("clip.mp4")

        first_import = self.client.post(
            "/api/import-analysis",
            json={
                "filename": "clip.mp4",
                "scenes": [self._scene("canh-1", 0, 1)],
                "product_name": "Kem chống nắng",
            },
        )
        self.assertEqual(first_import.status_code, 200, first_import.text)

        first_payload = first_import.json()
        first_history = first_payload["history"]
        first_video = first_history["videos"][0]
        self.assertEqual(first_history["id"], "import:clip.mp4")
        self.assertEqual(first_video["fileName"], "clip.mp4")
        first_version_id = first_payload["version_id"]

        rename_response = self.client.patch(
            f"/api/video-files/{first_video['videoFileId']}",
            json={"filename": "clip-renamed.mp4"},
        )
        self.assertEqual(rename_response.status_code, 200, rename_response.text)

        second_import = self.client.post(
            "/api/import-analysis",
            json={
                "filename": "clip-renamed.mp4",
                "scenes": [self._scene("canh-2", 1, 2)],
                "product_name": "Kem chống nắng",
            },
        )
        self.assertEqual(second_import.status_code, 200, second_import.text)

        second_payload = second_import.json()
        second_history = second_payload["history"]
        second_video = second_history["videos"][0]
        second_version_id = second_payload["version_id"]
        conn = db._get_conn()
        import_history_rows = conn.execute(
            "SELECT id FROM history WHERE id LIKE 'import:%' ORDER BY id"
        ).fetchall()
        import_dataset_rows = conn.execute(
            "SELECT id, history_id FROM history_video WHERE video_file_id = ? AND source = 'extension'",
            (first_video["videoFileId"],),
        ).fetchall()

        self.assertEqual(second_history["id"], first_history["id"])
        self.assertEqual(second_video["dbVideoId"], first_video["dbVideoId"])
        self.assertEqual(second_video["fileName"], "clip-renamed.mp4")
        self.assertEqual(len(second_video["versions"]), 2)
        self.assertNotEqual(first_version_id, second_version_id)
        self.assertEqual([row["id"] for row in import_history_rows], ["import:clip.mp4"])
        self.assertEqual(len(import_dataset_rows), 1)
        self.assertEqual(import_dataset_rows[0]["history_id"], first_history["id"])

    def test_delete_folder_moves_videos_to_unclassified_and_system_folder_is_immutable(self) -> None:
        self._create_video_file("demo.mp4")
        saved = db.save_analysis(
            "history-1",
            "demo.mp4",
            "kem",
            [{"start": 0, "end": 1, "description": "scene"}],
            product_name="Kem chống nắng",
        )
        video = saved["history"]["videos"][0]

        create_response = self.client.post(
            "/api/product-folders",
            json={"name": "Mùa hè"},
        )
        self.assertEqual(create_response.status_code, 200, create_response.text)
        summer_folder = next(
            folder
            for folder in create_response.json()["folders"]
            if folder["name"] == "Mùa hè"
        )

        rename_response = self.client.patch(
            f"/api/product-folders/{summer_folder['id']}",
            json={"name": "BST mùa hè"},
        )
        self.assertEqual(rename_response.status_code, 200, rename_response.text)
        renamed_folder = next(
            folder
            for folder in rename_response.json()["folders"]
            if folder["name"] == "BST mùa hè"
        )

        move_response = self.client.patch(
            f"/api/video-files/{video['videoFileId']}",
            json={"folder_id": renamed_folder["id"]},
        )
        self.assertEqual(move_response.status_code, 200, move_response.text)
        moved_video = move_response.json()["histories"][0]["videos"][0]
        self.assertEqual(moved_video["folder"]["name"], "BST mùa hè")

        delete_response = self.client.delete(
            f"/api/product-folders/{renamed_folder['id']}"
        )
        self.assertEqual(delete_response.status_code, 200, delete_response.text)
        deleted_payload = delete_response.json()
        deleted_video = deleted_payload["histories"][0]["videos"][0]
        self.assertEqual(deleted_video["folder"]["name"], db.UNCLASSIFIED_FOLDER_NAME)
        self.assertNotIn(
            "BST mùa hè",
            [folder["name"] for folder in deleted_payload["folders"]],
        )

        unclassified_folder = next(
            folder
            for folder in deleted_payload["folders"]
            if folder["name"] == db.UNCLASSIFIED_FOLDER_NAME
        )
        system_rename = self.client.patch(
            f"/api/product-folders/{unclassified_folder['id']}",
            json={"name": "Khác"},
        )
        self.assertEqual(system_rename.status_code, 400, system_rename.text)

        system_delete = self.client.delete(
            f"/api/product-folders/{unclassified_folder['id']}"
        )
        self.assertEqual(system_delete.status_code, 400, system_delete.text)

    def test_patch_video_file_rollback_renamed_file_if_db_update_fails(self) -> None:
        self._create_video_file("rollback.mp4")
        saved = db.save_analysis(
            "history-1",
            "rollback.mp4",
            "kem",
            [self._scene("canh-1", 0, 1)],
            product_name="Kem chống nắng",
        )
        video = saved["history"]["videos"][0]

        with patch("main.update_video_file", side_effect=RuntimeError("db failure")):
            response = self.client.patch(
                f"/api/video-files/{video['videoFileId']}",
                json={"filename": "rolled-back.mp4"},
            )

        self.assertEqual(response.status_code, 500, response.text)
        self.assertTrue((self.video_dir / "rollback.mp4").is_file())
        self.assertFalse((self.video_dir / "rolled-back.mp4").exists())

    def test_patch_video_file_conflict_and_missing_ids(self) -> None:
        self._create_video_file("source.mp4")
        self._create_video_file("taken.mp4")
        saved = db.save_analysis(
            "history-1",
            "source.mp4",
            "kem",
            [{"start": 0, "end": 1, "description": "scene"}],
            product_name="Kem chống nắng",
        )

        video = saved["history"]["videos"][0]
        conflict_response = self.client.patch(
            f"/api/video-files/{video['videoFileId']}",
            json={"filename": "taken.mp4"},
        )
        self.assertEqual(conflict_response.status_code, 400, conflict_response.text)
        self.assertTrue((self.video_dir / "source.mp4").is_file())
        self.assertTrue((self.video_dir / "taken.mp4").is_file())

        missing_folder = self.client.patch(
            f"/api/video-files/{video['videoFileId']}",
            json={"folder_id": 999999},
        )
        self.assertEqual(missing_folder.status_code, 404, missing_folder.text)

        missing_video = self.client.patch(
            "/api/video-files/999999",
            json={"filename": "renamed.mp4"},
        )
        self.assertEqual(missing_video.status_code, 404, missing_video.text)

        missing_folder_rename = self.client.patch(
            "/api/product-folders/999999",
            json={"name": "Không tồn tại"},
        )
        self.assertEqual(missing_folder_rename.status_code, 404, missing_folder_rename.text)

        missing_folder_delete = self.client.delete("/api/product-folders/999999")
        self.assertEqual(missing_folder_delete.status_code, 404, missing_folder_delete.text)


if __name__ == "__main__":
    unittest.main()
