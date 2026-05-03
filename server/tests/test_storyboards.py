import httpx
import pytest
from fastapi.testclient import TestClient

from analysis import build_candidate_snapshot, normalize_imported_storyboard
import db
import main


client = TestClient(main.app)
client_without_server_exceptions = TestClient(main.app, raise_server_exceptions=False)


@pytest.fixture()
def temp_db(tmp_path, monkeypatch):
    db_path = tmp_path / "storyboards.db"
    existing_conn = getattr(db._local, "conn", None)
    if existing_conn is not None:
        existing_conn.close()
        delattr(db._local, "conn")
    monkeypatch.setattr(db, "DB_PATH", db_path)
    monkeypatch.setattr(db, "_conn", None, raising=False)
    db.init_db()
    yield db_path
    conn = getattr(db._local, "conn", None)
    if conn is not None:
        conn.close()
        delattr(db._local, "conn")
    if getattr(db, "_conn", None) is not None:
        db._conn.close()
        db._conn = None


def sample_payload():
    return {
        "product_name": "Serum Vitamin C",
        "category": "Skincare",
        "target_audience": "Phụ nữ 25-35",
        "tone": "Tươi sáng",
        "key_benefits": "Sáng da, mờ thâm",
        "script_text": "Serum Vitamin C giúp da rạng rỡ mỗi ngày.",
        "selected_version_ids": ["version-1"],
        "candidate_snapshot": [
            {
                "candidate_id": "candidate-1",
                "version_id": "version-1",
                "filename": "serum.mp4",
            }
        ],
        "result": {
            "beats": [
                {
                    "id": "beat-1",
                    "text": "Mở đầu với làn da rạng rỡ",
                    "matches": [],
                }
            ]
        },
        "source": "generated",
    }


def create_folder(name="Loa"):
    db.create_product_folder(name)
    return next(folder for folder in db.list_product_folders() if folder["name"] == name)


def sample_scene():
    return {
        "keyword": "demo",
        "start": 15,
        "end": 20,
        "description": "Cận sản phẩm",
        "context": "Sản phẩm trên bàn",
        "subjects": ["serum"],
        "actions": ["cầm sản phẩm"],
        "mood": "Tươi sáng",
        "shot_type": "close-up",
        "marketing_uses": ["hook"],
        "relevance_notes": "Phù hợp giới thiệu sản phẩm",
    }


def seed_storyboard_version():
    return db.save_analysis(
        "history-1",
        "demo.mp4",
        "demo",
        [sample_scene()],
        product_name="Serum Vitamin C",
    )["version_id"]


def storyboard_request(version_id: str):
    return {
        "product_name": "Serum Vitamin C",
        "category": "Skincare",
        "target_audience": "Phụ nữ 25-35",
        "tone": "Tươi sáng",
        "key_benefits": "Sáng da, mờ thâm",
        "script_text": "Serum Vitamin C giúp da rạng rỡ mỗi ngày.",
        "selected_version_ids": [version_id],
    }


def test_storyboard_generate_endpoint_saves_and_lists_project(temp_db, monkeypatch):
    version_id = seed_storyboard_version()
    folder = create_folder()

    async def fake_generate_storyboard(product, script_text, candidate_versions):
        return {
            "beats": [{"id": "beat-1", "text": "Mở đầu"}],
            "beatMatches": [
                {
                    "beatId": "beat-1",
                    "matches": [
                        {
                            "candidateId": f"{version_id}:0",
                            "score": 0.9,
                            "fileName": "demo.mp4",
                            "scene": sample_scene(),
                        }
                    ],
                }
            ],
        }

    monkeypatch.setattr(main, "generate_storyboard", fake_generate_storyboard)

    response = client.post("/api/storyboards/generate", json=storyboard_request(version_id) | {"folder_id": folder["id"]})

    assert response.status_code == 200
    saved = response.json()
    assert saved["id"].startswith("storyboard-")
    assert saved["source"] == "generated"
    assert saved["folder"] == {"id": folder["id"], "name": "Loa", "isSystem": False}
    assert saved["productName"] == "Serum Vitamin C"
    assert saved["candidateSnapshot"][0]["candidate_id"] == f"{version_id}:0"
    assert saved["result"]["beats"][0]["id"] == "beat-1"

    list_response = client.get("/api/storyboards")
    assert list_response.status_code == 200
    listed = list_response.json()["storyboards"]
    assert [item["id"] for item in listed] == [saved["id"]]
    assert listed[0]["folder"]["name"] == "Loa"
    assert "result" not in listed[0]

    get_response = client.get(f"/api/storyboards/{saved['id']}")
    assert get_response.status_code == 200
    assert get_response.json()["result"]["beats"][0]["id"] == "beat-1"


