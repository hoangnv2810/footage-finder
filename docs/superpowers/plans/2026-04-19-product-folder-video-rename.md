# Product Folder And Video Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add logical product folders, multi-folder video membership, and safe physical filename renaming without breaking saved analysis history.

**Architecture:** Promote `video_file` into the physical asset identity, attach logical folder membership and primary-folder state to that asset, and keep `history_video` as the stable dataset identity used by versions, search results, and UI selection. Backend owns migrations, rename safety, and folder mutations; frontend consumes the richer history payload and updates the Library sidebar and detail panel around the new folder and rename workflows.

**Tech Stack:** FastAPI, SQLite, React 18, TypeScript, Vitest, Testing Library, Python `unittest`

---

## File Structure

- Modify: `server/db.py` - schema migration, backfills, folder helpers, asset rename metadata updates, dataset selection by `dbVideoId`, history serialization
- Modify: `server/main.py` - request/response models, new folder and video-file routes, selection route migration
- Modify: `server/video_folder.py` - filename validation and filesystem rename helper
- Create: `server/tests/__init__.py` - test package marker
- Create: `server/tests/test_db_video_assets.py` - DB-level coverage for migration, folder membership, and rename metadata
- Create: `server/tests/test_main_video_files_api.py` - API-level coverage for rename, folder routes, import reuse, and selection
- Modify: `src/lib/footage-app.ts` - new folder/video-file types, API wrappers, selector updates, fallback normalization
- Create: `src/lib/footage-app.test.ts` - selector and normalization coverage for folder metadata
- Modify: `vite.config.ts` - Vitest `jsdom` setup
- Create: `src/test/setup.ts` - Testing Library matchers
- Modify: `src/components/library/types.ts` - folder-aware UI types
- Modify: `src/components/library/ProductVideoList.tsx` - folder toolbar, folder action buttons, folder grouping UI
- Modify: `src/components/library/ProductGroup.tsx` - folder header actions and counts
- Modify: `src/components/library/VideoListItem.tsx` - linked-folder badge and folder-aware metadata row
- Modify: `src/components/library/VideoDetailPanel.tsx` - host the new asset-management block
- Modify: `src/pages/LibraryPage.tsx` - pass folder data and callbacks into the library shell
- Create: `src/components/library/FolderFormDialog.tsx` - create/rename folder dialog
- Create: `src/components/library/DeleteFolderDialog.tsx` - delete-folder confirmation with replacement folder choice
- Create: `src/components/library/RenameVideoFileDialog.tsx` - rename physical file dialog with collision warning state
- Create: `src/components/library/VideoAssetManager.tsx` - folder membership and rename controls for the selected video
- Create: `src/components/library/ProductVideoList.test.tsx` - sidebar rendering coverage
- Create: `src/components/library/VideoAssetManager.test.tsx` - detail-panel asset-management coverage
- Modify: `src/App.tsx` - product-folder state, mutation wiring, rename handlers, selection route migration

### Task 1: Persist Video Asset And Folder Metadata In SQLite

**Files:**
- Create: `server/tests/__init__.py`
- Create: `server/tests/test_db_video_assets.py`
- Modify: `server/db.py`

- [ ] **Step 1: Write the failing DB migration and serialization test**

```python
import sqlite3
import tempfile
import unittest
from pathlib import Path

from server import db

LEGACY_SCHEMA = """
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
    current_search_keywords TEXT NOT NULL DEFAULT ''
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

CREATE TABLE video_file (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL UNIQUE,
    size_bytes INTEGER NOT NULL,
    modified_at REAL NOT NULL,
    last_scanned INTEGER NOT NULL
);
"""


class DBVideoAssetTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tempdir.name) / "data.db"
        if hasattr(db._local, "conn"):
            db._local.conn.close()
            delattr(db._local, "conn")
        db.DB_PATH = str(self.db_path)

    def tearDown(self):
        if hasattr(db._local, "conn"):
            db._local.conn.close()
            delattr(db._local, "conn")
        self.tempdir.cleanup()

    def test_init_db_backfills_video_file_and_folder_payload(self):
        conn = sqlite3.connect(self.db_path)
        conn.executescript(LEGACY_SCHEMA)
        conn.execute(
            "INSERT INTO history (id, date, keywords, product_name) VALUES (?, ?, ?, ?)",
            ("import:kem_chong_nang.mp4", 1710000000000, "", "Kem chống nắng"),
        )
        conn.execute(
            "INSERT INTO history_video (history_id, file_name, source, product_name_override, status, current_version_index, current_search_keywords) VALUES (?, ?, ?, ?, ?, ?, ?)",
            ("import:kem_chong_nang.mp4", "kem_chong_nang.mp4", "extension", "", "success", 0, ""),
        )
        conn.execute(
            "INSERT INTO video_version (id, video_id, timestamp, keywords, scenes) VALUES (?, ?, ?, ?, ?)",
            ("v1", 1, 1710000000000, "", "[]"),
        )
        conn.commit()
        conn.close()

        db.init_db()
        items = db.list_history()

        self.assertEqual(len(items), 1)
        video = items[0]["videos"][0]
        self.assertIsInstance(video["videoFileId"], int)
        self.assertEqual(video["primaryFolder"]["name"], "Kem chống nắng")
        self.assertEqual(video["linkedFolders"], [video["primaryFolder"]])
```

- [ ] **Step 2: Run the DB test to verify it fails**

Run: `python -m unittest server.tests.test_db_video_assets.DBVideoAssetTests.test_init_db_backfills_video_file_and_folder_payload -v`

Expected: FAIL with a payload assertion such as `KeyError: 'videoFileId'` or a missing-column error for the new folder tables.

- [ ] **Step 3: Write the minimal migration and serialization implementation**

```python
# server/db.py
UNCATEGORIZED_FOLDER_NAME = "Chưa phân loại"


def _normalize_folder_name(name: str) -> str:
    normalized = " ".join((name or "").strip().split())
    return normalized or UNCATEGORIZED_FOLDER_NAME


def _ensure_uncategorized_folder(conn: sqlite3.Connection) -> int:
    row = conn.execute(
        "SELECT id FROM product_folder WHERE is_system = 1 LIMIT 1"
    ).fetchone()
    if row:
        return int(row["id"])

    cur = conn.execute(
        "INSERT INTO product_folder (name, is_system, created_at, updated_at) VALUES (?, 1, ?, ?)",
        (UNCATEGORIZED_FOLDER_NAME, int(time.time() * 1000), int(time.time() * 1000)),
    )
    return int(cur.lastrowid)


def _upsert_video_file(conn: sqlite3.Connection, filename: str) -> int:
    row = conn.execute(
        "SELECT id FROM video_file WHERE filename = ?",
        (filename,),
    ).fetchone()
    if row:
        return int(row["id"])

    cur = conn.execute(
        "INSERT INTO video_file (filename, size_bytes, modified_at, last_scanned) VALUES (?, 0, 0, ?)",
        (filename, int(time.time() * 1000)),
    )
    return int(cur.lastrowid)


def _link_folder(conn: sqlite3.Connection, video_file_id: int, folder_id: int) -> None:
    conn.execute(
        "INSERT OR IGNORE INTO product_folder_video (product_folder_id, video_file_id, created_at) VALUES (?, ?, ?)",
        (folder_id, video_file_id, int(time.time() * 1000)),
    )


def _list_linked_folders(conn: sqlite3.Connection, video_file_id: int) -> list[dict]:
    rows = conn.execute(
        """
        SELECT pf.id, pf.name, pf.is_system
        FROM product_folder pf
        JOIN product_folder_video pfv ON pfv.product_folder_id = pf.id
        WHERE pfv.video_file_id = ?
        ORDER BY pf.name COLLATE NOCASE, pf.id
        """,
        (video_file_id,),
    ).fetchall()
    return [
        {"id": int(row["id"]), "name": row["name"], "isSystem": bool(row["is_system"])}
        for row in rows
    ]


def _folder_payload(conn: sqlite3.Connection, video_file_id: int) -> tuple[dict, list[dict]]:
    row = conn.execute(
        """
        SELECT vf.primary_product_folder_id, pf.name, pf.is_system
        FROM video_file vf
        LEFT JOIN product_folder pf ON pf.id = vf.primary_product_folder_id
        WHERE vf.id = ?
        """,
        (video_file_id,),
    ).fetchone()
    linked = _list_linked_folders(conn, video_file_id)
    primary = next((folder for folder in linked if folder["id"] == row["primary_product_folder_id"]), None) if row else None
    if primary is None:
        uncategorized_id = _ensure_uncategorized_folder(conn)
        _link_folder(conn, video_file_id, uncategorized_id)
        linked = _list_linked_folders(conn, video_file_id)
        primary = next(folder for folder in linked if folder["id"] == uncategorized_id)
        conn.execute(
            "UPDATE video_file SET primary_product_folder_id = ? WHERE id = ?",
            (uncategorized_id, video_file_id),
        )
    return primary, linked


def _backfill_video_file_links(conn: sqlite3.Connection) -> None:
    rows = conn.execute("SELECT id, file_name FROM history_video WHERE video_file_id IS NULL").fetchall()
    for row in rows:
        video_file_id = _upsert_video_file(conn, row["file_name"])
        conn.execute(
            "UPDATE history_video SET video_file_id = ? WHERE id = ?",
            (video_file_id, row["id"]),
        )


def _backfill_product_folders(conn: sqlite3.Connection) -> None:
    uncategorized_id = _ensure_uncategorized_folder(conn)
    rows = conn.execute(
        """
        SELECT hv.video_file_id, h.product_name, hv.product_name_override, MAX(h.date) AS newest_date
        FROM history_video hv
        JOIN history h ON h.id = hv.history_id
        GROUP BY hv.id
        ORDER BY newest_date DESC
        """
    ).fetchall()
    chosen_primary: set[int] = set()
    for row in rows:
        video_file_id = int(row["video_file_id"])
        folder_name = _normalize_folder_name(row["product_name_override"] or row["product_name"])
        folder = conn.execute(
            "SELECT id, is_system FROM product_folder WHERE LOWER(name) = LOWER(?)",
            (folder_name,),
        ).fetchone()
        if folder:
            folder_id = int(folder["id"])
        else:
            cur = conn.execute(
                "INSERT INTO product_folder (name, is_system, created_at, updated_at) VALUES (?, 0, ?, ?)",
                (folder_name, int(time.time() * 1000), int(time.time() * 1000)),
            )
            folder_id = int(cur.lastrowid)
        _link_folder(conn, video_file_id, folder_id)
        if video_file_id not in chosen_primary:
            conn.execute(
                "UPDATE video_file SET primary_product_folder_id = ? WHERE id = ?",
                (folder_id or uncategorized_id, video_file_id),
            )
            chosen_primary.add(video_file_id)


def init_db() -> None:
    conn = _get_conn()
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS history (
            id TEXT PRIMARY KEY,
            date INTEGER NOT NULL,
            keywords TEXT NOT NULL,
            product_name TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS history_video (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            history_id TEXT NOT NULL REFERENCES history(id) ON DELETE CASCADE,
            file_name TEXT NOT NULL,
            video_file_id INTEGER REFERENCES video_file(id) ON DELETE SET NULL,
            source TEXT NOT NULL DEFAULT 'web',
            product_name_override TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'pending',
            error TEXT,
            current_version_index INTEGER DEFAULT 0,
            current_search_keywords TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS product_folder (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            is_system INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS product_folder_video (
            product_folder_id INTEGER NOT NULL REFERENCES product_folder(id) ON DELETE CASCADE,
            video_file_id INTEGER NOT NULL REFERENCES video_file(id) ON DELETE CASCADE,
            created_at INTEGER NOT NULL,
            PRIMARY KEY (product_folder_id, video_file_id)
        );

        CREATE TABLE IF NOT EXISTS video_file (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL UNIQUE,
            size_bytes INTEGER NOT NULL,
            modified_at REAL NOT NULL,
            last_scanned INTEGER NOT NULL,
            primary_product_folder_id INTEGER REFERENCES product_folder(id) ON DELETE SET NULL
        );
        """
    )

    if not _has_column(conn, "history_video", "video_file_id"):
        conn.execute(
            "ALTER TABLE history_video ADD COLUMN video_file_id INTEGER REFERENCES video_file(id)"
        )
    if not _has_column(conn, "video_file", "primary_product_folder_id"):
        conn.execute(
            "ALTER TABLE video_file ADD COLUMN primary_product_folder_id INTEGER REFERENCES product_folder(id)"
        )

    _backfill_video_file_links(conn)
    _backfill_product_folders(conn)
    conn.commit()


def _video_row_to_dict(row: sqlite3.Row, versions: list[dict], search_results: list[dict], history_product_name: str) -> dict:
    if versions:
        current_version_index = min(max(int(row["current_version_index"] or 0), 0), len(versions) - 1)
        current_version_id = versions[current_version_index]["id"]
        scenes = versions[current_version_index]["scenes"]
    else:
        current_version_index = 0
        current_version_id = None
        scenes = []

    current_search_keywords = row["current_search_keywords"] or ""
    active_search = _active_search_result(search_results, current_version_id, current_search_keywords)
    primary_folder, linked_folders = _folder_payload(_get_conn(), int(row["video_file_id"]))

    return {
        "dbVideoId": int(row["id"]),
        "videoFileId": int(row["video_file_id"]),
        "fileName": row["file_name"],
        "source": row["source"],
        "productNameOverride": row["product_name_override"] or "",
        "resolvedProductName": _resolve_product_name(history_product_name, row["product_name_override"] or ""),
        "primaryFolder": primary_folder,
        "linkedFolders": linked_folders,
        "status": row["status"],
        "error": row["error"],
        "scenes": scenes,
        "versions": versions,
        "currentVersionIndex": current_version_index,
        "searchResults": search_results,
        "currentSearchKeywords": current_search_keywords,
        "matchedScenes": active_search["scenes"] if active_search else [],
        "searchError": active_search["error"] if active_search else None,
    }


def save_history(item: dict[str, Any]) -> dict:
    conn = _get_conn()
    existing = conn.execute("SELECT id FROM history WHERE id = ?", (item["id"],)).fetchone()
    if existing:
        conn.execute(
            "UPDATE history SET date = ?, keywords = ?, product_name = COALESCE(?, product_name) WHERE id = ?",
            (item["date"], item.get("keywords", ""), item.get("productName") or None, item["id"]),
        )
    else:
        conn.execute(
            "INSERT INTO history (id, date, keywords, product_name) VALUES (?, ?, ?, ?)",
            (item["id"], item["date"], item.get("keywords", ""), item.get("productName", "")),
        )

    for video in item.get("videos", []):
        video_file_id = _upsert_video_file(conn, video["fileName"])
        existing_video = conn.execute(
            "SELECT id FROM history_video WHERE history_id = ? AND video_file_id = ?",
            (item["id"], video_file_id),
        ).fetchone()
        if existing_video:
            conn.execute(
                """
                UPDATE history_video
                SET file_name = ?, status = ?, error = ?, source = COALESCE(?, source), product_name_override = COALESCE(?, product_name_override), current_version_index = ?, current_search_keywords = ?
                WHERE id = ?
                """,
                (
                    video["fileName"],
                    video.get("status", "pending"),
                    video.get("error"),
                    video.get("source"),
                    video.get("productNameOverride") or None,
                    video.get("currentVersionIndex", 0),
                    video.get("currentSearchKeywords", ""),
                    existing_video["id"],
                ),
            )
        else:
            conn.execute(
                """
                INSERT INTO history_video (
                    history_id, file_name, video_file_id, source, product_name_override, status, error, current_version_index, current_search_keywords
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    item["id"],
                    video["fileName"],
                    video_file_id,
                    video.get("source", "web"),
                    video.get("productNameOverride", ""),
                    video.get("status", "pending"),
                    video.get("error"),
                    video.get("currentVersionIndex", 0),
                    video.get("currentSearchKeywords", ""),
                ),
            )

    conn.commit()
    return _get_history_item(item["id"])
```

