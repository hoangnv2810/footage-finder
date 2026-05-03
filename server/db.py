import json
import os
import sqlite3
import threading
import time
import uuid
from typing import Any

DB_PATH = os.path.join(os.path.dirname(__file__), "data.db")
IMPORT_HISTORY_PREFIX = "import:"
UNCLASSIFIED_FOLDER_NAME = "Chưa phân loại"

_local = threading.local()


def _get_conn() -> sqlite3.Connection:
    if not hasattr(_local, "conn"):
        _local.conn = sqlite3.connect(DB_PATH)
        _local.conn.row_factory = sqlite3.Row
        _local.conn.execute("PRAGMA journal_mode=WAL")
        _local.conn.execute("PRAGMA foreign_keys=ON")
    return _local.conn


def _has_column(conn: sqlite3.Connection, table: str, column: str) -> bool:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return any(row["name"] == column for row in rows)


def _ensure_product_folder(
    conn: sqlite3.Connection, name: str, is_system: bool = False
) -> int:
    normalized_name = name.strip() or UNCLASSIFIED_FOLDER_NAME
    now = int(time.time() * 1000)
    existing = conn.execute(
        "SELECT id, is_system FROM product_folder WHERE name = ?", (normalized_name,)
    ).fetchone()
    if existing:
        if is_system and not existing["is_system"]:
            conn.execute(
                "UPDATE product_folder SET is_system = 1, updated_at = ? WHERE id = ?",
                (now, existing["id"]),
            )
        return existing["id"]

    cur = conn.execute(
        """
        INSERT INTO product_folder (name, is_system, created_at, updated_at)
        VALUES (?, ?, ?, ?)
        """,
        (normalized_name, 1 if is_system else 0, now, now),
    )
    return cur.lastrowid


def _ensure_unclassified_folder(conn: sqlite3.Connection) -> int:
    return _ensure_product_folder(conn, UNCLASSIFIED_FOLDER_NAME, is_system=True)


def _get_or_create_video_file(conn: sqlite3.Connection, filename: str) -> int:
    row = conn.execute(
        "SELECT id FROM video_file WHERE filename = ?", (filename,)
    ).fetchone()
    if row:
        return row["id"]

    cur = conn.execute(
        """
        INSERT INTO video_file (
            filename, size_bytes, modified_at, last_scanned, primary_product_folder_id
        ) VALUES (?, 0, 0, ?, ?)
        """,
        (filename, int(time.time() * 1000), _ensure_unclassified_folder(conn)),
    )
    return cur.lastrowid


def _effective_folder_name(history_product_name: str, video_override: str) -> str:
    return (video_override or history_product_name or "").strip() or UNCLASSIFIED_FOLDER_NAME


def _set_video_file_primary_folder(
    conn: sqlite3.Connection, video_file_id: int, product_folder_id: int
) -> None:
    conn.execute(
        "UPDATE video_file SET primary_product_folder_id = ? WHERE id = ?",
        (product_folder_id, video_file_id),
    )


def _video_file_has_versions(conn: sqlite3.Connection, video_file_id: int) -> bool:
    row = conn.execute(
        """
        SELECT 1
        FROM video_version vv
        JOIN history_video hv ON hv.id = vv.video_id
        WHERE hv.video_file_id = ?
        LIMIT 1
        """,
        (video_file_id,),
    ).fetchone()
    return bool(row)


def _ensure_video_file_folder_defaults(
    conn: sqlite3.Connection,
    video_file_id: int,
    preferred_folder_name: str | None = None,
    allow_default_promotion: bool = False,
) -> None:
    unclassified_folder_id = _ensure_unclassified_folder(conn)
    video_row = conn.execute(
        "SELECT primary_product_folder_id FROM video_file WHERE id = ?", (video_file_id,)
    ).fetchone()
    if not video_row:
        return

    primary_folder_id = video_row["primary_product_folder_id"]
    preferred_name = (preferred_folder_name or "").strip()
    valid_primary = None
    if primary_folder_id:
        valid_primary = conn.execute(
            "SELECT id FROM product_folder WHERE id = ?", (primary_folder_id,)
        ).fetchone()

    if valid_primary:
        return

    target_folder_id = unclassified_folder_id
    if allow_default_promotion and preferred_name:
        target_folder_id = _ensure_product_folder(
            conn,
            preferred_name,
            is_system=preferred_name == UNCLASSIFIED_FOLDER_NAME,
        )

    _set_video_file_primary_folder(conn, video_file_id, target_folder_id)


def _load_video_folder(conn: sqlite3.Connection, video_file_id: int | None) -> dict | None:
    if not video_file_id:
        return None

    row = conn.execute(
        """
        SELECT pf.id, pf.name, pf.is_system
        FROM video_file vf
        LEFT JOIN product_folder pf ON pf.id = vf.primary_product_folder_id
        WHERE vf.id = ?
        """,
        (video_file_id,),
    ).fetchone()
    if not row or row["id"] is None:
        return None
    return {
        "id": row["id"],
        "name": row["name"],
        "isSystem": bool(row["is_system"]),
    }


def _folder_row_to_dict(row: sqlite3.Row) -> dict:
    payload = {
        "id": row["id"],
        "name": row["name"],
        "isSystem": bool(row["is_system"]),
    }
    if "video_count" in row.keys():
        payload["videoCount"] = row["video_count"]
    return payload


def _list_product_folders(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        """
        SELECT pf.id, pf.name, pf.is_system, COUNT(vf.id) AS video_count
        FROM product_folder pf
        LEFT JOIN video_file vf ON vf.primary_product_folder_id = pf.id
        GROUP BY pf.id, pf.name, pf.is_system
        ORDER BY pf.is_system DESC, pf.name COLLATE NOCASE, pf.id
        """
    ).fetchall()
    return [_folder_row_to_dict(row) for row in rows]


