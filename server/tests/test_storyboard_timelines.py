import pytest
from fastapi.testclient import TestClient

import db
import server.main as main
from db import (
    create_storyboard_timeline,
    delete_storyboard_project,
    delete_storyboard_timeline,
    get_storyboard_project,
    list_storyboard_timelines,
    replace_storyboard_timeline_clips,
    save_storyboard_project,
    update_storyboard_timeline,
)


client = TestClient(main.app)
client_without_server_exceptions = TestClient(main.app, raise_server_exceptions=False)


def _reset_db_connection():
    conn = getattr(db._local, "conn", None)
    if conn is not None:
        conn.close()
        delattr(db._local, "conn")


def _reset_storyboard_tables():
    conn = db._get_conn()
    conn.execute("DELETE FROM storyboard_timeline_clip")
    conn.execute("DELETE FROM storyboard_timeline")
    conn.execute("DELETE FROM storyboard_project")
    conn.commit()


@pytest.fixture(scope="module")
def timeline_db_path(tmp_path_factory):
    db_path = tmp_path_factory.mktemp("storyboard_timelines") / "storyboard_timelines.db"
    original_db_path = db.DB_PATH
    _reset_db_connection()
    db.DB_PATH = db_path
    db.init_db()
    yield db_path
    _reset_db_connection()
    db.DB_PATH = original_db_path


@pytest.fixture()
def temp_db(timeline_db_path):
    _reset_storyboard_tables()
    yield timeline_db_path
    _reset_storyboard_tables()


@pytest.fixture()
def timeline_with_clip(temp_db):
    storyboard = _save_storyboard("Export errors")
    timeline = create_storyboard_timeline(storyboard["id"], "Version 1")
    replace_storyboard_timeline_clips(
        timeline["id"],
        [
            {
                "beat_id": "beat-1",
                "label": "Hook",
                "filename": "missing.mp4",
                "start": 0,
                "end": 3,
                "scene_index": 0,
            }
        ],
    )
    return timeline


def _save_storyboard(product_name: str = "SP") -> dict:
    storyboard = save_storyboard_project(
        {
            "product_name": product_name,
            "product_description": "Mo ta",
            "category": "Lam dep",
            "target_audience": "Nu 25-35",
            "tone": "Nhanh",
            "key_benefits": "Tiet kiem thoi gian",
            "script_text": "Hook\nDemo\nCTA",
            "selected_version_ids": [],
            "candidate_snapshot": [],
            "result": {"beats": [], "beatMatches": []},
            "source": "generated",
        }
    )
    assert storyboard is not None
    return storyboard


def test_storyboard_can_have_multiple_timelines(temp_db):
    storyboard = _save_storyboard("Kem tri nam")

    first = create_storyboard_timeline(storyboard["id"], "Version 1")
    second = create_storyboard_timeline(storyboard["id"], "Hook nhanh")

    timelines = list_storyboard_timelines(storyboard["id"])

    assert [timeline["id"] for timeline in timelines] == [first["id"], second["id"]]
    assert [timeline["name"] for timeline in timelines] == ["Version 1", "Hook nhanh"]
    assert timelines[0]["clips"] == []
    assert timelines[1]["clips"] == []


def test_timeline_clips_are_isolated_per_timeline(temp_db):
    storyboard = _save_storyboard("Serum")
    first = create_storyboard_timeline(storyboard["id"], "Version 1")
    second = create_storyboard_timeline(storyboard["id"], "Version 2")

    replace_storyboard_timeline_clips(
        first["id"],
        [
            {
                "beat_id": "beat-1",
                "label": "Hook",
                "filename": "video-a.mp4",
                "start": 1.2,
                "end": 4.8,
                "scene_index": 0,
            }
        ],
    )

    timelines = {item["id"]: item for item in list_storyboard_timelines(storyboard["id"])}

    assert len(timelines[first["id"]]["clips"]) == 1
    assert timelines[first["id"]]["clips"][0]["label"] == "Hook"
    assert timelines[first["id"]]["clips"][0]["position"] == 0
    assert timelines[second["id"]]["clips"] == []


def test_update_and_delete_storyboard_timeline(temp_db):
    storyboard = _save_storyboard("Sua rua mat")
    timeline = create_storyboard_timeline(storyboard["id"], "Version 1")

    updated = update_storyboard_timeline(timeline["id"], {"name": "Version 2", "position": 3})
    assert updated is not None
    assert updated["name"] == "Version 2"
    assert updated["position"] == 3

    assert delete_storyboard_timeline(timeline["id"]) is True
    assert list_storyboard_timelines(storyboard["id"]) == []