- [ ] **Step 4: Run the DB test again to verify it passes**

Run: `python -m unittest server.tests.test_db_video_assets.DBVideoAssetTests.test_init_db_backfills_video_file_and_folder_payload -v`

Expected: PASS with `OK`.

- [ ] **Step 5: Commit the migration work**

```bash
git add server/db.py server/tests/__init__.py server/tests/test_db_video_assets.py
git commit -m "feat: persist video asset folder metadata"
```

### Task 2: Add Folder Mutation Helpers At The DB Layer

**Files:**
- Modify: `server/db.py`
- Modify: `server/tests/test_db_video_assets.py`

- [ ] **Step 1: Write the failing folder mutation tests**

```python
def _seed_video(db_module: object) -> dict:
    db_module.init_db()
    db_module.save_video_file("serum.mp4", 256, 1.0)
    return db_module.save_history(
        {
            "id": "history-serum",
            "date": 1710000000001,
            "keywords": "serum",
            "productName": "Chưa gán sản phẩm",
            "videos": [
                {
                    "fileName": "serum.mp4",
                    "source": "web",
                    "status": "success",
                    "scenes": [],
                    "versions": [],
                    "currentVersionIndex": 0,
                    "currentSearchKeywords": "",
                }
            ],
        }
    )


class DBVideoAssetTests(unittest.TestCase):
    def test_create_rename_and_delete_folder_rehomes_primary_video(self):
        saved = _seed_video(db)
        video = saved["videos"][0]

        summer = db.create_product_folder("Combo mùa hè")
        self.assertEqual(summer["name"], "Combo mùa hè")

        add_result = db.add_video_file_to_folder(video["videoFileId"], summer["id"])
        self.assertEqual(add_result["histories"][0]["videos"][0]["linkedFolders"][-1]["name"], "Combo mùa hè")

        primary_result = db.set_video_file_primary_folder(video["videoFileId"], summer["id"])
        self.assertEqual(primary_result["histories"][0]["videos"][0]["primaryFolder"]["name"], "Combo mùa hè")

        promo = db.create_product_folder("Ưu đãi livestream")
        delete_result = db.delete_product_folder(summer["id"], promo["id"])
        moved_video = delete_result["histories"][0]["videos"][0]
        self.assertEqual(moved_video["primaryFolder"]["name"], "Ưu đãi livestream")
        self.assertNotIn("Combo mùa hè", [folder["name"] for folder in delete_result["folders"]])
```

- [ ] **Step 2: Run the folder mutation test to verify it fails**

Run: `python -m unittest server.tests.test_db_video_assets.DBVideoAssetTests.test_create_rename_and_delete_folder_rehomes_primary_video -v`

Expected: FAIL with `AttributeError` for `create_product_folder` or a mismatched folder payload.

- [ ] **Step 3: Write the minimal folder mutation helpers**

```python
# server/db.py
def list_product_folders() -> list[dict]:
    conn = _get_conn()
    rows = conn.execute(
        """
        SELECT pf.id, pf.name, pf.is_system, COUNT(CASE WHEN vf.primary_product_folder_id = pf.id THEN 1 END) AS video_count
        FROM product_folder pf
        LEFT JOIN product_folder_video pfv ON pfv.product_folder_id = pf.id
        LEFT JOIN video_file vf ON vf.id = pfv.video_file_id
        GROUP BY pf.id, pf.name, pf.is_system
        ORDER BY pf.is_system DESC, pf.name COLLATE NOCASE, pf.id
        """
    ).fetchall()
    return [
        {
            "id": int(row["id"]),
            "name": row["name"],
            "isSystem": bool(row["is_system"]),
            "videoCount": int(row["video_count"] or 0),
        }
        for row in rows
    ]


def _history_items_for_video_file(conn: sqlite3.Connection, video_file_id: int) -> list[dict]:
    rows = conn.execute(
        "SELECT DISTINCT history_id FROM history_video WHERE video_file_id = ? ORDER BY history_id",
        (video_file_id,),
    ).fetchall()
    return [_get_history_item(row["history_id"]) for row in rows if _get_history_item(row["history_id"]) is not None]


def create_product_folder(name: str) -> dict:
    conn = _get_conn()
    normalized = _normalize_folder_name(name)
    cur = conn.execute(
        "INSERT INTO product_folder (name, is_system, created_at, updated_at) VALUES (?, 0, ?, ?)",
        (normalized, int(time.time() * 1000), int(time.time() * 1000)),
    )
    conn.commit()
    return {"id": int(cur.lastrowid), "name": normalized, "isSystem": False, "videoCount": 0}


def rename_product_folder(folder_id: int, name: str) -> dict | None:
    conn = _get_conn()
    row = conn.execute("SELECT is_system FROM product_folder WHERE id = ?", (folder_id,)).fetchone()
    if not row:
        return None
    if row["is_system"]:
        raise ValueError("System folder cannot be renamed")
    normalized = _normalize_folder_name(name)
    conn.execute(
        "UPDATE product_folder SET name = ?, updated_at = ? WHERE id = ?",
        (normalized, int(time.time() * 1000), folder_id),
    )
    conn.commit()
    return next(folder for folder in list_product_folders() if folder["id"] == folder_id)


def add_video_file_to_folder(video_file_id: int, folder_id: int) -> dict | None:
    conn = _get_conn()
    if not conn.execute("SELECT 1 FROM video_file WHERE id = ?", (video_file_id,)).fetchone():
        return None
    if not conn.execute("SELECT 1 FROM product_folder WHERE id = ?", (folder_id,)).fetchone():
        return None
    _link_folder(conn, video_file_id, folder_id)
    conn.commit()
    return {"folders": list_product_folders(), "histories": _history_items_for_video_file(conn, video_file_id)}


def set_video_file_primary_folder(video_file_id: int, folder_id: int) -> dict | None:
    conn = _get_conn()
    if not conn.execute("SELECT 1 FROM video_file WHERE id = ?", (video_file_id,)).fetchone():
        return None
    if not conn.execute("SELECT 1 FROM product_folder WHERE id = ?", (folder_id,)).fetchone():
        return None
    _link_folder(conn, video_file_id, folder_id)
    conn.execute(
        "UPDATE video_file SET primary_product_folder_id = ? WHERE id = ?",
        (folder_id, video_file_id),
    )
    conn.commit()
    return {"folders": list_product_folders(), "histories": _history_items_for_video_file(conn, video_file_id)}


def remove_video_file_from_folder(video_file_id: int, folder_id: int) -> dict | None:
    conn = _get_conn()
    row = conn.execute(
        "SELECT primary_product_folder_id FROM video_file WHERE id = ?",
        (video_file_id,),
    ).fetchone()
    if not row:
        return None
    linked = _list_linked_folders(conn, video_file_id)
    if len(linked) <= 1:
        raise ValueError("Video must remain linked to at least one folder")
    if int(row["primary_product_folder_id"] or 0) == folder_id:
        raise ValueError("Choose a new primary folder before removing the current one")
    conn.execute(
        "DELETE FROM product_folder_video WHERE product_folder_id = ? AND video_file_id = ?",
        (folder_id, video_file_id),
    )
    conn.commit()
    return {"folders": list_product_folders(), "histories": _history_items_for_video_file(conn, video_file_id)}


def delete_product_folder(folder_id: int, replacement_folder_id: int) -> dict | None:
    conn = _get_conn()
    folder = conn.execute(
        "SELECT id, is_system FROM product_folder WHERE id = ?",
        (folder_id,),
    ).fetchone()
    if not folder:
        return None
    if folder["is_system"]:
        raise ValueError("System folder cannot be deleted")
    if not conn.execute("SELECT 1 FROM product_folder WHERE id = ?", (replacement_folder_id,)).fetchone():
        raise ValueError("Replacement folder is required")

    affected_video_rows = conn.execute(
        "SELECT id FROM video_file WHERE primary_product_folder_id = ?",
        (folder_id,),
    ).fetchall()
    for video_row in affected_video_rows:
        _link_folder(conn, int(video_row["id"]), replacement_folder_id)
        conn.execute(
            "UPDATE video_file SET primary_product_folder_id = ? WHERE id = ?",
            (replacement_folder_id, int(video_row["id"])),
        )

    conn.execute("DELETE FROM product_folder_video WHERE product_folder_id = ?", (folder_id,))
    conn.execute("DELETE FROM product_folder WHERE id = ?", (folder_id,))
    conn.commit()

    histories: list[dict] = []
    for video_row in affected_video_rows:
        histories.extend(_history_items_for_video_file(conn, int(video_row["id"])))
    return {"folders": list_product_folders(), "histories": histories}
```