def _normalize_folder_name(name: str) -> str:
    normalized = name.strip()
    if not normalized:
        raise ValueError("Tên thư mục không được để trống")
    return normalized


def _get_product_folder_row(conn: sqlite3.Connection, folder_id: int) -> sqlite3.Row:
    row = conn.execute(
        "SELECT id, name, is_system FROM product_folder WHERE id = ?", (folder_id,)
    ).fetchone()
    if not row:
        raise ValueError("Không tìm thấy thư mục")
    return row


def _get_video_file_row(conn: sqlite3.Connection, video_file_id: int) -> sqlite3.Row:
    row = conn.execute(
        "SELECT id, primary_product_folder_id FROM video_file WHERE id = ?", (video_file_id,)
    ).fetchone()
    if not row:
        raise ValueError("Không tìm thấy video")
    return row


def _history_items_for_video_file_ids(
    conn: sqlite3.Connection, video_file_ids: list[int]
) -> list[dict]:
    unique_ids = sorted(set(video_file_ids))
    if not unique_ids:
        return []

    placeholders = ",".join("?" for _ in unique_ids)
    rows = conn.execute(
        f"""
        SELECT DISTINCT h.*
        FROM history h
        JOIN history_video hv ON hv.history_id = h.id
        WHERE hv.video_file_id IN ({placeholders})
        ORDER BY h.date DESC, h.id DESC
        """,
        unique_ids,
    ).fetchall()
    return [_history_item_from_row(conn, row) for row in rows]


def _mutation_result(
    conn: sqlite3.Connection, affected_video_file_ids: list[int] | None = None
) -> dict:
    return {
        "folders": _list_product_folders(conn),
        "histories": _history_items_for_video_file_ids(conn, affected_video_file_ids or []),
    }