def test_storyboard_generate_endpoint_returns_vietnamese_timeout_error(temp_db, monkeypatch):
    version_id = seed_storyboard_version()

    async def fake_generate_storyboard(product, script_text, candidate_versions):
        raise httpx.ReadTimeout("model timeout")

    monkeypatch.setattr(main, "generate_storyboard", fake_generate_storyboard)

    response = client_without_server_exceptions.post(
        "/api/storyboards/generate", json=storyboard_request(version_id)
    )

    assert response.status_code == 504
    assert response.json()["detail"] == "Model tạo storyboard quá thời gian chờ. Hãy thử lại hoặc chọn ít video hơn."


def test_storyboard_import_endpoint_maps_and_saves_project(temp_db):
    version_id = seed_storyboard_version()
    payload = storyboard_request(version_id) | {
        "result_json": {
            "beats": [{"id": "beat-1", "text": "Mở đầu"}],
            "beatMatches": [
                {
                    "beatId": "beat-1",
                    "matches": [{"candidateId": f"{version_id}:0", "score": 0.93}],
                }
            ],
        }
    }

    response = client.post("/api/storyboards/import", json=payload)

    assert response.status_code == 200
    saved = response.json()
    assert saved["source"] == "imported"
    match = saved["result"]["beatMatches"][0]["matches"][0]
    assert match["fileName"] == "demo.mp4"
    assert match["scene"]["start"] == 15
    assert match["scene"]["end"] == 20


def test_storyboard_import_endpoint_returns_vietnamese_error_for_non_object_result(temp_db):
    version_id = seed_storyboard_version()
    payload = storyboard_request(version_id) | {"result_json": []}

    response = client.post("/api/storyboards/import", json=payload)

    assert response.status_code == 400
    assert response.json()["detail"] == "Storyboard import phải là JSON object."


def test_storyboard_delete_endpoint_removes_project(temp_db):
    saved = db.save_storyboard_project(sample_payload())

    delete_response = client.delete(f"/api/storyboards/{saved['id']}")

    assert delete_response.status_code == 200
    assert delete_response.json() == {"deleted": True}
    assert client.get(f"/api/storyboards/{saved['id']}").status_code == 404


def test_save_list_get_delete_storyboard(temp_db):
    folder = create_folder()
    saved = db.save_storyboard_project(sample_payload() | {"folder_id": folder["id"]})

    assert saved["id"]
    assert saved["id"].startswith("storyboard-")
    assert saved["productName"] == "Serum Vitamin C"
    assert saved["source"] == "generated"
    assert saved["folder"] == {"id": folder["id"], "name": "Loa", "isSystem": False}
    assert saved["beatCount"] == 1
    assert saved["result"]["beats"][0]["id"] == "beat-1"

    listed = db.list_storyboard_projects()
    assert [item["id"] for item in listed] == [saved["id"]]
    assert listed[0]["beatCount"] == 1
    assert listed[0]["folder"]["name"] == "Loa"
    assert "result" not in listed[0]

    loaded = db.get_storyboard_project(saved["id"])
    assert loaded["scriptText"] == "Serum Vitamin C giúp da rạng rỡ mỗi ngày."
    assert loaded["candidateSnapshot"][0]["candidate_id"] == "candidate-1"

    assert db.delete_storyboard_project(saved["id"]) is True
    assert db.get_storyboard_project(saved["id"]) is None