- [ ] **Step 4: Run the folder mutation test again to verify it passes**

Run: `python -m unittest server.tests.test_db_video_assets.DBVideoAssetTests.test_create_rename_and_delete_folder_rehomes_primary_video -v`

Expected: PASS with `OK`.

- [ ] **Step 5: Commit the DB mutation helpers**

```bash
git add server/db.py server/tests/test_db_video_assets.py
git commit -m "feat: add product folder mutation helpers"
```

### Task 3: Add Rename And Selection Routes Around Stable IDs

**Files:**
- Modify: `server/video_folder.py`
- Modify: `server/db.py`
- Modify: `server/main.py`
- Create: `server/tests/test_main_video_files_api.py`

- [ ] **Step 1: Write the failing API test for rename and dataset selection**

```python
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from server import db
from server.main import app


class VideoFileApiTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.video_dir = Path(self.tempdir.name) / "videos"
        self.video_dir.mkdir()
        self.db_path = Path(self.tempdir.name) / "data.db"
        (self.video_dir / "old_name.mp4").write_bytes(b"video-data")
        if hasattr(db._local, "conn"):
            db._local.conn.close()
            delattr(db._local, "conn")
        db.DB_PATH = str(self.db_path)
        db.init_db()
        self.video_file_id = db.save_video_file("old_name.mp4", 9, 1.0)
        first = db.save_history(
            {
                "id": "web-history-1",
                "date": 1710000001000,
                "keywords": "serum",
                "productName": "Combo mùa hè",
                "videos": [{"fileName": "old_name.mp4", "source": "web", "status": "success", "scenes": [], "versions": [], "currentVersionIndex": 0, "currentSearchKeywords": ""}],
            }
        )
        second = db.save_history(
            {
                "id": "web-history-2",
                "date": 1710000002000,
                "keywords": "ugc",
                "productName": "Combo mùa hè",
                "videos": [{"fileName": "old_name.mp4", "source": "web", "status": "success", "scenes": [], "versions": [], "currentVersionIndex": 0, "currentSearchKeywords": ""}],
            }
        )
        self.first_dataset_id = first["videos"][0]["dbVideoId"]
        self.second_dataset_id = second["videos"][0]["dbVideoId"]
        self.client = TestClient(app)

    def tearDown(self):
        if hasattr(db._local, "conn"):
            db._local.conn.close()
            delattr(db._local, "conn")
        self.tempdir.cleanup()

    def test_rename_endpoint_updates_all_datasets_and_selection_uses_db_video_id(self):
        response = self.client.post(
            f"/api/video-files/{self.video_file_id}/rename",
            json={"filename": "new_name.mp4"},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        names = {video["fileName"] for history in payload["histories"] for video in history["videos"]}
        self.assertEqual(names, {"new_name.mp4"})

        selection = self.client.post(
            "/api/datasets/selection",
            json={"db_video_id": self.first_dataset_id, "current_version_index": 0, "current_search_keywords": "hero shot"},
        )
        self.assertEqual(selection.status_code, 200)
        selected = next(video for video in selection.json()["history"]["videos"] if video["dbVideoId"] == self.first_dataset_id)
        self.assertEqual(selected["currentSearchKeywords"], "hero shot")

    def test_folder_routes_return_updated_folder_and_history_payload(self):
        create = self.client.post("/api/product-folders", json={"name": "Landing page"})
        self.assertEqual(create.status_code, 200)
        created_folder = next(folder for folder in create.json()["folders"] if folder["name"] == "Landing page")

        linked = self.client.post(
            f"/api/video-files/{self.video_file_id}/folders",
            json={"folder_id": created_folder["id"]},
        )
        self.assertEqual(linked.status_code, 200)

        primary = self.client.post(
            f"/api/video-files/{self.video_file_id}/primary-folder",
            json={"folder_id": created_folder["id"]},
        )
        self.assertEqual(primary.status_code, 200)
        self.assertEqual(primary.json()["histories"][0]["videos"][0]["primaryFolder"]["name"], "Landing page")
```

- [ ] **Step 2: Run the API test to verify it fails**

Run: `python -m unittest server.tests.test_main_video_files_api.VideoFileApiTests -v`

Expected: FAIL with `404 Not Found` for `/api/video-files/1/rename`, `/api/datasets/selection`, or `/api/product-folders`.

- [ ] **Step 3: Write the minimal route and filesystem implementation**

```python
# server/video_folder.py
def validate_video_filename(filename: str) -> str:
    candidate = Path(filename.strip()).name
    if not candidate or candidate in {".", ".."}:
        raise ValueError("filename is required")
    if candidate != filename.strip():
        raise ValueError("Invalid filename")
    if Path(candidate).suffix.lower() not in VIDEO_EXTENSIONS:
        raise ValueError("Unsupported video extension")
    return candidate


def rename_video_file(current_filename: str, new_filename: str) -> tuple[str, int, float]:
    current_name = validate_video_filename(current_filename)
    target_name = validate_video_filename(new_filename)
    folder = get_video_folder()
    current_path = get_video_path(current_name)
    target_path = folder / target_name
    same_name = current_name.casefold() == target_name.casefold()
    if not same_name and target_path.exists():
        raise FileExistsError(f"Video already exists: {target_name}")
    current_path.rename(target_path)
    stat = target_path.stat()
    return target_path.name, stat.st_size, stat.st_mtime


# server/db.py
def get_video_file_by_id(video_file_id: int) -> sqlite3.Row | None:
    conn = _get_conn()
    return conn.execute(
        "SELECT * FROM video_file WHERE id = ?",
        (video_file_id,),
    ).fetchone()


def update_video_selection_by_id(db_video_id: int, current_version_index: int, current_search_keywords: str) -> dict | None:
    conn = _get_conn()
    row = conn.execute(
        "SELECT history_id FROM history_video WHERE id = ?",
        (db_video_id,),
    ).fetchone()
    if not row:
        return None
    now = int(time.time() * 1000)
    conn.execute(
        "UPDATE history SET date = ?, keywords = ? WHERE id = ?",
        (now, current_search_keywords, row["history_id"]),
    )
    conn.execute(
        "UPDATE history_video SET current_version_index = ?, current_search_keywords = ? WHERE id = ?",
        (current_version_index, current_search_keywords, db_video_id),
    )
    conn.commit()
    return _get_history_item(row["history_id"])


def rename_video_asset(video_file_id: int, new_filename: str, size_bytes: int, modified_at: float) -> dict | None:
    conn = _get_conn()
    row = conn.execute(
        "SELECT filename FROM video_file WHERE id = ?",
        (video_file_id,),
    ).fetchone()
    if not row:
        return None
    now = int(time.time() * 1000)
    conn.execute(
        "UPDATE video_file SET filename = ?, size_bytes = ?, modified_at = ?, last_scanned = ? WHERE id = ?",
        (new_filename, size_bytes, modified_at, now, video_file_id),
    )
    conn.execute(
        "UPDATE history_video SET file_name = ? WHERE video_file_id = ?",
        (new_filename, video_file_id),
    )
    history_rows = conn.execute(
        "SELECT DISTINCT history_id FROM history_video WHERE video_file_id = ?",
        (video_file_id,),
    ).fetchall()
    for history_row in history_rows:
        conn.execute(
            "UPDATE history SET date = ? WHERE id = ?",
            (now, history_row["history_id"]),
        )
    conn.commit()
    return {"histories": _history_items_for_video_file(conn, video_file_id), "folders": list_product_folders()}


# server/main.py
class DatasetSelectionPayload(BaseModel):
    db_video_id: int
    current_version_index: int
    current_search_keywords: str = ""


class ProductFolderPayload(BaseModel):
    name: str


class DeleteProductFolderPayload(BaseModel):
    replacement_folder_id: int | None = None
    move_to_uncategorized: bool = False


class VideoFileRenamePayload(BaseModel):
    filename: str


class VideoFileFolderPayload(BaseModel):
    folder_id: int


@app.post("/api/datasets/selection")
async def post_dataset_selection(payload: DatasetSelectionPayload):
    updated = await asyncio.to_thread(
        update_video_selection_by_id,
        payload.db_video_id,
        payload.current_version_index,
        payload.current_search_keywords,
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="dataset not found")
    return {"history": updated}


@app.get("/api/product-folders")
async def get_product_folders():
    folders = await asyncio.to_thread(list_product_folders)
    return {"folders": folders}


@app.post("/api/product-folders")
async def create_product_folder_route(payload: ProductFolderPayload):
    try:
        await asyncio.to_thread(create_product_folder, payload.name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"folders": await asyncio.to_thread(list_product_folders)}


@app.patch("/api/product-folders/{folder_id}")
async def rename_product_folder_route(folder_id: int, payload: ProductFolderPayload):
    try:
        updated = await asyncio.to_thread(rename_product_folder, folder_id, payload.name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if updated is None:
        raise HTTPException(status_code=404, detail="folder not found")
    return {"folders": await asyncio.to_thread(list_product_folders)}


@app.delete("/api/product-folders/{folder_id}")
async def delete_product_folder_route(folder_id: int, payload: DeleteProductFolderPayload):
    replacement_folder_id = payload.replacement_folder_id
    if payload.move_to_uncategorized:
        folders = await asyncio.to_thread(list_product_folders)
        uncategorized = next((folder for folder in folders if folder["isSystem"]), None)
        replacement_folder_id = uncategorized["id"] if uncategorized else None
    try:
        updated = await asyncio.to_thread(delete_product_folder, folder_id, replacement_folder_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if updated is None:
        raise HTTPException(status_code=404, detail="folder not found")
    return updated


@app.post("/api/video-files/{video_file_id}/rename")
async def rename_video_file_route(video_file_id: int, payload: VideoFileRenamePayload):
    row = await asyncio.to_thread(get_video_file_by_id, video_file_id)
    if row is None:
        raise HTTPException(status_code=404, detail="video file not found")
    try:
        final_name, size_bytes, modified_at = await asyncio.to_thread(
            rename_video_file,
            row["filename"],
            payload.filename,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileExistsError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    try:
        updated = await asyncio.to_thread(rename_video_asset, video_file_id, final_name, size_bytes, modified_at)
    except Exception:
        await asyncio.to_thread(rename_video_file, final_name, row["filename"])
        raise
    if updated is None:
        raise HTTPException(status_code=404, detail="video file not found")
    return updated


@app.post("/api/video-files/{video_file_id}/folders")
async def add_video_file_to_folder_route(video_file_id: int, payload: VideoFileFolderPayload):
    try:
        updated = await asyncio.to_thread(add_video_file_to_folder, video_file_id, payload.folder_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if updated is None:
        raise HTTPException(status_code=404, detail="video file or folder not found")
    return updated


@app.delete("/api/video-files/{video_file_id}/folders/{folder_id}")
async def remove_video_file_from_folder_route(video_file_id: int, folder_id: int):
    try:
        updated = await asyncio.to_thread(remove_video_file_from_folder, video_file_id, folder_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if updated is None:
        raise HTTPException(status_code=404, detail="video file not found")
    return updated


@app.post("/api/video-files/{video_file_id}/primary-folder")
async def set_video_file_primary_folder_route(video_file_id: int, payload: VideoFileFolderPayload):
    try:
        updated = await asyncio.to_thread(set_video_file_primary_folder, video_file_id, payload.folder_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if updated is None:
        raise HTTPException(status_code=404, detail="video file or folder not found")
    return updated
```