def _backfill_video_asset_metadata(conn: sqlite3.Connection) -> None:
    unclassified_folder_id = _ensure_unclassified_folder(conn)

    legacy_videos = conn.execute(
        """
        SELECT hv.id, hv.file_name, hv.video_file_id, hv.product_name_override, h.product_name
        FROM history_video hv
        JOIN history h ON h.id = hv.history_id
        ORDER BY hv.id
        """
    ).fetchall()
    for row in legacy_videos:
        video_file_id = row["video_file_id"] if "video_file_id" in row.keys() else None
        if not video_file_id:
            video_file_id = _get_or_create_video_file(conn, row["file_name"])
            conn.execute(
                "UPDATE history_video SET video_file_id = ? WHERE id = ?",
                (video_file_id, row["id"]),
            )

    for row in conn.execute("SELECT id FROM video_file ORDER BY id").fetchall():
        video_row = conn.execute(
            "SELECT primary_product_folder_id FROM video_file WHERE id = ?", (row["id"],)
        ).fetchone()
        primary_folder_id = (
            video_row["primary_product_folder_id"] if video_row else None
        )
        valid_primary = None
        if primary_folder_id:
            valid_primary = conn.execute(
                "SELECT id FROM product_folder WHERE id = ?", (primary_folder_id,)
            ).fetchone()
        if not valid_primary:
            _set_video_file_primary_folder(conn, row["id"], unclassified_folder_id)

    conn.execute("DELETE FROM product_folder_video")


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
            source TEXT NOT NULL DEFAULT 'web',
            product_name_override TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'pending',
            error TEXT,
            current_version_index INTEGER DEFAULT 0,
            current_search_keywords TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS video_version (
            id TEXT PRIMARY KEY,
            video_id INTEGER NOT NULL REFERENCES history_video(id) ON DELETE CASCADE,
            timestamp INTEGER NOT NULL,
            keywords TEXT NOT NULL DEFAULT '',
            scenes TEXT NOT NULL DEFAULT '[]'
        );

        CREATE TABLE IF NOT EXISTS search_result (
            id TEXT PRIMARY KEY,
            video_version_id TEXT NOT NULL REFERENCES video_version(id) ON DELETE CASCADE,
            keywords TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            scenes TEXT NOT NULL DEFAULT '[]',
            error TEXT,
            UNIQUE(video_version_id, keywords)
        );

        CREATE TABLE IF NOT EXISTS video_file (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL UNIQUE,
            size_bytes INTEGER NOT NULL,
            modified_at REAL NOT NULL,
            last_scanned INTEGER NOT NULL,
            primary_product_folder_id INTEGER REFERENCES product_folder(id)
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
            UNIQUE(product_folder_id, video_file_id)
        );

        CREATE TABLE IF NOT EXISTS storyboard_project (
            id TEXT PRIMARY KEY,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            product_name TEXT NOT NULL DEFAULT '',
            product_description TEXT NOT NULL DEFAULT '',
            category TEXT NOT NULL DEFAULT '',
            target_audience TEXT NOT NULL DEFAULT '',
            tone TEXT NOT NULL DEFAULT '',
            key_benefits TEXT NOT NULL DEFAULT '',
            script_text TEXT NOT NULL DEFAULT '',
            selected_version_ids TEXT NOT NULL DEFAULT '[]',
            candidate_snapshot_json TEXT NOT NULL DEFAULT '[]',
            result_json TEXT NOT NULL DEFAULT '{}',
            source TEXT NOT NULL DEFAULT 'generated',
            folder_id INTEGER
        );
    """
    )

    if not _has_column(conn, "history_video", "current_search_keywords"):
        conn.execute(
            "ALTER TABLE history_video ADD COLUMN current_search_keywords TEXT NOT NULL DEFAULT ''"
        )

    if not _has_column(conn, "history_video", "source"):
        conn.execute(
            "ALTER TABLE history_video ADD COLUMN source TEXT NOT NULL DEFAULT 'web'"
        )
        conn.execute(
            "UPDATE history_video SET source = 'extension' WHERE history_id LIKE ?",
            (f"{IMPORT_HISTORY_PREFIX}%",),
        )
        conn.execute(
            "UPDATE history_video SET source = 'web' WHERE source IS NULL OR source = ''"
        )

    if not _has_column(conn, "history", "product_name"):
        conn.execute(
            "ALTER TABLE history ADD COLUMN product_name TEXT NOT NULL DEFAULT ''"
        )

    if not _has_column(conn, "history_video", "product_name_override"):
        conn.execute(
            "ALTER TABLE history_video ADD COLUMN product_name_override TEXT NOT NULL DEFAULT ''"
        )

    if not _has_column(conn, "video_file", "primary_product_folder_id"):
        conn.execute(
            "ALTER TABLE video_file ADD COLUMN primary_product_folder_id INTEGER"
        )

    if not _has_column(conn, "history_video", "video_file_id"):
        conn.execute("ALTER TABLE history_video ADD COLUMN video_file_id INTEGER")

    storyboard_columns = {
        "created_at": "INTEGER NOT NULL DEFAULT 0",
        "updated_at": "INTEGER NOT NULL DEFAULT 0",
        "product_name": "TEXT NOT NULL DEFAULT ''",
        "product_description": "TEXT NOT NULL DEFAULT ''",
        "category": "TEXT NOT NULL DEFAULT ''",
        "target_audience": "TEXT NOT NULL DEFAULT ''",
        "tone": "TEXT NOT NULL DEFAULT ''",
        "key_benefits": "TEXT NOT NULL DEFAULT ''",
        "script_text": "TEXT NOT NULL DEFAULT ''",
        "selected_version_ids": "TEXT NOT NULL DEFAULT '[]'",
        "candidate_snapshot_json": "TEXT NOT NULL DEFAULT '[]'",
        "result_json": "TEXT NOT NULL DEFAULT '{}'",
        "source": "TEXT NOT NULL DEFAULT 'generated'",
        "folder_id": "INTEGER",
    }
    for column, definition in storyboard_columns.items():
        if not _has_column(conn, "storyboard_project", column):
            conn.execute(
                f"ALTER TABLE storyboard_project ADD COLUMN {column} {definition}"
            )

    _backfill_video_asset_metadata(conn)

    conn.commit()


def save_video_file(filename: str, size_bytes: int, modified_at: float) -> int:
    conn = _get_conn()
    now = int(time.time() * 1000)
    unclassified_folder_id = _ensure_unclassified_folder(conn)
    conn.execute(
        """INSERT INTO video_file (filename, size_bytes, modified_at, last_scanned)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(filename) DO UPDATE SET size_bytes=?, modified_at=?, last_scanned=?""",
        (filename, size_bytes, modified_at, now, size_bytes, modified_at, now),
    )
    video_file_id = _get_or_create_video_file(conn, filename)
    if not conn.execute(
        "SELECT primary_product_folder_id FROM video_file WHERE id = ?", (video_file_id,)
    ).fetchone()["primary_product_folder_id"]:
        _set_video_file_primary_folder(conn, video_file_id, unclassified_folder_id)
    conn.commit()
    return video_file_id


def _find_history_video(
    conn: sqlite3.Connection,
    history_id: str,
    filename: str,
    video_file_id: int,
    source: str | None = None,
) -> sqlite3.Row | None:
    if video_file_id:
        if source is None:
            row = conn.execute(
                "SELECT id FROM history_video WHERE history_id = ? AND video_file_id = ?",
                (history_id, video_file_id),
            ).fetchone()
        else:
            row = conn.execute(
                "SELECT id FROM history_video WHERE history_id = ? AND video_file_id = ? AND source = ?",
                (history_id, video_file_id, source),
            ).fetchone()
        if row:
            return row

    if source is None:
        return conn.execute(
            "SELECT id FROM history_video WHERE history_id = ? AND file_name = ?",
            (history_id, filename),
        ).fetchone()

    return conn.execute(
        "SELECT id FROM history_video WHERE history_id = ? AND file_name = ? AND source = ?",
        (history_id, filename, source),
    ).fetchone()


def _find_import_history_id(conn: sqlite3.Connection, filename: str, video_file_id: int) -> str:
    if video_file_id:
        row = conn.execute(
            """
            SELECT hv.history_id
            FROM history_video hv
            WHERE hv.video_file_id = ? AND hv.source = 'extension'
            ORDER BY hv.id
            LIMIT 1
            """,
            (video_file_id,),
        ).fetchone()
        if row:
            return row["history_id"]

    return _import_history_id(filename)


def _new_version_id() -> str:
    return f"version:{uuid.uuid4().hex}"


def _load_versions(conn: sqlite3.Connection, video_id: int) -> list[dict]:
    rows = conn.execute(
        "SELECT * FROM video_version WHERE video_id = ? ORDER BY timestamp", (video_id,)
    ).fetchall()
    return [
        {
            "id": row["id"],
            "timestamp": row["timestamp"],
            "keywords": row["keywords"],
            "scenes": json.loads(row["scenes"]),
        }
        for row in rows
    ]


def _load_search_results(conn: sqlite3.Connection, video_id: int) -> list[dict]:
    rows = conn.execute(
        """
        SELECT sr.*
        FROM search_result sr
        JOIN video_version vv ON vv.id = sr.video_version_id
        WHERE vv.video_id = ?
        ORDER BY sr.timestamp
        """,
        (video_id,),
    ).fetchall()
    return [
        {
            "id": row["id"],
            "versionId": row["video_version_id"],
            "keywords": row["keywords"],
            "timestamp": row["timestamp"],
            "scenes": json.loads(row["scenes"]),
            "error": row["error"],
        }
        for row in rows
    ]


def _active_search_result(
    search_results: list[dict],
    current_version_id: str | None,
    current_search_keywords: str,
) -> dict | None:
    if not current_version_id or not current_search_keywords:
        return None

    for result in reversed(search_results):
        if (
            result["versionId"] == current_version_id
            and result["keywords"] == current_search_keywords
        ):
            return result
    return None


def _resolve_product_name(history_product_name: str, video_override: str) -> str:
    return (video_override or history_product_name or "").strip() or "Chưa gán sản phẩm"


def _video_row_to_dict(
    row: sqlite3.Row,
    versions: list[dict],
    search_results: list[dict],
    history_product_name: str,
) -> dict:
    if versions:
        current_version_index = min(
            max(int(row["current_version_index"] or 0), 0), len(versions) - 1
        )
        current_version_id = versions[current_version_index]["id"]
        scenes = versions[current_version_index]["scenes"]
    else:
        current_version_index = 0
        current_version_id = None
        scenes = []

    current_search_keywords = row["current_search_keywords"] or ""
    active_search = _active_search_result(
        search_results, current_version_id, current_search_keywords
    )
    folder = _load_video_folder(
        _get_conn(), row["video_file_id"] if "video_file_id" in row.keys() else None
    )

    return {
        "dbVideoId": row["id"],
        "videoFileId": row["video_file_id"] if "video_file_id" in row.keys() else None,
        "fileName": row["file_name"],
        "source": row["source"],
        "productNameOverride": row["product_name_override"] or "",
        "resolvedProductName": _resolve_product_name(
            history_product_name, row["product_name_override"] or ""
        ),
        "folder": folder,
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


def _history_item_from_row(conn: sqlite3.Connection, row: sqlite3.Row) -> dict:
    videos = conn.execute(
        "SELECT * FROM history_video WHERE history_id = ? ORDER BY id", (row["id"],)
    ).fetchall()
    return {
        "id": row["id"],
        "date": row["date"],
        "keywords": row["keywords"],
        "productName": row["product_name"] or "",
        "videos": [
            _video_row_to_dict(
                v,
                _load_versions(conn, v["id"]),
                _load_search_results(conn, v["id"]),
                row["product_name"] or "",
            )
            for v in videos
        ],
    }


def list_history() -> list[dict]:
    conn = _get_conn()
    rows = conn.execute("SELECT * FROM history ORDER BY date DESC").fetchall()
    return [_history_item_from_row(conn, row) for row in rows]


def list_product_folders() -> list[dict]:
    conn = _get_conn()
    _ensure_unclassified_folder(conn)
    conn.commit()
    return _list_product_folders(conn)


def get_unclassified_folder_id() -> int:
    conn = _get_conn()
    folder_id = _ensure_unclassified_folder(conn)
    conn.commit()
    return folder_id


def _get_history_item(history_id: str) -> dict | None:
    conn = _get_conn()
    row = conn.execute("SELECT * FROM history WHERE id = ?", (history_id,)).fetchone()
    if not row:
        return None
    return _history_item_from_row(conn, row)


def _import_history_id(filename: str) -> str:
    return f"{IMPORT_HISTORY_PREFIX}{filename}"


def save_history(item: dict[str, Any]) -> dict:
    conn = _get_conn()
    existing = conn.execute(
        "SELECT id FROM history WHERE id = ?", (item["id"],)
    ).fetchone()

    if existing:
        conn.execute(
            "UPDATE history SET date = ?, keywords = ?, product_name = COALESCE(?, product_name) WHERE id = ?",
            (
                item["date"],
                item.get("keywords", ""),
                item.get("productName") or None,
                item["id"],
            ),
        )
    else:
        conn.execute(
            "INSERT INTO history (id, date, keywords, product_name) VALUES (?, ?, ?, ?)",
            (
                item["id"],
                item["date"],
                item.get("keywords", ""),
                item.get("productName", ""),
            ),
        )

    for video in item.get("videos", []):
        video_file_id = _get_or_create_video_file(conn, video["fileName"])
        existing_video = conn.execute(
            "SELECT id FROM history_video WHERE history_id = ? AND file_name = ?",
            (item["id"], video["fileName"]),
        ).fetchone()

        if existing_video:
            conn.execute(
                """
                UPDATE history_video
                SET status = ?, error = ?, source = COALESCE(?, source), product_name_override = COALESCE(?, product_name_override), current_version_index = ?, current_search_keywords = ?, video_file_id = ?
                WHERE id = ?
                """,
                (
                    video.get("status", "pending"),
                    video.get("error"),
                    video.get("source"),
                    video.get("productNameOverride") or None,
                    video.get("currentVersionIndex", 0),
                    video.get("currentSearchKeywords", ""),
                    video_file_id,
                    existing_video["id"],
                ),
            )
        else:
            conn.execute(
                """
                INSERT INTO history_video (
                    history_id, file_name, source, product_name_override, status, error, current_version_index, current_search_keywords, video_file_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    item["id"],
                    video["fileName"],
                    video.get("source", "web"),
                    video.get("productNameOverride", ""),
                    video.get("status", "pending"),
                    video.get("error"),
                    video.get("currentVersionIndex", 0),
                    video.get("currentSearchKeywords", ""),
                    video_file_id,
                ),
            )

        _ensure_video_file_folder_defaults(
            conn,
            video_file_id,
            preferred_folder_name=_effective_folder_name(
                item.get("productName", ""), video.get("productNameOverride", "")
            ),
            allow_default_promotion=not _video_file_has_versions(conn, video_file_id),
        )

    conn.commit()
    return _get_history_item(item["id"])


