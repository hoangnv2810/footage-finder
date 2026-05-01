import os
import sqlite3
import tempfile
import time
import unittest

from server import db


LEGACY_MULTI_FOLDER_SCHEMA = """
CREATE TABLE history (
    id TEXT PRIMARY KEY,
    date INTEGER NOT NULL,
    keywords TEXT NOT NULL,
    product_name TEXT NOT NULL DEFAULT ''
);

CREATE TABLE history_video (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    history_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'web',
    product_name_override TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    error TEXT,
    current_version_index INTEGER DEFAULT 0,
    current_search_keywords TEXT NOT NULL DEFAULT '',
    video_file_id INTEGER
);

CREATE TABLE video_version (
    id TEXT PRIMARY KEY,
    video_id INTEGER NOT NULL,
    timestamp INTEGER NOT NULL,
    keywords TEXT NOT NULL DEFAULT '',
    scenes TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE search_result (
    id TEXT PRIMARY KEY,
    video_version_id TEXT NOT NULL,
    keywords TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    scenes TEXT NOT NULL DEFAULT '[]',
    error TEXT,
    UNIQUE(video_version_id, keywords)
);

CREATE TABLE product_folder (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    is_system INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE video_file (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL UNIQUE,
    size_bytes INTEGER NOT NULL,
    modified_at REAL NOT NULL,
    last_scanned INTEGER NOT NULL,
    primary_product_folder_id INTEGER REFERENCES product_folder(id)
);

CREATE TABLE product_folder_video (
    product_folder_id INTEGER NOT NULL REFERENCES product_folder(id) ON DELETE CASCADE,
    video_file_id INTEGER NOT NULL REFERENCES video_file(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    UNIQUE(product_folder_id, video_file_id)
);
"""


class DBVideoAssetTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.temp_dir.name, "test.db")
        self.original_db_path = db.DB_PATH
        self._reset_db_connection()
        db.DB_PATH = self.db_path

    def tearDown(self) -> None:
        db.DB_PATH = self.original_db_path
        self._reset_db_connection()
        self.temp_dir.cleanup()

    def _reset_db_connection(self) -> None:
        conn = getattr(db._local, "conn", None)
        if conn is not None:
            conn.close()
            delattr(db._local, "conn")

    def test_init_db_keeps_primary_folder_and_discards_legacy_linked_folders(self) -> None:
        conn = sqlite3.connect(self.db_path)
        conn.executescript(LEGACY_MULTI_FOLDER_SCHEMA)
        now = 1710000000000
        conn.execute(
            "INSERT INTO product_folder (id, name, is_system, created_at, updated_at) VALUES (1, ?, 0, ?, ?)",
            ("Marketing", now, now),
        )
        conn.execute(
            "INSERT INTO product_folder (id, name, is_system, created_at, updated_at) VALUES (2, ?, 0, ?, ?)",
            ("Mùa hè", now, now),
        )
        conn.execute(
            "INSERT INTO video_file (id, filename, size_bytes, modified_at, last_scanned, primary_product_folder_id) VALUES (1, ?, 10, 0, ?, 1)",
            ("demo.mp4", now),
        )
        conn.execute(
            "INSERT INTO product_folder_video (product_folder_id, video_file_id, created_at) VALUES (1, 1, ?)",
            (now,),
        )
        conn.execute(
            "INSERT INTO product_folder_video (product_folder_id, video_file_id, created_at) VALUES (2, 1, ?)",
            (now,),
        )
        conn.execute(
            "INSERT INTO history (id, date, keywords, product_name) VALUES (?, ?, ?, ?)",
            ("history-1", now, "", "Kem chống nắng"),
        )
        conn.execute(
            "INSERT INTO history_video (history_id, file_name, source, status, current_version_index, current_search_keywords, video_file_id) VALUES (?, ?, 'web', 'success', 0, '', 1)",
            ("history-1", "demo.mp4"),
        )
        conn.execute(
            "INSERT INTO video_version (id, video_id, timestamp, keywords, scenes) VALUES (?, 1, ?, '', '[]')",
            ("version-1", now),
        )
        conn.commit()
        conn.close()

        db.init_db()

        persisted_conn = sqlite3.connect(self.db_path)
        persisted_conn.row_factory = sqlite3.Row
        video_file_row = persisted_conn.execute(
            "SELECT primary_product_folder_id FROM video_file WHERE id = 1"
        ).fetchone()
        self.assertEqual(video_file_row["primary_product_folder_id"], 1)
        self.assertEqual(
            persisted_conn.execute("SELECT COUNT(*) AS cnt FROM product_folder_video").fetchone()["cnt"],
            0,
        )
        persisted_conn.close()

        history_items = db.list_history()
        video = history_items[0]["videos"][0]
        self.assertEqual(video["folder"]["name"], "Marketing")
        self.assertNotIn("primaryFolder", video)
        self.assertNotIn("linkedFolders", video)

    def test_init_db_falls_back_to_unclassified_when_primary_missing(self) -> None:
        conn = sqlite3.connect(self.db_path)
        conn.executescript(LEGACY_MULTI_FOLDER_SCHEMA)
        now = 1710000000000
        conn.execute(
            "INSERT INTO product_folder (id, name, is_system, created_at, updated_at) VALUES (1, ?, 0, ?, ?)",
            ("Mùa hè", now, now),
        )
        conn.execute(
            "INSERT INTO video_file (id, filename, size_bytes, modified_at, last_scanned, primary_product_folder_id) VALUES (1, ?, 10, 0, ?, NULL)",
            ("demo.mp4", now),
        )
        conn.execute(
            "INSERT INTO product_folder_video (product_folder_id, video_file_id, created_at) VALUES (1, 1, ?)",
            (now,),
        )
        conn.execute(
            "INSERT INTO history (id, date, keywords, product_name) VALUES (?, ?, ?, ?)",
            ("history-1", now, "", "Kem chống nắng"),
        )
        conn.execute(
            "INSERT INTO history_video (history_id, file_name, source, status, current_version_index, current_search_keywords, video_file_id) VALUES (?, ?, 'web', 'success', 0, '', 1)",
            ("history-1", "demo.mp4"),
        )
        conn.execute(
            "INSERT INTO video_version (id, video_id, timestamp, keywords, scenes) VALUES (?, 1, ?, '', '[]')",
            ("version-1", now),
        )
        conn.commit()
        conn.close()

        db.init_db()

        history_items = db.list_history()
        video = history_items[0]["videos"][0]
        self.assertEqual(video["folder"]["name"], db.UNCLASSIFIED_FOLDER_NAME)

    def test_update_video_file_and_delete_folder_rehomes_to_unclassified(self) -> None:
        db.init_db()
        saved = db.save_analysis(
            "history-1",
            "demo.mp4",
            "kem",
            [{"start": 0, "end": 1, "description": "scene"}],
            product_name="Kem chống nắng",
        )
        video = saved["history"]["videos"][0]
        video_file_id = video["videoFileId"]

        created_folder = db.create_product_folder("Mùa hè")
        summer_folder = next(
            folder for folder in created_folder["folders"] if folder["name"] == "Mùa hè"
        )

        moved = db.update_video_file(video_file_id, folder_id=summer_folder["id"])
        moved_video = moved["histories"][0]["videos"][0]
        self.assertEqual(moved_video["folder"]["name"], "Mùa hè")

        renamed_folder = db.rename_product_folder(summer_folder["id"], "BST mùa hè")
        renamed_video = renamed_folder["histories"][0]["videos"][0]
        self.assertEqual(renamed_video["folder"]["name"], "BST mùa hè")

        deleted = db.delete_product_folder(summer_folder["id"])
        deleted_video = deleted["histories"][0]["videos"][0]
        self.assertEqual(deleted_video["folder"]["name"], db.UNCLASSIFIED_FOLDER_NAME)
        self.assertNotIn(
            "BST mùa hè", [folder["name"] for folder in deleted["folders"]]
        )

    def test_analysis_does_not_override_manual_folder_assignment(self) -> None:
        db.init_db()
        first = db.save_analysis(
            "history-1",
            "demo.mp4",
            "kem",
            [{"start": 0, "end": 1, "description": "scene"}],
            product_name="Kem chống nắng",
        )
        video = first["history"]["videos"][0]
        video_file_id = video["videoFileId"]

        marketing_folder = next(
            folder
            for folder in db.create_product_folder("Marketing")["folders"]
            if folder["name"] == "Marketing"
        )

        db.update_video_file(video_file_id, folder_id=marketing_folder["id"])

        time.sleep(0.001)
        second = db.save_analysis(
            "history-2",
            "demo.mp4",
            "serum",
            [{"start": 1, "end": 2, "description": "scene 2"}],
            product_name="Serum dưỡng",
        )
        updated_video = next(
            item
            for item in second["history"]["videos"]
            if item["videoFileId"] == video_file_id
        )
        self.assertEqual(updated_video["folder"]["name"], "Marketing")

    def test_duplicate_folder_name_and_system_folder_rules(self) -> None:
        db.init_db()
        existing_folder = next(
            folder
            for folder in db.create_product_folder("Mùa hè")["folders"]
            if folder["name"] == "Mùa hè"
        )
        other_folder = next(
            folder
            for folder in db.create_product_folder("Bán chạy")["folders"]
            if folder["name"] == "Bán chạy"
        )
        unclassified_folder = next(
            folder
            for folder in db.list_product_folders()
            if folder["name"] == db.UNCLASSIFIED_FOLDER_NAME
        )

        with self.assertRaisesRegex(ValueError, "Tên thư mục đã tồn tại"):
            db.create_product_folder("Mùa hè")

        with self.assertRaisesRegex(ValueError, "Không thể đổi tên thư mục hệ thống"):
            db.rename_product_folder(unclassified_folder["id"], "Khác")

        with self.assertRaisesRegex(ValueError, "Không thể xóa thư mục hệ thống"):
            db.delete_product_folder(unclassified_folder["id"])

        with self.assertRaisesRegex(ValueError, "Tên thư mục đã tồn tại"):
            db.rename_product_folder(other_folder["id"], "Mùa hè")


if __name__ == "__main__":
    unittest.main()
