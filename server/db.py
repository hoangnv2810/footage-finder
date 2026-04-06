import json
import os
import sqlite3
import threading
import time
from typing import Any

DB_PATH = os.path.join(os.path.dirname(__file__), "data.db")

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


def init_db() -> None:
    conn = _get_conn()
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS history (
            id TEXT PRIMARY KEY,
            date INTEGER NOT NULL,
            keywords TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS history_video (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            history_id TEXT NOT NULL REFERENCES history(id) ON DELETE CASCADE,
            file_name TEXT NOT NULL,
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
            last_scanned INTEGER NOT NULL
        );
    """
    )

    if not _has_column(conn, "history_video", "current_search_keywords"):
        conn.execute(
            "ALTER TABLE history_video ADD COLUMN current_search_keywords TEXT NOT NULL DEFAULT ''"
        )

    conn.commit()


def save_video_file(filename: str, size_bytes: int, modified_at: float) -> None:
    conn = _get_conn()
    now = int(time.time() * 1000)
    conn.execute(
        """INSERT INTO video_file (filename, size_bytes, modified_at, last_scanned)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(filename) DO UPDATE SET size_bytes=?, modified_at=?, last_scanned=?""",
        (filename, size_bytes, modified_at, now, size_bytes, modified_at, now),
    )
    conn.commit()


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


def _video_row_to_dict(
    row: sqlite3.Row, versions: list[dict], search_results: list[dict]
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

    return {
        "dbVideoId": row["id"],
        "fileName": row["file_name"],
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
        "videos": [
            _video_row_to_dict(
                v, _load_versions(conn, v["id"]), _load_search_results(conn, v["id"])
            )
            for v in videos
        ],
    }


def list_history() -> list[dict]:
    conn = _get_conn()
    rows = conn.execute("SELECT * FROM history ORDER BY date DESC").fetchall()
    return [_history_item_from_row(conn, row) for row in rows]


def _get_history_item(history_id: str) -> dict | None:
    conn = _get_conn()
    row = conn.execute("SELECT * FROM history WHERE id = ?", (history_id,)).fetchone()
    if not row:
        return None
    return _history_item_from_row(conn, row)


def save_history(item: dict[str, Any]) -> dict:
    conn = _get_conn()
    existing = conn.execute(
        "SELECT id FROM history WHERE id = ?", (item["id"],)
    ).fetchone()

    if existing:
        conn.execute(
            "UPDATE history SET date = ?, keywords = ? WHERE id = ?",
            (item["date"], item.get("keywords", ""), item["id"]),
        )
    else:
        conn.execute(
            "INSERT INTO history (id, date, keywords) VALUES (?, ?, ?)",
            (item["id"], item["date"], item.get("keywords", "")),
        )

    for video in item.get("videos", []):
        existing_video = conn.execute(
            "SELECT id FROM history_video WHERE history_id = ? AND file_name = ?",
            (item["id"], video["fileName"]),
        ).fetchone()

        if existing_video:
            conn.execute(
                """
                UPDATE history_video
                SET status = ?, error = ?, current_version_index = ?, current_search_keywords = ?
                WHERE id = ?
                """,
                (
                    video.get("status", "pending"),
                    video.get("error"),
                    video.get("currentVersionIndex", 0),
                    video.get("currentSearchKeywords", ""),
                    existing_video["id"],
                ),
            )
        else:
            conn.execute(
                """
                INSERT INTO history_video (
                    history_id, file_name, status, error, current_version_index, current_search_keywords
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    item["id"],
                    video["fileName"],
                    video.get("status", "pending"),
                    video.get("error"),
                    video.get("currentVersionIndex", 0),
                    video.get("currentSearchKeywords", ""),
                ),
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


def delete_history(history_id: str) -> bool:
    conn = _get_conn()
    cur = conn.execute("DELETE FROM history WHERE id = ?", (history_id,))
    conn.commit()
    return cur.rowcount > 0


def save_analysis(
    history_id: str,
    filename: str,
    keywords: str,
    scenes: list[dict],
) -> dict:
    conn = _get_conn()
    now = int(time.time() * 1000)

    existing = conn.execute(
        "SELECT id FROM history WHERE id = ?", (history_id,)
    ).fetchone()
    if not existing:
        conn.execute(
            "INSERT INTO history (id, date, keywords) VALUES (?, ?, ?)",
            (history_id, now, keywords),
        )
    else:
        conn.execute(
            "UPDATE history SET date = ?, keywords = ? WHERE id = ?",
            (now, keywords, history_id),
        )

    hv = conn.execute(
        "SELECT id FROM history_video WHERE history_id = ? AND file_name = ?",
        (history_id, filename),
    ).fetchone()

    if hv:
        video_id = hv["id"]
    else:
        cur = conn.execute(
            """
            INSERT INTO history_video (
                history_id, file_name, status, current_version_index, current_search_keywords
            ) VALUES (?, ?, 'success', 0, '')
            """,
            (history_id, filename),
        )
        video_id = cur.lastrowid

    version_id = str(now)
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


def get_version_scenes(version_id: str) -> list[dict] | None:
    conn = _get_conn()
    row = conn.execute(
        "SELECT scenes FROM video_version WHERE id = ?", (version_id,)
    ).fetchone()
    if not row:
        return None
    return json.loads(row["scenes"])


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
    history_id: str, filename: str, keywords: str, error_msg: str
) -> None:
    conn = _get_conn()
    now = int(time.time() * 1000)

    existing = conn.execute(
        "SELECT id FROM history WHERE id = ?", (history_id,)
    ).fetchone()
    if not existing:
        conn.execute(
            "INSERT INTO history (id, date, keywords) VALUES (?, ?, ?)",
            (history_id, now, keywords),
        )
    else:
        conn.execute(
            "UPDATE history SET date = ?, keywords = ? WHERE id = ?",
            (now, keywords, history_id),
        )

    hv = conn.execute(
        "SELECT id FROM history_video WHERE history_id = ? AND file_name = ?",
        (history_id, filename),
    ).fetchone()

    if hv:
        conn.execute(
            """
            UPDATE history_video
            SET status = 'error', error = ?, current_search_keywords = ''
            WHERE id = ?
            """,
            (error_msg, hv["id"]),
        )
    else:
        conn.execute(
            """
            INSERT INTO history_video (
                history_id, file_name, status, error, current_version_index, current_search_keywords
            ) VALUES (?, ?, 'error', ?, 0, '')
            """,
            (history_id, filename, error_msg),
        )

    conn.commit()