def update_video_selection(
    history_id: str,
    filename: str,
    current_version_index: int,
    current_search_keywords: str,
) -> dict | None:
    conn = _get_conn()
    now = int(time.time() * 1000)

    conn.execute(
        "UPDATE history SET date = ?, keywords = ? WHERE id = ?",
        (now, current_search_keywords, history_id),
    )
    conn.execute(
        """
        UPDATE history_video
        SET current_version_index = ?, current_search_keywords = ?
        WHERE history_id = ? AND file_name = ?
        """,
        (current_version_index, current_search_keywords, history_id, filename),
    )
    conn.commit()
    return _get_history_item(history_id)


def update_video_selection_by_db_video_id(
    db_video_id: int,
    current_version_index: int,
    current_search_keywords: str,
) -> dict | None:
    conn = _get_conn()
    now = int(time.time() * 1000)
    row = conn.execute(
        "SELECT history_id FROM history_video WHERE id = ?", (db_video_id,)
    ).fetchone()
    if not row:
        return None

    conn.execute(
        "UPDATE history SET date = ?, keywords = ? WHERE id = ?",
        (now, current_search_keywords, row["history_id"]),
    )
    conn.execute(
        """
        UPDATE history_video
        SET current_version_index = ?, current_search_keywords = ?
        WHERE id = ?
        """,
        (current_version_index, current_search_keywords, db_video_id),
    )
    conn.commit()
    return _get_history_item(row["history_id"])