def test_deleting_storyboard_removes_timelines_and_clips(temp_db):
    storyboard = _save_storyboard("May massage")
    timeline = create_storyboard_timeline(storyboard["id"], "Version 1")
    replace_storyboard_timeline_clips(
        timeline["id"],
        [
            {
                "beat_id": "beat-1",
                "label": "Demo",
                "filename": "video-b.mp4",
                "start": 10,
                "end": 14,
                "scene_index": 2,
            }
        ],
    )

    assert delete_storyboard_project(storyboard["id"]) is True
    assert get_storyboard_project(storyboard["id"]) is None
    assert list_storyboard_timelines(storyboard["id"]) == []


def test_invalid_clip_replacement_keeps_existing_clips(temp_db):
    storyboard = _save_storyboard("Son duong")
    timeline = create_storyboard_timeline(storyboard["id"], "Version 1")
    replace_storyboard_timeline_clips(
        timeline["id"],
        [
            {
                "beat_id": "beat-1",
                "label": "Existing",
                "filename": "video-old.mp4",
                "start": 2,
                "end": 5,
                "scene_index": 1,
            }
        ],
    )

    with pytest.raises(ValueError):
        replace_storyboard_timeline_clips(
            timeline["id"],
            [
                {
                    "beat_id": "beat-2",
                    "label": "Invalid",
                    "filename": "video-new.mp4",
                    "start": "abc",
                    "end": 8,
                    "scene_index": 2,
                }
            ],
        )

    clips = list_storyboard_timelines(storyboard["id"])[0]["clips"]
    assert len(clips) == 1
    assert clips[0]["label"] == "Existing"
    assert clips[0]["filename"] == "video-old.mp4"


def test_timeline_api_create_list_and_replace_clips(temp_db):
    storyboard = _save_storyboard("API product")

    create_response = client.post(
        f"/api/storyboards/{storyboard['id']}/timelines",
        json={"name": "Version API"},
    )
    assert create_response.status_code == 200
    timeline = create_response.json()
    assert timeline["name"] == "Version API"

    replace_response = client.put(
        f"/api/storyboard-timelines/{timeline['id']}/clips",
        json={
            "clips": [
                {
                    "beatId": "beat-1",
                    "label": "Hook",
                    "filename": "video-a.mp4",
                    "start": 0,
                    "end": 3,
                    "sceneIndex": 0,
                }
            ]
        },
    )
    assert replace_response.status_code == 200
    assert replace_response.json()["clips"][0]["position"] == 0

    list_response = client.get(f"/api/storyboards/{storyboard['id']}/timelines")
    assert list_response.status_code == 200
    assert list_response.json()["timelines"][0]["clips"][0]["label"] == "Hook"


def test_timeline_clip_replace_rejects_invalid_filename(temp_db):
    storyboard = _save_storyboard("Invalid filename")
    timeline = create_storyboard_timeline(storyboard["id"], "Version 1")

    response = client.put(
        f"/api/storyboard-timelines/{timeline['id']}/clips",
        json={
            "clips": [
                {
                    "beatId": "beat-1",
                    "label": "Traversal",
                    "filename": "../evil.mp4",
                    "start": 0,
                    "end": 3,
                    "sceneIndex": 0,
                }
            ]
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] in {
        "Invalid video filename",
        "Tên file không hợp lệ",
    }


def test_timeline_api_returns_404_for_missing_storyboard(temp_db):
    response = client.post("/api/storyboards/missing/timelines", json={"name": "Version"})
    assert response.status_code == 404
    assert response.json()["detail"] == "Storyboard not found"


def test_timeline_export_rejects_empty_timeline(temp_db):
    storyboard = _save_storyboard("Empty export")
    timeline = create_storyboard_timeline(storyboard["id"], "Version 1")

    response = client.post(f"/api/storyboard-timelines/{timeline['id']}/export")

    assert response.status_code == 400
    assert response.json()["detail"] == "Timeline is empty"


def test_timeline_export_returns_404_when_source_video_missing(
    timeline_with_clip, monkeypatch
):
    def missing_video(_filename):
        raise FileNotFoundError("missing")

    monkeypatch.setattr(main, "FFMPEG_PATH", "ffmpeg")
    monkeypatch.setattr(main, "get_video_path", missing_video)

    response = client_without_server_exceptions.post(
        f"/api/storyboard-timelines/{timeline_with_clip['id']}/export"
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Source video not found"


def test_timeline_export_returns_400_when_source_filename_invalid(
    timeline_with_clip, monkeypatch
):
    def invalid_filename(_filename):
        raise ValueError("invalid")

    monkeypatch.setattr(main, "FFMPEG_PATH", "ffmpeg")
    monkeypatch.setattr(main, "get_video_path", invalid_filename)

    response = client_without_server_exceptions.post(
        f"/api/storyboard-timelines/{timeline_with_clip['id']}/export"
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid video filename"