- [ ] **Step 4: Run the API test again to verify it passes**

Run: `python -m unittest server.tests.test_main_video_files_api.VideoFileApiTests.test_rename_endpoint_updates_all_datasets_and_selection_uses_db_video_id -v`

Expected: PASS with `OK`.

- [ ] **Step 5: Commit the rename and selection route work**

```bash
git add server/video_folder.py server/db.py server/main.py server/tests/test_main_video_files_api.py
git commit -m "feat: add video rename and dataset selection routes"
```

### Task 4: Keep Import And Save Flows Stable After Rename

**Files:**
- Modify: `server/db.py`
- Modify: `server/main.py`
- Modify: `server/tests/test_main_video_files_api.py`

- [ ] **Step 1: Write the failing test for import reuse after rename**

```python
SCENES = [{"keyword": "hero", "start": 0.0, "end": 1.2, "description": "Hero bottle"}]


class VideoFileApiTests(unittest.TestCase):
    def test_import_reuses_existing_extension_history_after_rename(self):
        (self.video_dir / "import_me.mp4").write_bytes(b"import-video")
        import_video_file_id = db.save_video_file("import_me.mp4", 11, 1.0)
        first = db.save_import_analysis(import_video_file_id, "import_me.mp4", SCENES, "Sữa rửa mặt")

        renamed_path = self.video_dir / "import_me_v2.mp4"
        (self.video_dir / "import_me.mp4").rename(renamed_path)
        db.rename_video_asset(import_video_file_id, "import_me_v2.mp4", 11, 2.0)

        second = db.save_import_analysis(import_video_file_id, "import_me_v2.mp4", SCENES, "Sữa rửa mặt")
        self.assertEqual(first["history"]["id"], second["history"]["id"])
        self.assertEqual(second["history"]["videos"][0]["fileName"], "import_me_v2.mp4")
```

- [ ] **Step 2: Run the import reuse test to verify it fails**

Run: `python -m unittest server.tests.test_main_video_files_api.VideoFileApiTests.test_import_reuses_existing_extension_history_after_rename -v`

Expected: FAIL because `save_import_analysis()` still keys extension history off the old filename.

- [ ] **Step 3: Write the minimal import/save changes**

```python
# server/db.py
def get_video_file_by_id(video_file_id: int) -> sqlite3.Row | None:
    conn = _get_conn()
    return conn.execute(
        "SELECT * FROM video_file WHERE id = ?",
        (video_file_id,),
    ).fetchone()


def save_video_file(filename: str, size_bytes: int, modified_at: float) -> int:
    conn = _get_conn()
    now = int(time.time() * 1000)
    conn.execute(
        """
        INSERT INTO video_file (filename, size_bytes, modified_at, last_scanned)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(filename) DO UPDATE SET size_bytes = ?, modified_at = ?, last_scanned = ?
        """,
        (filename, size_bytes, modified_at, now, size_bytes, modified_at, now),
    )
    row = conn.execute("SELECT id FROM video_file WHERE filename = ?", (filename,)).fetchone()
    conn.commit()
    return int(row["id"])


def _existing_import_history_id(conn: sqlite3.Connection, video_file_id: int) -> str | None:
    row = conn.execute(
        "SELECT history_id FROM history_video WHERE video_file_id = ? AND source = 'extension' ORDER BY id LIMIT 1",
        (video_file_id,),
    ).fetchone()
    return row["history_id"] if row else None


def save_import_analysis(video_file_id: int, filename: str, scenes: list[dict], product_name: str = "") -> dict:
    conn = _get_conn()
    now = int(time.time() * 1000)
    history_id = _existing_import_history_id(conn, video_file_id) or _import_history_id(filename)

    existing_history = conn.execute("SELECT id FROM history WHERE id = ?", (history_id,)).fetchone()
    if existing_history:
        conn.execute(
            "UPDATE history SET date = ?, keywords = '', product_name = CASE WHEN product_name = '' AND ? != '' THEN ? ELSE product_name END WHERE id = ?",
            (now, product_name.strip(), product_name.strip(), history_id),
        )
    else:
        conn.execute(
            "INSERT INTO history (id, date, keywords, product_name) VALUES (?, ?, '', ?)",
            (history_id, now, product_name.strip()),
        )

    hv = conn.execute(
        "SELECT id FROM history_video WHERE history_id = ? AND video_file_id = ?",
        (history_id, video_file_id),
    ).fetchone()
    if hv:
        video_id = hv["id"]
        conn.execute(
            "UPDATE history_video SET file_name = ?, source = 'extension' WHERE id = ?",
            (filename, video_id),
        )
    else:
        cur = conn.execute(
            """
            INSERT INTO history_video (
                history_id, file_name, video_file_id, source, product_name_override, status, current_version_index, current_search_keywords
            ) VALUES (?, ?, ?, 'extension', '', 'success', 0, '')
            """,
            (history_id, filename, video_file_id),
        )
        video_id = cur.lastrowid

    version_id = str(now)
    conn.execute(
        "INSERT INTO video_version (id, video_id, timestamp, keywords, scenes) VALUES (?, ?, ?, '', ?)",
        (version_id, video_id, now, json.dumps(scenes, ensure_ascii=False)),
    )
    conn.commit()
    return {"history": _get_history_item(history_id), "version_id": version_id, "is_duplicate": False}


def save_analysis(history_id: str, filename: str, keywords: str, scenes: list[dict], product_name: str = "") -> dict:
    conn = _get_conn()
    now = int(time.time() * 1000)
    video_file_id = _upsert_video_file(conn, filename)
    existing = conn.execute(
        "SELECT id FROM history WHERE id = ?",
        (history_id,),
    ).fetchone()
    if not existing:
        conn.execute(
            "INSERT INTO history (id, date, keywords, product_name) VALUES (?, ?, ?, ?)",
            (history_id, now, keywords, product_name.strip()),
        )
    else:
        conn.execute(
            "UPDATE history SET date = ?, keywords = ?, product_name = CASE WHEN ? != '' THEN ? ELSE product_name END WHERE id = ?",
            (now, keywords, product_name.strip(), product_name.strip(), history_id),
        )

    hv = conn.execute(
        "SELECT id FROM history_video WHERE history_id = ? AND video_file_id = ?",
        (history_id, video_file_id),
    ).fetchone()
    if hv is None:
        cur = conn.execute(
            """
            INSERT INTO history_video (
                history_id, file_name, video_file_id, source, product_name_override, status, current_version_index, current_search_keywords
            ) VALUES (?, ?, ?, 'web', '', 'success', 0, '')
            """,
            (history_id, filename, video_file_id),
        )
        video_id = cur.lastrowid
    else:
        video_id = hv["id"]
        conn.execute(
            "UPDATE history_video SET file_name = ?, source = 'web', status = 'success', error = NULL WHERE id = ?",
            (filename, video_id),
        )

    version_id = str(now)
    conn.execute(
        "INSERT INTO video_version (id, video_id, timestamp, keywords, scenes) VALUES (?, ?, ?, ?, ?)",
        (version_id, video_id, now, keywords, json.dumps(scenes, ensure_ascii=False)),
    )

    version_count = conn.execute(
        "SELECT COUNT(*) AS cnt FROM video_version WHERE video_id = ?",
        (video_id,),
    ).fetchone()["cnt"]
    conn.execute(
        "UPDATE history_video SET file_name = ?, status = 'success', error = NULL, current_version_index = ?, current_search_keywords = '' WHERE id = ?",
        (filename, version_count - 1, video_id),
    )
    conn.commit()
    return {"history": _get_history_item(history_id), "version_id": version_id}


def save_analysis_error(history_id: str, filename: str, keywords: str, error_msg: str, product_name: str = "") -> None:
    conn = _get_conn()
    now = int(time.time() * 1000)
    video_file_id = _upsert_video_file(conn, filename)

    existing = conn.execute("SELECT id FROM history WHERE id = ?", (history_id,)).fetchone()
    if not existing:
        conn.execute(
            "INSERT INTO history (id, date, keywords, product_name) VALUES (?, ?, ?, ?)",
            (history_id, now, keywords, product_name.strip()),
        )
    else:
        conn.execute(
            "UPDATE history SET date = ?, keywords = ?, product_name = CASE WHEN ? != '' THEN ? ELSE product_name END WHERE id = ?",
            (now, keywords, product_name.strip(), product_name.strip(), history_id),
        )

    hv = conn.execute(
        "SELECT id FROM history_video WHERE history_id = ? AND video_file_id = ?",
        (history_id, video_file_id),
    ).fetchone()
    if hv:
        conn.execute(
            "UPDATE history_video SET file_name = ?, status = 'error', error = ?, source = 'web', current_search_keywords = '' WHERE id = ?",
            (filename, error_msg, hv["id"]),
        )
    else:
        conn.execute(
            """
            INSERT INTO history_video (
                history_id, file_name, video_file_id, source, product_name_override, status, error, current_version_index, current_search_keywords
            ) VALUES (?, ?, ?, 'web', '', 'error', ?, 0, '')
            """,
            (history_id, filename, video_file_id, error_msg),
        )

    conn.commit()
```