def delete_history(history_id: str) -> bool:
    conn = _get_conn()
    cur = conn.execute("DELETE FROM history WHERE id = ?", (history_id,))
    conn.commit()
    return cur.rowcount > 0


def delete_dataset(db_video_id: int) -> dict | None:
    conn = _get_conn()
    row = conn.execute(
        "SELECT id, history_id FROM history_video WHERE id = ?", (db_video_id,)
    ).fetchone()
    if not row:
        return None

    history_id = row["history_id"]
    conn.execute("DELETE FROM history_video WHERE id = ?", (db_video_id,))

    remaining = conn.execute(
        "SELECT COUNT(*) AS cnt FROM history_video WHERE history_id = ?", (history_id,)
    ).fetchone()["cnt"]

    deleted_history = False
    if remaining == 0:
        conn.execute("DELETE FROM history WHERE id = ?", (history_id,))
        deleted_history = True

    conn.commit()
    return {
        "historyId": history_id,
        "deletedHistory": deleted_history,
    }


def save_analysis(
    history_id: str,
    filename: str,
    keywords: str,
    scenes: list[dict],
    product_name: str = "",
) -> dict:
    conn = _get_conn()
    now = int(time.time() * 1000)

    existing = conn.execute(
        "SELECT id FROM history WHERE id = ?", (history_id,)
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

    video_file_id = _get_or_create_video_file(conn, filename)
    hv = _find_history_video(conn, history_id, filename, video_file_id)

    if hv:
        video_id = hv["id"]
        conn.execute(
            "UPDATE history_video SET file_name = ?, video_file_id = ? WHERE id = ?",
            (filename, video_file_id, video_id),
        )
    else:
        cur = conn.execute(
            """
            INSERT INTO history_video (
                history_id, file_name, source, product_name_override, status, current_version_index, current_search_keywords, video_file_id
            ) VALUES (?, ?, 'web', '', 'success', 0, '', ?)
            """,
            (history_id, filename, video_file_id),
        )
        video_id = cur.lastrowid

    history_row = conn.execute(
        "SELECT product_name FROM history WHERE id = ?", (history_id,)
    ).fetchone()
    _ensure_video_file_folder_defaults(
        conn,
        video_file_id,
        preferred_folder_name=_effective_folder_name(
            history_row["product_name"] if history_row else "", ""
        ),
        allow_default_promotion=not _video_file_has_versions(conn, video_file_id),
    )

    version_id = _new_version_id()
    conn.execute(
        "INSERT INTO video_version (id, video_id, timestamp, keywords, scenes) VALUES (?, ?, ?, ?, ?)",
        (version_id, video_id, now, keywords, json.dumps(scenes, ensure_ascii=False)),
    )

    ver_count = conn.execute(
        "SELECT COUNT(*) as cnt FROM video_version WHERE video_id = ?", (video_id,)
    ).fetchone()["cnt"]
    conn.execute(
        """
        UPDATE history_video
        SET status = 'success', error = NULL, current_version_index = ?, current_search_keywords = ''
        WHERE id = ?
        """,
        (ver_count - 1, video_id),
    )

    conn.commit()
    return {"history": _get_history_item(history_id), "version_id": version_id}


def save_import_analysis(
    filename: str, video_file_id: int, scenes: list[dict], product_name: str = ""
) -> dict:
    conn = _get_conn()
    now = int(time.time() * 1000)
    history_id = _find_import_history_id(conn, filename, video_file_id)

    existing_history = conn.execute(
        "SELECT id FROM history WHERE id = ?", (history_id,)
    ).fetchone()
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

    hv = _find_history_video(conn, history_id, filename, video_file_id, source="extension")

    if hv:
        video_id = hv["id"]
        conn.execute(
            "UPDATE history_video SET file_name = ?, video_file_id = ? WHERE id = ?",
            (filename, video_file_id, video_id),
        )
        # Check if the exact same scenes already exist in the latest version
        last_version = conn.execute(
            "SELECT id, scenes FROM video_version WHERE video_id = ? ORDER BY timestamp DESC LIMIT 1",
            (video_id,),
        ).fetchone()

        if last_version:
            try:
                last_scenes = json.loads(last_version["scenes"])
                if last_scenes == scenes:
                    if product_name.strip():
                        conn.execute(
                            "UPDATE history SET product_name = CASE WHEN product_name = '' THEN ? ELSE product_name END WHERE id = ?",
                            (product_name.strip(), history_id),
                        )
                    history_row = conn.execute(
                        "SELECT product_name FROM history WHERE id = ?", (history_id,)
                    ).fetchone()
                    _ensure_video_file_folder_defaults(
                        conn,
                        video_file_id,
                        preferred_folder_name=_effective_folder_name(
                            history_row["product_name"] if history_row else "", ""
                        ),
                        allow_default_promotion=not _video_file_has_versions(
                            conn, video_file_id
                        ),
                    )
                    conn.commit()
                    return {
                        "history": _get_history_item(history_id),
                        "version_id": last_version["id"],
                        "is_duplicate": True,
                    }
            except Exception:
                pass
    else:
        cur = conn.execute(
            """
            INSERT INTO history_video (
                history_id, file_name, source, product_name_override, status, current_version_index, current_search_keywords, video_file_id
            ) VALUES (?, ?, 'extension', '', 'success', 0, '', ?)
            """,
            (history_id, filename, video_file_id),
        )
        video_id = cur.lastrowid

    history_row = conn.execute(
        "SELECT product_name FROM history WHERE id = ?", (history_id,)
    ).fetchone()
    _ensure_video_file_folder_defaults(
        conn,
        video_file_id,
        preferred_folder_name=_effective_folder_name(
            history_row["product_name"] if history_row else "", ""
        ),
        allow_default_promotion=not _video_file_has_versions(conn, video_file_id),
    )

    version_id = _new_version_id()
    conn.execute(
        "INSERT INTO video_version (id, video_id, timestamp, keywords, scenes) VALUES (?, ?, ?, '', ?)",
        (version_id, video_id, now, json.dumps(scenes, ensure_ascii=False)),
    )

    version_count = conn.execute(
        "SELECT COUNT(*) as cnt FROM video_version WHERE video_id = ?", (video_id,)
    ).fetchone()["cnt"]
    conn.execute(
        """
        UPDATE history_video
        SET status = 'success', error = NULL, current_version_index = ?, current_search_keywords = ''
        WHERE id = ?
        """,
        (version_count - 1, video_id),
    )

    conn.commit()
    return {
        "history": _get_history_item(history_id),
        "version_id": version_id,
        "is_duplicate": False,
    }


def get_version_scenes(version_id: str) -> list[dict] | None:
    conn = _get_conn()
    row = conn.execute(
        "SELECT scenes FROM video_version WHERE id = ?", (version_id,)
    ).fetchone()
    if not row:
        return None
    return json.loads(row["scenes"])


def get_video_versions_for_storyboard(version_ids: list[str]) -> list[dict]:
    if not version_ids:
        return []

    conn = _get_conn()
    placeholders = ",".join("?" for _ in version_ids)
    rows = conn.execute(
        f"""
        SELECT vv.id AS version_id, vv.timestamp, vv.scenes, hv.file_name
        FROM video_version vv
        JOIN history_video hv ON hv.id = vv.video_id
        WHERE vv.id IN ({placeholders})
        """,
        version_ids,
    ).fetchall()

    by_id = {
        row["version_id"]: {
            "versionId": row["version_id"],
            "timestamp": row["timestamp"],
            "fileName": row["file_name"],
            "scenes": json.loads(row["scenes"]),
        }
        for row in rows
    }

    return [by_id[version_id] for version_id in version_ids if version_id in by_id]


def _new_storyboard_id() -> str:
    return f"storyboard-{uuid.uuid4().hex}"


def _safe_json_value(raw: str, fallback: Any, expected_type: type) -> Any:
    try:
        value = json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return fallback
    if not isinstance(value, expected_type):
        return fallback
    return value


def _load_storyboard_folder(folder_id: int | None) -> dict | None:
    if not folder_id:
        return None
    conn = _get_conn()
    row = conn.execute(
        "SELECT id, name, is_system FROM product_folder WHERE id = ?", (folder_id,)
    ).fetchone()
    if not row:
        return None
    return {
        "id": row["id"],
        "name": row["name"],
        "isSystem": bool(row["is_system"]),
    }


def _storyboard_row_to_dict(row: sqlite3.Row, include_result: bool) -> dict:
    result = _safe_json_value(row["result_json"], {}, dict)
    selected_version_ids = _safe_json_value(row["selected_version_ids"], [], list)
    candidate_snapshot = _safe_json_value(row["candidate_snapshot_json"], [], list)
    payload = {
        "id": row["id"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "productName": row["product_name"],
        "productDescription": row["product_description"] if "product_description" in row.keys() else "",
        "category": row["category"],
        "targetAudience": row["target_audience"],
        "tone": row["tone"],
        "keyBenefits": row["key_benefits"],
        "scriptText": row["script_text"],
        "selectedVersionIds": selected_version_ids,
        "candidateSnapshot": candidate_snapshot,
        "source": row["source"],
        "folder": _load_storyboard_folder(row["folder_id"] if "folder_id" in row.keys() else None),
        "beatCount": len(result.get("beats", [])),
    }
    if include_result:
        payload["result"] = result
    return payload


def save_storyboard_project(payload: dict[str, Any]) -> dict:
    conn = _get_conn()
    now = int(time.time() * 1000)
    storyboard_id = payload.get("id") or _new_storyboard_id()
    created_at = payload.get("createdAt") or now
    conn.execute(
        """
        INSERT INTO storyboard_project (
            id, created_at, updated_at, product_name, product_description, category, target_audience,
            tone, key_benefits, script_text, selected_version_ids,
            candidate_snapshot_json, result_json, source, folder_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            updated_at = excluded.updated_at,
            product_name = excluded.product_name,
            product_description = excluded.product_description,
            category = excluded.category,
            target_audience = excluded.target_audience,
            tone = excluded.tone,
            key_benefits = excluded.key_benefits,
            script_text = excluded.script_text,
            selected_version_ids = excluded.selected_version_ids,
            candidate_snapshot_json = excluded.candidate_snapshot_json,
            result_json = excluded.result_json,
            source = excluded.source,
            folder_id = excluded.folder_id
        """,
        (
            storyboard_id,
            created_at,
            now,
            payload.get("product_name") or payload.get("productName") or "",
            payload.get("product_description") or payload.get("productDescription") or "",
            payload.get("category") or "",
            payload.get("target_audience") or payload.get("targetAudience") or "",
            payload.get("tone") or "",
            payload.get("key_benefits") or payload.get("keyBenefits") or "",
            payload.get("script_text") or payload.get("scriptText") or "",
            json.dumps(
                payload.get("selected_version_ids")
                or payload.get("selectedVersionIds")
                or [],
                ensure_ascii=False,
            ),
            json.dumps(
                payload.get("candidate_snapshot")
                or payload.get("candidateSnapshot")
                or [],
                ensure_ascii=False,
            ),
            json.dumps(payload.get("result") or {}, ensure_ascii=False),
            payload.get("source") or "generated",
            payload.get("folder_id") or payload.get("folderId"),
        ),
    )
    conn.commit()
    return get_storyboard_project(storyboard_id)


def list_storyboard_projects() -> list[dict]:
    conn = _get_conn()
    rows = conn.execute(
        "SELECT * FROM storyboard_project ORDER BY updated_at DESC, created_at DESC"
    ).fetchall()
    return [_storyboard_row_to_dict(row, include_result=False) for row in rows]


def get_storyboard_project(storyboard_id: str) -> dict | None:
    conn = _get_conn()
    row = conn.execute(
        "SELECT * FROM storyboard_project WHERE id = ?", (storyboard_id,)
    ).fetchone()
    if not row:
        return None
    return _storyboard_row_to_dict(row, include_result=True)


def delete_storyboard_project(storyboard_id: str) -> bool:
    conn = _get_conn()
    cur = conn.execute("DELETE FROM storyboard_project WHERE id = ?", (storyboard_id,))
    conn.commit()
    return cur.rowcount > 0


def save_search_result(
    version_id: str,
    keywords: str,
    scenes: list[dict],
    error: str | None = None,
) -> dict | None:
    conn = _get_conn()
    now = int(time.time() * 1000)

    version = conn.execute(
        """
        SELECT vv.id AS version_id, hv.id AS video_id, hv.history_id AS history_id
        FROM video_version vv
        JOIN history_video hv ON hv.id = vv.video_id
        WHERE vv.id = ?
        """,
        (version_id,),
    ).fetchone()
    if not version:
        return None

    existing = conn.execute(
        "SELECT id FROM search_result WHERE video_version_id = ? AND keywords = ?",
        (version_id, keywords),
    ).fetchone()

    if existing:
        search_id = existing["id"]
        conn.execute(
            """
            UPDATE search_result
            SET timestamp = ?, scenes = ?, error = ?
            WHERE id = ?
            """,
            (now, json.dumps(scenes, ensure_ascii=False), error, search_id),
        )
    else:
        search_id = f"{version_id}:{now}"
        conn.execute(
            """
            INSERT INTO search_result (id, video_version_id, keywords, timestamp, scenes, error)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                search_id,
                version_id,
                keywords,
                now,
                json.dumps(scenes, ensure_ascii=False),
                error,
            ),
        )

    conn.execute(
        "UPDATE history SET date = ?, keywords = ? WHERE id = ?",
        (now, keywords, version["history_id"]),
    )
    conn.execute(
        "UPDATE history_video SET current_search_keywords = ? WHERE id = ?",
        (keywords, version["video_id"]),
    )

    conn.commit()
    return _get_history_item(version["history_id"])


def save_analysis_error(
    history_id: str,
    filename: str,
    keywords: str,
    error_msg: str,
    product_name: str = "",
) -> None:
    conn = _get_conn()
    now = int(time.time() * 1000)

    existing = conn.execute(
        "SELECT id FROM history WHERE id = ?", (history_id,)
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

    video_file_id = _get_or_create_video_file(conn, filename)
    hv = _find_history_video(conn, history_id, filename, video_file_id)

    if hv:
        conn.execute(
            """
            UPDATE history_video
            SET file_name = ?, status = 'error', error = ?, source = 'web', current_search_keywords = '', video_file_id = ?
            WHERE id = ?
            """,
            (filename, error_msg, video_file_id, hv["id"]),
        )
    else:
        conn.execute(
            """
            INSERT INTO history_video (
                history_id, file_name, source, product_name_override, status, error, current_version_index, current_search_keywords, video_file_id
            ) VALUES (?, ?, 'web', '', 'error', ?, 0, '', ?)
            """,
            (history_id, filename, error_msg, video_file_id),
        )

    history_row = conn.execute(
        "SELECT product_name FROM history WHERE id = ?", (history_id,)
    ).fetchone()
    _ensure_video_file_folder_defaults(
        conn,
        video_file_id,
        preferred_folder_name=_effective_folder_name(
            history_row["product_name"] if history_row else "", ""
        ),
        allow_default_promotion=not _video_file_has_versions(conn, video_file_id),
    )

    conn.commit()


def update_history_product_name(history_id: str, product_name: str) -> dict | None:
    conn = _get_conn()
    cur = conn.execute(
        "UPDATE history SET product_name = ?, date = ? WHERE id = ?",
        (product_name.strip(), int(time.time() * 1000), history_id),
    )
    videos = conn.execute(
        "SELECT video_file_id, product_name_override FROM history_video WHERE history_id = ?",
        (history_id,),
    ).fetchall()
    for video in videos:
        if video["video_file_id"]:
            _ensure_video_file_folder_defaults(conn, video["video_file_id"])
    conn.commit()
    if cur.rowcount == 0:
        return None
    return _get_history_item(history_id)


def update_dataset_product_name(
    db_video_id: int, product_name_override: str
) -> dict | None:
    conn = _get_conn()
    row = conn.execute(
        "SELECT history_id FROM history_video WHERE id = ?", (db_video_id,)
    ).fetchone()
    if not row:
        return None

    conn.execute(
        "UPDATE history_video SET product_name_override = ? WHERE id = ?",
        (product_name_override.strip(), db_video_id),
    )
    video = conn.execute(
        "SELECT video_file_id FROM history_video WHERE id = ?",
        (db_video_id,),
    ).fetchone()
    if video and video["video_file_id"]:
        _ensure_video_file_folder_defaults(conn, video["video_file_id"])
    conn.execute(
        "UPDATE history SET date = ? WHERE id = ?",
        (int(time.time() * 1000), row["history_id"]),
    )
    conn.commit()
    return _get_history_item(row["history_id"])


def get_video_file_filename(video_file_id: int) -> str | None:
    conn = _get_conn()
    row = conn.execute(
        "SELECT filename FROM video_file WHERE id = ?", (video_file_id,)
    ).fetchone()
    if not row:
        return None
    return row["filename"]


def rename_video_file_references(video_file_id: int, new_filename: str) -> dict:
    conn = _get_conn()
    row = conn.execute(
        "SELECT filename FROM video_file WHERE id = ?", (video_file_id,)
    ).fetchone()
    if not row:
        raise ValueError("Không tìm thấy video")
    now = int(time.time() * 1000)
    history_rows = conn.execute(
        "SELECT DISTINCT history_id FROM history_video WHERE video_file_id = ?",
        (video_file_id,),
    ).fetchall()
    if not history_rows:
        raise ValueError("Không tìm thấy dataset cho video này")

    try:
        conn.execute("BEGIN")
        conn.execute(
            "UPDATE video_file SET filename = ? WHERE id = ?",
            (new_filename, video_file_id),
        )
        conn.execute(
            "UPDATE history_video SET file_name = ? WHERE video_file_id = ?",
            (new_filename, video_file_id),
        )
        for history_row in history_rows:
            conn.execute(
                "UPDATE history SET date = ? WHERE id = ?",
                (now, history_row["history_id"]),
            )
        conn.commit()
    except sqlite3.IntegrityError as exc:
        conn.rollback()
        raise ValueError("Tên file đã tồn tại") from exc
    except Exception:
        conn.rollback()
        raise

    return _mutation_result(conn, [video_file_id])


def update_video_file(
    video_file_id: int, filename: str | None = None, folder_id: int | None = None
) -> dict:
    conn = _get_conn()
    video = _get_video_file_row(conn, video_file_id)
    current_filename = conn.execute(
        "SELECT filename FROM video_file WHERE id = ?", (video_file_id,)
    ).fetchone()["filename"]

    normalized_filename = None
    if filename is not None:
        normalized_filename = filename.strip()
        if not normalized_filename:
            raise ValueError("Tên file không được để trống")

    if folder_id is not None:
        _get_product_folder_row(conn, folder_id)

    history_rows = conn.execute(
        "SELECT DISTINCT history_id FROM history_video WHERE video_file_id = ?",
        (video_file_id,),
    ).fetchall()
    if not history_rows:
        raise ValueError("Không tìm thấy dataset cho video này")

    should_update_filename = (
        normalized_filename is not None and normalized_filename != current_filename
    )
    should_update_folder = (
        folder_id is not None and folder_id != video["primary_product_folder_id"]
    )

    if not should_update_filename and not should_update_folder:
        return _mutation_result(conn, [video_file_id])

    now = int(time.time() * 1000)
    try:
        conn.execute("BEGIN")
        if should_update_filename:
            conn.execute(
                "UPDATE video_file SET filename = ? WHERE id = ?",
                (normalized_filename, video_file_id),
            )
            conn.execute(
                "UPDATE history_video SET file_name = ? WHERE video_file_id = ?",
                (normalized_filename, video_file_id),
            )

        if should_update_folder:
            conn.execute(
                "UPDATE video_file SET primary_product_folder_id = ? WHERE id = ?",
                (folder_id, video_file_id),
            )

        for history_row in history_rows:
            conn.execute(
                "UPDATE history SET date = ? WHERE id = ?",
                (now, history_row["history_id"]),
            )
        conn.commit()
    except sqlite3.IntegrityError as exc:
        conn.rollback()
        if should_update_filename:
            raise ValueError("Tên file đã tồn tại") from exc
        raise
    except Exception:
        conn.rollback()
        raise

    return _mutation_result(conn, [video_file_id])


def create_product_folder(name: str) -> dict:
    conn = _get_conn()
    now = int(time.time() * 1000)
    normalized_name = _normalize_folder_name(name)
    try:
        conn.execute(
            """
            INSERT INTO product_folder (name, is_system, created_at, updated_at)
            VALUES (?, 0, ?, ?)
            """,
            (normalized_name, now, now),
        )
    except sqlite3.IntegrityError as exc:
        raise ValueError("Tên thư mục đã tồn tại") from exc
    conn.commit()
    return _mutation_result(conn)


def rename_product_folder(folder_id: int, name: str) -> dict:
    conn = _get_conn()
    folder = _get_product_folder_row(conn, folder_id)
    if folder["is_system"]:
        raise ValueError("Không thể đổi tên thư mục hệ thống")

    affected_video_rows = conn.execute(
        "SELECT id FROM video_file WHERE primary_product_folder_id = ?",
        (folder_id,),
    ).fetchall()
    affected_video_file_ids = [row["id"] for row in affected_video_rows]

    try:
        conn.execute(
            "UPDATE product_folder SET name = ?, updated_at = ? WHERE id = ?",
            (_normalize_folder_name(name), int(time.time() * 1000), folder_id),
        )
    except sqlite3.IntegrityError as exc:
        raise ValueError("Tên thư mục đã tồn tại") from exc
    conn.commit()
    return _mutation_result(conn, affected_video_file_ids)


def delete_product_folder(folder_id: int) -> dict:
    conn = _get_conn()
    folder = _get_product_folder_row(conn, folder_id)
    if folder["is_system"]:
        raise ValueError("Không thể xóa thư mục hệ thống")

    replacement_folder_id = _ensure_unclassified_folder(conn)

    primary_video_rows = conn.execute(
        "SELECT id FROM video_file WHERE primary_product_folder_id = ?",
        (folder_id,),
    ).fetchall()
    primary_video_file_ids = [row["id"] for row in primary_video_rows]

    conn.execute(
        """
        UPDATE video_file
        SET primary_product_folder_id = ?
        WHERE primary_product_folder_id = ?
        """,
        (replacement_folder_id, folder_id),
    )
    conn.execute("DELETE FROM product_folder WHERE id = ?", (folder_id,))
    conn.commit()
    return _mutation_result(conn, primary_video_file_ids)