def test_init_db_migrates_old_storyboard_schema(temp_db):
    conn = db._get_conn()
    conn.execute("DROP TABLE storyboard_project")
    conn.execute(
        """
        CREATE TABLE storyboard_project (
            id TEXT PRIMARY KEY,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            product_name TEXT NOT NULL DEFAULT '',
            category TEXT NOT NULL DEFAULT '',
            target_audience TEXT NOT NULL DEFAULT '',
            tone TEXT NOT NULL DEFAULT '',
            key_benefits TEXT NOT NULL DEFAULT '',
            script_text TEXT NOT NULL DEFAULT '',
            selected_version_ids TEXT NOT NULL DEFAULT '[]'
        )
        """
    )
    conn.commit()

    db.init_db()
    saved = db.save_storyboard_project(sample_payload())

    assert saved["source"] == "generated"
    assert saved["folder"] is None
    assert saved["candidateSnapshot"][0]["candidate_id"] == "candidate-1"
    assert saved["result"]["beats"][0]["id"] == "beat-1"


def test_malformed_storyboard_json_falls_back(temp_db):
    conn = db._get_conn()
    conn.execute(
        """
        INSERT INTO storyboard_project (
            id, created_at, updated_at, product_name, selected_version_ids,
            candidate_snapshot_json, result_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            "storyboard-bad-json",
            1,
            1,
            "Bad JSON",
            "not-json",
            '{"candidate_id":"candidate-1"}',
            "[]",
        ),
    )
    conn.commit()

    listed = db.list_storyboard_projects()
    loaded = db.get_storyboard_project("storyboard-bad-json")

    assert listed[0]["beatCount"] == 0
    assert listed[0]["selectedVersionIds"] == []
    assert listed[0]["candidateSnapshot"] == []
    assert "result" not in listed[0]
    assert loaded["beatCount"] == 0
    assert loaded["selectedVersionIds"] == []
    assert loaded["candidateSnapshot"] == []
    assert loaded["result"] == {}


def test_delete_missing_storyboard_returns_false(temp_db):
    assert db.delete_storyboard_project("missing") is False


def test_imported_storyboard_maps_candidate_id_to_scene():
    versions = [
        {
            "versionId": "version-1",
            "fileName": "demo.mp4",
            "timestamp": 1,
            "scenes": [
                {
                    "keyword": "demo",
                    "start": 15,
                    "end": 20,
                    "description": "Cận sản phẩm",
                }
            ],
        }
    ]
    candidates, candidate_map = build_candidate_snapshot(versions)
    imported = {
        "beats": [
            {
                "id": "beat-1",
                "label": "hook",
                "text": "Mở đầu",
                "intent": "Thu hút",
                "desiredVisuals": "Cận",
                "durationHint": 5,
                "position": 0,
            }
        ],
        "beatMatches": [
            {
                "beatId": "beat-1",
                "matches": [
                    {
                        "candidateId": "version-1:0",
                        "score": 0.93,
                        "matchReason": "Đúng cảnh",
                        "usageType": "direct_product",
                    }
                ],
            }
        ],
    }

    normalized = normalize_imported_storyboard(imported, candidate_map)

    assert candidates[0]["candidate_id"] == "version-1:0"
    match = normalized["beatMatches"][0]["matches"][0]
    assert match["fileName"] == "demo.mp4"
    assert match["scene"]["start"] == 15
    assert match["scene"]["end"] == 20


def test_imported_storyboard_unknown_candidate_id_raises_user_message():
    imported = {
        "beats": [{"id": "beat-1", "text": "Mở đầu"}],
        "beatMatches": [
            {"beatId": "beat-1", "matches": [{"candidateId": "missing:0"}]}
        ],
    }

    with pytest.raises(ValueError, match="Không tìm thấy candidate scene: missing:0"):
        normalize_imported_storyboard(imported, {})


def test_imported_storyboard_invalid_explicit_usage_type_raises_user_message():
    versions = [
        {
            "versionId": "version-1",
            "fileName": "demo.mp4",
            "scenes": [sample_scene()],
        }
    ]
    _candidates, candidate_map = build_candidate_snapshot(versions)
    imported = {
        "beats": [{"id": "beat-1", "text": "Mở đầu"}],
        "beatMatches": [
            {
                "beatId": "beat-1",
                "matches": [
                    {
                        "candidateId": "version-1:0",
                        "usageType": "bad_value",
                    }
                ],
            }
        ],
    }

    with pytest.raises(ValueError, match="usageType không hợp lệ: bad_value"):
        normalize_imported_storyboard(imported, candidate_map)