```python
# server/main.py
@app.post("/api/import-analysis")
async def import_analysis(req: ImportAnalysisRequest):
    resolved_filename = await asyncio.to_thread(_resolve_library_filename, req.filename)
    scenes = validate_import_scenes(req.scenes)
    video_path = await asyncio.to_thread(get_video_path, resolved_filename)
    stat = await asyncio.to_thread(video_path.stat)
    video_file_id = await asyncio.to_thread(save_video_file, resolved_filename, stat.st_size, stat.st_mtime)
    saved = await asyncio.to_thread(save_import_analysis, video_file_id, resolved_filename, scenes, req.product_name)
    return saved
```

- [ ] **Step 4: Run the import reuse test again to verify it passes**

Run: `python -m unittest server.tests.test_main_video_files_api.VideoFileApiTests.test_import_reuses_existing_extension_history_after_rename -v`

Expected: PASS with `OK`.

- [ ] **Step 5: Commit the stable import/save flow updates**

```bash
git add server/db.py server/main.py server/tests/test_main_video_files_api.py
git commit -m "feat: preserve import history across video renames"
```

### Task 5: Extend Frontend Types, Selectors, And API Clients

**Files:**
- Modify: `vite.config.ts`
- Create: `src/test/setup.ts`
- Modify: `src/lib/footage-app.ts`
- Create: `src/lib/footage-app.test.ts`

- [ ] **Step 1: Write the failing selector test for folder-aware datasets**

```ts
import { describe, expect, it } from 'vitest';

import { buildDatasetItems, normalizeVideo, type HistoryItem } from './footage-app';

describe('buildDatasetItems', () => {
  it('maps videoFileId and folder metadata into dataset items', () => {
    const history: HistoryItem[] = [
      {
        id: 'history-1',
        date: 1710000000000,
        keywords: 'serum',
        productName: 'Kem chống nắng',
        videos: [
          normalizeVideo({
            dbVideoId: 8,
            videoFileId: 3,
            fileName: 'hero.mp4',
            source: 'web',
            primaryFolder: { id: 11, name: 'Kem chống nắng', isSystem: false },
            linkedFolders: [
              { id: 11, name: 'Kem chống nắng', isSystem: false },
              { id: 12, name: 'Combo mùa hè', isSystem: false },
            ],
            scenes: [],
            status: 'success',
            versions: [],
            currentVersionIndex: 0,
            currentSearchKeywords: '',
          }),
        ],
      },
    ];

    const datasets = buildDatasetItems(history);

    expect(datasets[0].videoFileId).toBe(3);
    expect(datasets[0].productName).toBe('Kem chống nắng');
    expect(datasets[0].primaryFolder.name).toBe('Kem chống nắng');
    expect(datasets[0].linkedFolders).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the frontend selector test to verify it fails**

Run: `npm run test -- src/lib/footage-app.test.ts`

Expected: FAIL with TypeScript or assertion errors because `videoFileId`, `primaryFolder`, and `linkedFolders` do not exist yet in the frontend types.

- [ ] **Step 3: Write the minimal frontend type and API implementation**

```ts
// vite.config.ts
export default defineConfig(({ mode }) => ({
  server: {
    host: '0.0.0.0',
    port: 3000,
    hmr: process.env.DISABLE_HMR === 'true'
      ? false
      : {
          overlay: false,
        },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
  },
  plugins: [react(), mode === 'development' && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime', '@tanstack/react-query', '@tanstack/query-core'],
  },
}));
```

```ts
// src/test/setup.ts
import '@testing-library/jest-dom';
```

```ts
// src/lib/footage-app.ts
export interface ProductFolder {
  id: number;
  name: string;
  isSystem: boolean;
  videoCount: number;
}

export interface FolderSummary {
  id: number;
  name: string;
  isSystem: boolean;
}

export interface LibraryMutationResult {
  histories: HistoryItem[];
  folders: ProductFolder[];
}

export interface VideoResult {
  dbVideoId?: number;
  videoFileId?: number;
  fileName: string;
  source: DatasetSource;
  productNameOverride?: string;
  resolvedProductName?: string;
  primaryFolder?: FolderSummary;
  linkedFolders?: FolderSummary[];
  scenes: Scene[];
  status: 'pending' | 'analyzing' | 'success' | 'error';
  error?: string;
  versions?: VideoVersion[];
  currentVersionIndex?: number;
  searchResults?: SearchResult[];
  currentSearchKeywords?: string;
  matchedScenes?: Scene[];
  searchError?: string | null;
  viewMode?: ViewMode;
}

export interface DatasetItem extends VideoResult {
  datasetId: string;
  historyId: string;
  updatedAt: number;
  historyKeywords: string;
  productName: string;
  videoFileId: number;
  primaryFolder: FolderSummary;
  linkedFolders: FolderSummary[];
}

const buildFallbackFolder = (video: VideoResult): FolderSummary => ({
  id: -1,
  name: video.resolvedProductName || FALLBACK_PRODUCT_NAME,
  isSystem: (video.resolvedProductName || FALLBACK_PRODUCT_NAME) === FALLBACK_PRODUCT_NAME,
});

export const normalizeVideo = (video: VideoResult): VideoResult => {
  const versions = video.versions || [];
  const currentVersionIndex = versions.length > 0
    ? Math.min(Math.max(video.currentVersionIndex ?? versions.length - 1, 0), versions.length - 1)
    : 0;
  const currentVersion = versions[currentVersionIndex];
  const fullScenes = currentVersion?.scenes || video.scenes || [];
  const currentSearchKeywords = video.currentSearchKeywords || '';
  const searchResults = video.searchResults || [];
  const activeSearch = currentVersion && currentSearchKeywords
    ? searchResults.find((result) => result.versionId === currentVersion.id && result.keywords === currentSearchKeywords)
    : undefined;
  const matchedScenes = activeSearch?.scenes || [];
  const searchError = activeSearch?.error || null;
  const defaultViewMode: ViewMode = currentSearchKeywords ? 'matched' : 'full';
  const viewMode = video.viewMode === 'matched' && !currentSearchKeywords
    ? 'full'
    : (video.viewMode || defaultViewMode);
  const fallbackFolder = buildFallbackFolder(video);
  const primaryFolder = video.primaryFolder || fallbackFolder;
  const linkedFolders = video.linkedFolders?.length ? video.linkedFolders : [primaryFolder];

  return {
    ...video,
    source: video.source || 'web',
    productNameOverride: video.productNameOverride || '',
    resolvedProductName: video.resolvedProductName || primaryFolder.name,
    primaryFolder,
    linkedFolders,
    scenes: viewMode === 'matched' ? matchedScenes : fullScenes,
    versions,
    currentVersionIndex,
    searchResults,
    currentSearchKeywords,
    matchedScenes,
    searchError,
    viewMode,
  };
};

export const buildDatasetItems = (items: HistoryItem[]): DatasetItem[] => items.flatMap((item) =>
  item.videos.map((video) => {
    const normalizedVideo = normalizeVideo(video);
    return {
      ...normalizedVideo,
      datasetId: String(normalizedVideo.dbVideoId ?? `${item.id}:${normalizedVideo.fileName}`),
      historyId: item.id,
      updatedAt: item.date,
      historyKeywords: item.keywords,
      productName: normalizedVideo.primaryFolder?.name || FALLBACK_PRODUCT_NAME,
      videoFileId: normalizedVideo.videoFileId ?? -1,
      primaryFolder: normalizedVideo.primaryFolder || buildFallbackFolder(normalizedVideo),
      linkedFolders: normalizedVideo.linkedFolders || [buildFallbackFolder(normalizedVideo)],
    };
  }),
);

async function readJsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new Error(payload?.detail || `Server lỗi: ${res.status}`);
  }
  return res.json();
}

export const api = {
  async history(): Promise<HistoryItem[]> {
    const res = await fetch('/api/history');
    if (!res.ok) return [];
    return res.json();
  },

  async listProductFolders(): Promise<ProductFolder[]> {
    const res = await fetch('/api/product-folders');
    return readJsonOrThrow<{ folders: ProductFolder[] }>(res).then((payload) => payload.folders);
  },

  async createProductFolder(name: string): Promise<ProductFolder[]> {
    const res = await fetch('/api/product-folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    return readJsonOrThrow<{ folders: ProductFolder[] }>(res).then((payload) => payload.folders);
  },

  async renameProductFolder(folderId: number, name: string): Promise<ProductFolder[]> {
    const res = await fetch(`/api/product-folders/${folderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    return readJsonOrThrow<{ folders: ProductFolder[] }>(res).then((payload) => payload.folders);
  },

  async deleteProductFolder(folderId: number, replacementFolderId: number | null): Promise<LibraryMutationResult> {
    const res = await fetch(`/api/product-folders/${folderId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ replacement_folder_id: replacementFolderId, move_to_uncategorized: replacementFolderId === null }),
    });
    return readJsonOrThrow<LibraryMutationResult>(res);
  },

  async renameVideoFile(videoFileId: number, filename: string): Promise<LibraryMutationResult> {
    const res = await fetch(`/api/video-files/${videoFileId}/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename }),
    });
    return readJsonOrThrow<LibraryMutationResult>(res);
  },

  async addVideoFileToFolder(videoFileId: number, folderId: number): Promise<LibraryMutationResult> {
    const res = await fetch(`/api/video-files/${videoFileId}/folders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder_id: folderId }),
    });
    return readJsonOrThrow<LibraryMutationResult>(res);
  },

  async removeVideoFileFromFolder(videoFileId: number, folderId: number): Promise<LibraryMutationResult> {
    const res = await fetch(`/api/video-files/${videoFileId}/folders/${folderId}`, {
      method: 'DELETE',
    });
    return readJsonOrThrow<LibraryMutationResult>(res);
  },

  async setVideoFilePrimaryFolder(videoFileId: number, folderId: number): Promise<LibraryMutationResult> {
    const res = await fetch(`/api/video-files/${videoFileId}/primary-folder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder_id: folderId }),
    });
    return readJsonOrThrow<LibraryMutationResult>(res);
  },

  async updateVideoSelection(dbVideoId: string, currentVersionIndex: number, currentSearchKeywords: string): Promise<HistoryItem> {
    const res = await fetch('/api/datasets/selection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ db_video_id: Number(dbVideoId), current_version_index: currentVersionIndex, current_search_keywords: currentSearchKeywords }),
    });
    const payload = await readJsonOrThrow<{ history: HistoryItem }>(res);
    return payload.history;
  },
};
```

- [ ] **Step 4: Run the frontend selector test again to verify it passes**

Run: `npm run test -- src/lib/footage-app.test.ts`

Expected: PASS with `1 passed`.

- [ ] **Step 5: Commit the frontend data-layer changes**

```bash
git add vite.config.ts src/test/setup.ts src/lib/footage-app.ts src/lib/footage-app.test.ts
git commit -m "feat: add folder-aware library data model"
```

### Task 6: Render Folder-Aware Library Sidebar

**Files:**
- Modify: `src/components/library/types.ts`
- Modify: `src/components/library/ProductVideoList.tsx`
- Modify: `src/components/library/ProductGroup.tsx`
- Modify: `src/components/library/VideoListItem.tsx`
- Modify: `src/pages/LibraryPage.tsx`
- Create: `src/components/library/ProductVideoList.test.tsx`

- [ ] **Step 1: Write the failing sidebar rendering test**

```tsx
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { ProductVideoList } from './ProductVideoList';
import type { LibraryProduct } from './types';

const products: LibraryProduct[] = [
  {
    id: 'folder-1',
    folderId: 1,
    name: 'Kem chống nắng',
    isSystem: false,
    videos: [
      {
        id: 'dataset-1',
        datasetId: 'dataset-1',
        videoFileId: 7,
        fileName: 'hero.mp4',
        source: 'Web',
        versions: 1,
        currentVersion: 1,
        updatedAt: '09:00 19/04/2026',
        status: 'success',
        productId: 'folder-1',
        duration: '0:12',
        scenes: [],
        matchedScenes: [],
        hasSearchResults: false,
        primaryFolder: { id: 1, name: 'Kem chống nắng', isSystem: false },
        linkedFolders: [
          { id: 1, name: 'Kem chống nắng', isSystem: false },
          { id: 2, name: 'Combo mùa hè', isSystem: false },
        ],
        linkedFolderCount: 2,
      },
    ],
  },
];

describe('ProductVideoList', () => {
  it('renders folder actions and linked-folder badge', () => {
    render(
      <ProductVideoList
        products={products}
        selectedVideoId="dataset-1"
        filter="all"
        onFilterChange={vi.fn()}
        onSelectVideo={vi.fn()}
        expandedProductGroups={['Kem chống nắng']}
        onToggleProductGroup={vi.fn()}
        onCreateFolder={vi.fn()}
        onRenameFolder={vi.fn()}
        onDeleteFolder={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /tạo thư mục/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /đổi tên thư mục kem chống nắng/i })).toBeInTheDocument();
    expect(screen.getByText('+1 thư mục')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the sidebar test to verify it fails**

Run: `npm run test -- src/components/library/ProductVideoList.test.tsx`

Expected: FAIL because the new props and linked-folder badge do not exist yet.

- [ ] **Step 3: Write the minimal sidebar implementation**

```ts
// src/components/library/types.ts
export interface LibraryFolderSummary {
  id: number;
  name: string;
  isSystem: boolean;
}

export interface LibraryVideoItem {
  id: string;
  datasetId: string;
  videoFileId: number;
  fileName: string;
  source: LibraryVideoSource;
  versions: number;
  currentVersion: number;
  updatedAt: string;
  status: LibraryVideoStatus;
  productId: string;
  duration: string;
  scenes: LibrarySceneItem[];
  matchedScenes: LibrarySceneItem[];
  hasSearchResults: boolean;
  primaryFolder: LibraryFolderSummary;
  linkedFolders: LibraryFolderSummary[];
  linkedFolderCount: number;
}

export interface LibraryProduct {
  id: string;
  folderId: number;
  name: string;
  isSystem: boolean;
  videos: LibraryVideoItem[];
}
```

```tsx
// src/components/library/VideoListItem.tsx
export function VideoListItem({ video, isSelected, onClick }: VideoListItemProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-4 py-2.5 transition-colors group border-l-2',
        'hover:bg-surface-hover',
        isSelected ? 'bg-primary/10 border-l-primary' : 'border-l-transparent',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn('text-sm truncate', isSelected ? 'text-foreground font-medium' : 'text-secondary-foreground')}>
              {video.fileName}
            </span>
            {video.status === 'error' ? <AlertCircle className="h-3.5 w-3.5 text-badge-error shrink-0" /> : null}
            {video.status === 'processing' ? <Loader2 className="h-3.5 w-3.5 text-primary shrink-0 animate-spin" /> : null}
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <SourceBadge source={video.source} />
            <span className="text-[11px] text-muted-foreground">v{video.currentVersion}/{video.versions}</span>
            <span className="text-[11px] text-muted-foreground">· {video.updatedAt}</span>
            {video.linkedFolderCount > 1 ? (
              <span className="text-[11px] rounded-full border border-border px-1.5 py-0.5 text-muted-foreground">
                +{video.linkedFolderCount - 1} thư mục
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </button>
  );
}
```

```tsx
// src/components/library/ProductGroup.tsx
interface ProductGroupProps {
  product: LibraryProduct;
  selectedVideoId: string | null;
  onSelectVideo: (video: LibraryVideoItem) => void;
  expanded: boolean;
  onToggle: () => void;
  onRenameFolder: (folder: LibraryProduct) => void;
  onDeleteFolder: (folder: LibraryProduct) => void;
}

export function ProductGroup({ product, selectedVideoId, onSelectVideo, expanded, onToggle, onRenameFolder, onDeleteFolder }: ProductGroupProps) {
  return (
    <div>
      <div className="w-full flex items-center gap-2 px-3 py-2 border-b border-border/50">
        <button onClick={onToggle} className="flex items-center gap-2 min-w-0 flex-1 text-sm hover:text-foreground">
          {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
          <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-secondary-foreground font-medium truncate">{product.name}</span>
          <span className="text-[11px] text-muted-foreground ml-auto shrink-0">{product.videos.length}</span>
        </button>
        <button type="button" onClick={() => onRenameFolder(product)} className="text-[11px] text-muted-foreground hover:text-foreground" aria-label={`Đổi tên thư mục ${product.name}`}>
          Sửa
        </button>
        {!product.isSystem ? (
          <button type="button" onClick={() => onDeleteFolder(product)} className="text-[11px] text-muted-foreground hover:text-foreground" aria-label={`Xóa thư mục ${product.name}`}>
            Xóa
          </button>
        ) : null}
      </div>

      {expanded ? (
        <div>
          {product.videos.map((video) => (
            <VideoListItem key={video.id} video={video} isSelected={selectedVideoId === video.id} onClick={() => onSelectVideo(video)} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
```

```tsx
// src/components/library/ProductVideoList.tsx
interface ProductVideoListProps {
  products: LibraryProduct[];
  selectedVideoId: string | null;
  filter: DatasetSourceFilter;
  onFilterChange: (filter: DatasetSourceFilter) => void;
  onSelectVideo: (video: LibraryVideoItem) => void;
  expandedProductGroups: string[];
  onToggleProductGroup: (productName: string) => void;
  onCreateFolder: () => void;
  onRenameFolder: (folder: LibraryProduct) => void;
  onDeleteFolder: (folder: LibraryProduct) => void;
}

export function ProductVideoList({ products, selectedVideoId, filter, onFilterChange, onSelectVideo, expandedProductGroups, onToggleProductGroup, onCreateFolder, onRenameFolder, onDeleteFolder }: ProductVideoListProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2.5 border-b border-border shrink-0 space-y-2">
        <div className="flex gap-1">
          {filters.map((item) => (
            <button
              key={item.value}
              onClick={() => onFilterChange(item.value)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${filter === item.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={onCreateFolder} className="w-full rounded-md border border-border px-3 py-2 text-xs font-medium text-secondary-foreground hover:bg-surface-hover">
          Tạo thư mục
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {products.map((product) => (
          <ProductGroup
            key={product.id}
            product={product}
            selectedVideoId={selectedVideoId}
            onSelectVideo={onSelectVideo}
            expanded={expandedProductGroups.includes(product.name)}
            onToggle={() => onToggleProductGroup(product.name)}
            onRenameFolder={onRenameFolder}
            onDeleteFolder={onDeleteFolder}
          />
        ))}

        {products.length === 0 ? <div className="text-center text-muted-foreground text-sm py-8">Không có dữ liệu</div> : null}
      </div>
    </div>
  );
}
```

```tsx
// src/pages/LibraryPage.tsx
interface LibraryPageProps {
  groupedDatasets: Array<{ productName: string; folderId: number; isSystem: boolean; datasets: DatasetItem[] }>;
  activeDataset: DatasetItem | null;
  activeDatasetVersion: VideoVersion | null;
  expandedProductGroups: string[];
  librarySourceFilter: DatasetSourceFilter;
  libraryViewMode: ViewMode;
  trimmingScene: string | null;
  isLibraryMutationPending: boolean;
  onSelectSourceFilter: (filter: DatasetSourceFilter) => void;
  onToggleProductGroup: (productName: string) => void;
  onSelectDataset: (datasetId: string) => void;
  onCreateFolder: () => void;
  onRenameFolder: (folder: LibraryProduct) => void;
  onDeleteFolder: (folder: LibraryProduct) => void;
  onRenameVideoFile: (dataset: DatasetItem, nextName: string) => void;
  onAddVideoToFolder: (dataset: DatasetItem, folderId: number) => void;
  onRemoveVideoFromFolder: (dataset: DatasetItem, folderId: number) => void;
  onSetPrimaryFolder: (dataset: DatasetItem, folderId: number) => void;
  onOpenDatasetInSearch: (dataset: DatasetItem) => void;
  onOpenDatasetInStoryboard: (dataset: DatasetItem) => void;
  onRemoveDataset: (dataset: DatasetItem) => void;
  onSwitchLibraryVersion: (dataset: DatasetItem, versionIndex: number) => void;
  onSetLibraryViewMode: (mode: ViewMode) => void;
  onExportSRT: (video: VideoResult) => void;
  onPlayScene: (scene: Scene) => void;
  onTrimScene: (scene: Scene, sceneIndex: number) => void;
  onLibraryPlayerRef: (node: HTMLVideoElement | null) => void;
  onPlayerLoadedMetadata: () => void;
  onPlayerTimeUpdate: () => void;
}

const products = groupedDatasets.map((group) => ({
  id: `folder-${group.folderId}`,
  folderId: group.folderId,
  name: group.productName,
  isSystem: group.isSystem,
  videos: group.datasets.map((dataset) => toLibraryVideoItem(dataset, group.productName)),
})) satisfies LibraryProduct[];

<ProductVideoList
  products={products}
  selectedVideoId={selectedVideo?.id ?? null}
  filter={librarySourceFilter}
  onFilterChange={onSelectSourceFilter}
  onSelectVideo={(video) => onSelectDataset(video.datasetId)}
  expandedProductGroups={expandedProductGroups}
  onToggleProductGroup={onToggleProductGroup}
  onCreateFolder={onCreateFolder}
  onRenameFolder={onRenameFolder}
  onDeleteFolder={onDeleteFolder}
/>

<VideoDetailPanel
  video={selectedVideo}
  product={selectedProduct}
  allFolders={products}
  canUseInStoryboard={!!activeDatasetVersion && activeDatasetVersion.scenes.length > 0}
  viewMode={libraryViewMode}
  isLibraryMutationPending={isLibraryMutationPending}
  onRenameVideoFile={(nextName) => activeDataset && onRenameVideoFile(activeDataset, nextName)}
  onAddVideoToFolder={(folderId) => activeDataset && onAddVideoToFolder(activeDataset, folderId)}
  onRemoveVideoFromFolder={(folderId) => activeDataset && onRemoveVideoFromFolder(activeDataset, folderId)}
  onSetPrimaryFolder={(folderId) => activeDataset && onSetPrimaryFolder(activeDataset, folderId)}
  onSetViewMode={onSetLibraryViewMode}
  onSwitchVersion={(versionIndex) => onSwitchLibraryVersion(activeDataset, versionIndex)}
  onExportSRT={() => onExportSRT({ ...activeDataset, scenes: libraryViewMode === 'matched' ? activeDataset.matchedScenes || [] : activeDatasetVersion?.scenes || [] })}
  onOpenInSearch={() => onOpenDatasetInSearch(activeDataset)}
  onOpenInStoryboard={() => onOpenDatasetInStoryboard(activeDataset)}
  onRemoveDataset={() => onRemoveDataset(activeDataset)}
  onPlayScene={(scene) => onPlayScene(scene.rawScene)}
  onTrimScene={(scene) => onTrimScene(scene.rawScene, scene.sceneIndex)}
  trimmingSceneId={toTrimSceneId(activeDataset.fileName, trimmingScene, selectedVideo, libraryViewMode)}
  videoSrc={`/api/videos/${encodeURIComponent(activeDataset.fileName)}/stream`}
  onPlayerRef={onLibraryPlayerRef}
  onPlayerLoadedMetadata={onPlayerLoadedMetadata}
  onPlayerTimeUpdate={onPlayerTimeUpdate}
/>
```

- [ ] **Step 4: Run the sidebar test again to verify it passes**

Run: `npm run test -- src/components/library/ProductVideoList.test.tsx`

Expected: PASS with `1 passed`.

- [ ] **Step 5: Commit the sidebar UI changes**

```bash
git add src/components/library/types.ts src/components/library/ProductVideoList.tsx src/components/library/ProductGroup.tsx src/components/library/VideoListItem.tsx src/pages/LibraryPage.tsx src/components/library/ProductVideoList.test.tsx
git commit -m "feat: render product folders in the library sidebar"
```

### Task 7: Add Detail-Panel Asset Management And Wire Library Mutations Through App State

**Files:**
- Create: `src/components/library/FolderFormDialog.tsx`
- Create: `src/components/library/DeleteFolderDialog.tsx`
- Create: `src/components/library/RenameVideoFileDialog.tsx`
- Create: `src/components/library/VideoAssetManager.tsx`
- Create: `src/components/library/VideoAssetManager.test.tsx`
- Modify: `src/components/library/VideoDetailPanel.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write the failing detail-panel test for rename and folder controls**

```tsx
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { VideoAssetManager } from './VideoAssetManager';
import type { LibraryVideoItem, LibraryProduct } from './types';

const folders: LibraryProduct[] = [
  { id: 'folder-1', folderId: 1, name: 'Kem chống nắng', isSystem: false, videos: [] },
  { id: 'folder-2', folderId: 2, name: 'Combo mùa hè', isSystem: false, videos: [] },
  { id: 'folder-3', folderId: 3, name: 'Chưa phân loại', isSystem: true, videos: [] },
];

const video: LibraryVideoItem = {
  id: 'dataset-1',
  datasetId: 'dataset-1',
  videoFileId: 99,
  fileName: 'hero.mp4',
  source: 'Web',
  versions: 1,
  currentVersion: 1,
  updatedAt: '09:00 19/04/2026',
  status: 'success',
  productId: 'folder-1',
  duration: '0:12',
  scenes: [],
  matchedScenes: [],
  hasSearchResults: false,
  primaryFolder: { id: 1, name: 'Kem chống nắng', isSystem: false },
  linkedFolders: [
    { id: 1, name: 'Kem chống nắng', isSystem: false },
    { id: 2, name: 'Combo mùa hè', isSystem: false },
  ],
  linkedFolderCount: 2,
};

describe('VideoAssetManager', () => {
  it('shows rename and folder management controls', () => {
    render(
      <VideoAssetManager
        video={video}
        allFolders={folders}
        isPending={false}
        onRenameFile={vi.fn()}
        onAddFolder={vi.fn()}
        onRemoveFolder={vi.fn()}
        onSetPrimaryFolder={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /đổi tên file/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /gắn thêm thư mục/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /đặt thư mục chính/i })).toBeInTheDocument();
    expect(screen.getByText('Kem chống nắng')).toBeInTheDocument();
    expect(screen.getByText('Combo mùa hè')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the detail-panel test to verify it fails**

Run: `npm run test -- src/components/library/VideoAssetManager.test.tsx`

Expected: FAIL because `VideoAssetManager` and the related app wiring do not exist yet.

- [ ] **Step 3: Write the minimal dialogs, manager component, and App wiring**

```tsx
// src/components/library/FolderFormDialog.tsx
import { useEffect, useState } from 'react';

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface FolderFormDialogProps {
  open: boolean;
  title: string;
  initialValue: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: (value: string) => void;
}

export function FolderFormDialog({ open, title, initialValue, confirmLabel, onClose, onConfirm }: FolderFormDialogProps) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue, open]);

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <input className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" value={value} onChange={(event) => setValue(event.target.value)} placeholder="Nhập tên thư mục" />
        <DialogFooter>
          <button type="button" className="rounded-md border border-border px-3 py-2 text-sm" onClick={onClose}>Hủy</button>
          <button type="button" className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground" onClick={() => onConfirm(value)}> {confirmLabel} </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

```tsx
// src/components/library/DeleteFolderDialog.tsx
import { useMemo, useState } from 'react';

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { LibraryProduct } from './types';

interface DeleteFolderDialogProps {
  open: boolean;
  folder: LibraryProduct | null;
  allFolders: LibraryProduct[];
  onClose: () => void;
  onConfirm: (replacementFolderId: number | null) => void;
}

export function DeleteFolderDialog({ open, folder, allFolders, onClose, onConfirm }: DeleteFolderDialogProps) {
  const candidates = useMemo(
    () => allFolders.filter((item) => item.folderId !== folder?.folderId),
    [allFolders, folder?.folderId],
  );
  const [replacementFolderId, setReplacementFolderId] = useState<number | null>(candidates[0]?.folderId ?? null);

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Xóa thư mục</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">Video chính trong thư mục này sẽ được chuyển sang thư mục khác hoặc về Chưa phân loại.</p>
        <select className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" value={replacementFolderId ?? ''} onChange={(event) => setReplacementFolderId(event.target.value ? Number(event.target.value) : null)}>
          {candidates.map((candidate) => (
            <option key={candidate.folderId} value={candidate.folderId}>{candidate.name}</option>
          ))}
        </select>
        <DialogFooter>
          <button type="button" className="rounded-md border border-border px-3 py-2 text-sm" onClick={onClose}>Hủy</button>
          <button type="button" className="rounded-md bg-destructive px-3 py-2 text-sm text-destructive-foreground" onClick={() => onConfirm(replacementFolderId)}>Xóa thư mục</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

```tsx
// src/components/library/RenameVideoFileDialog.tsx
import { useEffect, useState } from 'react';

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface RenameVideoFileDialogProps {
  open: boolean;
  currentName: string;
  onClose: () => void;
  onConfirm: (nextName: string) => void;
}

export function RenameVideoFileDialog({ open, currentName, onClose, onConfirm }: RenameVideoFileDialogProps) {
  const [nextName, setNextName] = useState(currentName);

  useEffect(() => {
    setNextName(currentName);
  }, [currentName, open]);

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Đổi tên file video</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <p className="text-muted-foreground">Tên hiện tại: <span className="text-foreground">{currentName}</span></p>
          <input className="w-full rounded-md border border-border bg-background px-3 py-2" value={nextName} onChange={(event) => setNextName(event.target.value)} />
          <p className="text-xs text-muted-foreground">Thao tác này đổi tên file thật trong thư viện video của server.</p>
        </div>
        <DialogFooter>
          <button type="button" className="rounded-md border border-border px-3 py-2 text-sm" onClick={onClose}>Hủy</button>
          <button type="button" className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground" onClick={() => onConfirm(nextName)}>Đổi tên file</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

```tsx
// src/components/library/VideoAssetManager.tsx
import { useMemo, useState } from 'react';

import type { LibraryProduct, LibraryVideoItem } from './types';
import { RenameVideoFileDialog } from './RenameVideoFileDialog';

interface VideoAssetManagerProps {
  video: LibraryVideoItem;
  allFolders: LibraryProduct[];
  isPending: boolean;
  onRenameFile: (nextName: string) => void;
  onAddFolder: (folderId: number) => void;
  onRemoveFolder: (folderId: number) => void;
  onSetPrimaryFolder: (folderId: number) => void;
}

export function VideoAssetManager({ video, allFolders, isPending, onRenameFile, onAddFolder, onRemoveFolder, onSetPrimaryFolder }: VideoAssetManagerProps) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<number>(video.primaryFolder.id);
  const addableFolders = useMemo(
    () => allFolders.filter((folder) => !video.linkedFolders.some((linked) => linked.id === folder.folderId)),
    [allFolders, video.linkedFolders],
  );

  return (
    <div className="border-b border-border px-4 py-3 space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-foreground">Quản lý thư mục & tên file</h4>
        <p className="text-xs text-muted-foreground mt-1">Đổi tên file thật, đặt thư mục chính, và quản lý các thư mục liên kết cho video đang chọn.</p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" disabled={isPending} className="rounded-md bg-secondary px-3 py-1.5 text-xs text-secondary-foreground disabled:opacity-50" onClick={() => setRenameOpen(true)}>
          Đổi tên file
        </button>
        <button type="button" disabled={isPending} className="rounded-md bg-secondary px-3 py-1.5 text-xs text-secondary-foreground disabled:opacity-50" onClick={() => onSetPrimaryFolder(selectedFolderId)}>
          Đặt thư mục chính
        </button>
      </div>

      <div className="space-y-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Thư mục chính</p>
          <p className="text-sm text-foreground">{video.primaryFolder.name}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Thư mục đã liên kết</p>
          <div className="flex gap-2 flex-wrap mt-1">
            {video.linkedFolders.map((folder) => (
              <button key={folder.id} type="button" disabled={isPending || video.linkedFolders.length === 1} className="rounded-full border border-border px-2 py-1 text-xs text-secondary-foreground disabled:opacity-50" onClick={() => onRemoveFolder(folder.id)}>
                {folder.name}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <select className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm" value={selectedFolderId} onChange={(event) => setSelectedFolderId(Number(event.target.value))}>
            {allFolders.map((folder) => (
              <option key={folder.folderId} value={folder.folderId}>{folder.name}</option>
            ))}
          </select>
          <button type="button" disabled={isPending || addableFolders.length === 0} className="rounded-md border border-border px-3 py-2 text-xs text-secondary-foreground disabled:opacity-50" onClick={() => onAddFolder(selectedFolderId)}>
            Gắn thêm thư mục
          </button>
        </div>
      </div>

      <RenameVideoFileDialog open={renameOpen} currentName={video.fileName} onClose={() => setRenameOpen(false)} onConfirm={(nextName) => { onRenameFile(nextName); setRenameOpen(false); }} />
    </div>
  );
}
```

```tsx
// src/components/library/VideoDetailPanel.tsx
import { VideoAssetManager } from './VideoAssetManager';

interface VideoDetailPanelProps {
  video: LibraryVideoItem;
  product: LibraryProduct;
  allFolders: LibraryProduct[];
  canUseInStoryboard: boolean;
  viewMode: ViewMode;
  isLibraryMutationPending: boolean;
  onRenameVideoFile: (nextName: string) => void;
  onAddVideoToFolder: (folderId: number) => void;
  onRemoveVideoFromFolder: (folderId: number) => void;
  onSetPrimaryFolder: (folderId: number) => void;
  onSetViewMode: (mode: ViewMode) => void;
  onSwitchVersion: (versionIndex: number) => void;
  onExportSRT: () => void;
  onOpenInSearch: () => void;
  onOpenInStoryboard: () => void;
  onRemoveDataset: () => void;
  onPlayScene: (scene: LibrarySceneItem) => void;
  onTrimScene: (scene: LibrarySceneItem) => void;
  trimmingSceneId: string | null;
  videoSrc: string;
  onPlayerRef: (node: HTMLVideoElement | null) => void;
  onPlayerLoadedMetadata: () => void;
  onPlayerTimeUpdate: () => void;
}

<VideoAssetManager
  video={video}
  allFolders={allFolders}
  isPending={isLibraryMutationPending}
  onRenameFile={onRenameVideoFile}
  onAddFolder={onAddVideoToFolder}
  onRemoveFolder={onRemoveVideoFromFolder}
  onSetPrimaryFolder={onSetPrimaryFolder}
/>
```

```tsx
// src/App.tsx
const [productFolders, setProductFolders] = useState<ProductFolder[]>([]);
const [isLibraryMutationPending, setIsLibraryMutationPending] = useState(false);
const [folderDialogMode, setFolderDialogMode] = useState<'create' | 'rename' | null>(null);
const [editingFolder, setEditingFolder] = useState<LibraryProduct | null>(null);
const [deletingFolder, setDeletingFolder] = useState<LibraryProduct | null>(null);

const applyLibraryMutation = useCallback((result: LibraryMutationResult) => {
  setProductFolders(result.folders);
  setHistory((prev) => {
    const byId = new Map(prev.map((item) => [item.id, item]));
    normalizeHistory(result.histories).forEach((item) => {
      if (item.videos.length === 0) {
        byId.delete(item.id);
      } else {
        byId.set(item.id, item);
      }
    });
    return Array.from(byId.values()).sort((a, b) => b.date - a.date);
  });
}, []);

useEffect(() => {
  Promise.all([api.history(), api.listProductFolders()])
    .then(([items, folders]) => {
      setHistory(normalizeHistory(items));
      setProductFolders(folders);
    })
    .catch(() => setGlobalError('Không kết nối được server. Hãy chạy Python server trước.'));
}, []);

const groupedDatasets = useMemo(() => {
  const groups = new Map<number, DatasetItem[]>();
  filteredDatasets.forEach((dataset) => {
    const existing = groups.get(dataset.primaryFolder.id) || [];
    existing.push(dataset);
    groups.set(dataset.primaryFolder.id, existing);
  });
  return productFolders
    .map((folder) => ({
      productName: folder.name,
      folderId: folder.id,
      isSystem: folder.isSystem,
      datasets: [...(groups.get(folder.id) || [])].sort((a, b) => b.updatedAt - a.updatedAt),
    }))
    .sort((a, b) => a.productName.localeCompare(b.productName, 'vi'));
}, [filteredDatasets, productFolders]);

const handleCreateFolder = async (name: string) => {
  setIsLibraryMutationPending(true);
  try {
    const folders = await api.createProductFolder(name);
    setProductFolders(folders);
    setFolderDialogMode(null);
  } catch (error) {
    setGlobalError(error instanceof Error ? error.message : 'Không thể tạo thư mục.');
  } finally {
    setIsLibraryMutationPending(false);
  }
};

const handleRenameFolder = async (folderId: number, name: string) => {
  setIsLibraryMutationPending(true);
  try {
    const folders = await api.renameProductFolder(folderId, name);
    setProductFolders(folders);
    setEditingFolder(null);
    setFolderDialogMode(null);
  } catch (error) {
    setGlobalError(error instanceof Error ? error.message : 'Không thể đổi tên thư mục.');
  } finally {
    setIsLibraryMutationPending(false);
  }
};

const handleDeleteFolder = async (folderId: number, replacementFolderId: number | null) => {
  setIsLibraryMutationPending(true);
  try {
    const result = await api.deleteProductFolder(folderId, replacementFolderId);
    applyLibraryMutation(result);
    setDeletingFolder(null);
  } catch (error) {
    setGlobalError(error instanceof Error ? error.message : 'Không thể xóa thư mục.');
  } finally {
    setIsLibraryMutationPending(false);
  }
};

const handleRenameVideoFile = async (videoFileId: number, filename: string) => {
  setIsLibraryMutationPending(true);
  try {
    const result = await api.renameVideoFile(videoFileId, filename);
    applyLibraryMutation(result);
  } catch (error) {
    setGlobalError(error instanceof Error ? error.message : 'Không thể đổi tên file video.');
  } finally {
    setIsLibraryMutationPending(false);
  }
};

const handleAddVideoToFolder = async (videoFileId: number, folderId: number) => {
  setIsLibraryMutationPending(true);
  try {
    applyLibraryMutation(await api.addVideoFileToFolder(videoFileId, folderId));
  } catch (error) {
    setGlobalError(error instanceof Error ? error.message : 'Không thể gắn video vào thư mục.');
  } finally {
    setIsLibraryMutationPending(false);
  }
};

const handleRemoveVideoFromFolder = async (videoFileId: number, folderId: number) => {
  setIsLibraryMutationPending(true);
  try {
    applyLibraryMutation(await api.removeVideoFileFromFolder(videoFileId, folderId));
  } catch (error) {
    setGlobalError(error instanceof Error ? error.message : 'Không thể gỡ video khỏi thư mục.');
  } finally {
    setIsLibraryMutationPending(false);
  }
};

const handleSetPrimaryFolder = async (videoFileId: number, folderId: number) => {
  setIsLibraryMutationPending(true);
  try {
    applyLibraryMutation(await api.setVideoFilePrimaryFolder(videoFileId, folderId));
  } catch (error) {
    setGlobalError(error instanceof Error ? error.message : 'Không thể đặt thư mục chính.');
  } finally {
    setIsLibraryMutationPending(false);
  }
};

<LibraryPage
  groupedDatasets={groupedDatasets}
  activeDataset={activeDataset}
  activeDatasetVersion={activeDatasetVersion}
  expandedProductGroups={expandedProductGroups}
  librarySourceFilter={librarySourceFilter}
  libraryViewMode={libraryViewMode}
  trimmingScene={trimmingScene}
  isLibraryMutationPending={isLibraryMutationPending}
  onSelectSourceFilter={setLibrarySourceFilter}
  onToggleProductGroup={toggleProductGroup}
  onSelectDataset={setActiveDatasetId}
  onCreateFolder={() => setFolderDialogMode('create')}
  onRenameFolder={(folder) => {
    setEditingFolder(folder);
    setFolderDialogMode('rename');
  }}
  onDeleteFolder={(folder) => setDeletingFolder(folder)}
  onRenameVideoFile={(dataset, nextName) => void handleRenameVideoFile(dataset.videoFileId, nextName)}
  onAddVideoToFolder={(dataset, folderId) => void handleAddVideoToFolder(dataset.videoFileId, folderId)}
  onRemoveVideoFromFolder={(dataset, folderId) => void handleRemoveVideoFromFolder(dataset.videoFileId, folderId)}
  onSetPrimaryFolder={(dataset, folderId) => void handleSetPrimaryFolder(dataset.videoFileId, folderId)}
  onOpenDatasetInSearch={openDatasetInSearch}
  onOpenDatasetInStoryboard={openDatasetInStoryboard}
  onRemoveDataset={removeDataset}
  onSwitchLibraryVersion={switchLibraryVersion}
  onSetLibraryViewMode={setLibraryViewMode}
  onExportSRT={exportSRT}
  onPlayScene={(scene) => playScene(LIBRARY_PLAYER_SLOT, scene)}
  onTrimScene={(scene, sceneIndex) => {
    if (activeDataset) {
      void trimAndDownload(activeDataset, scene, sceneIndex);
    }
  }}
  onLibraryPlayerRef={(node) => {
    playerRefs.current[LIBRARY_PLAYER_SLOT] = node;
  }}
  onPlayerLoadedMetadata={() => handlePlayerLoadedMetadata(LIBRARY_PLAYER_SLOT)}
  onPlayerTimeUpdate={() => handlePlayerTimeUpdate(LIBRARY_PLAYER_SLOT)}
/>

<FolderFormDialog
  open={folderDialogMode === 'create'}
  title="Tạo thư mục sản phẩm"
  initialValue=""
  confirmLabel="Tạo thư mục"
  onClose={() => setFolderDialogMode(null)}
  onConfirm={(value) => void handleCreateFolder(value)}
/>

<FolderFormDialog
  open={folderDialogMode === 'rename' && !!editingFolder}
  title="Đổi tên thư mục"
  initialValue={editingFolder?.name || ''}
  confirmLabel="Lưu tên mới"
  onClose={() => {
    setFolderDialogMode(null);
    setEditingFolder(null);
  }}
  onConfirm={(value) => {
    if (editingFolder) {
      void handleRenameFolder(editingFolder.folderId, value);
    }
  }}
/>

<DeleteFolderDialog
  open={!!deletingFolder}
  folder={deletingFolder}
  allFolders={productFolders.map((folder) => ({ id: `folder-${folder.id}`, folderId: folder.id, name: folder.name, isSystem: folder.isSystem, videos: [] }))}
  onClose={() => setDeletingFolder(null)}
  onConfirm={(replacementFolderId) => {
    if (deletingFolder) {
      void handleDeleteFolder(deletingFolder.folderId, replacementFolderId);
    }
  }}
/>
```

- [ ] **Step 4: Run the focused tests and full verification**

Run: `npm run test -- src/components/library/VideoAssetManager.test.tsx src/components/library/ProductVideoList.test.tsx src/lib/footage-app.test.ts && python -m unittest discover server/tests -v && npm run lint && npm run build`

Expected:
- Vitest reports all targeted tests passed
- `python -m unittest` ends with `OK`
- `npm run lint` exits cleanly with no TypeScript errors
- `npm run build` emits `dist/index.html` and bundled assets successfully

- [ ] **Step 5: Commit the app wiring and UI workflow**

```bash
git add src/App.tsx src/components/library/FolderFormDialog.tsx src/components/library/DeleteFolderDialog.tsx src/components/library/RenameVideoFileDialog.tsx src/components/library/VideoAssetManager.tsx src/components/library/VideoAssetManager.test.tsx src/components/library/VideoDetailPanel.tsx
git commit -m "feat: add library folder management and video rename UI"
```
