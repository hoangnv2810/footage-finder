# Storyboard Copy/Import Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `Copy input`, `Import storyboard JSON`, and saved storyboard history backed by SQLite.

**Architecture:** Backend owns candidate scene snapshot creation, JSON import normalization, and SQLite persistence. Frontend loads saved storyboards, copies a complete GPT/Claude prompt, imports pasted JSON, and renders saved/generated/imported results through the existing Storyboard UI.

**Tech Stack:** FastAPI, SQLite, Pydantic, Vite React, TypeScript, Vitest, pytest.

---

## File Structure

- Modify `server/db.py`: add `storyboard_project` schema and CRUD helpers.
- Modify `server/analysis.py`: expose reusable candidate snapshot and import-normalization helpers.
- Modify `server/main.py`: add saved storyboard API endpoints and switch persisted generate flow.
- Add `server/tests/test_storyboards.py`: backend persistence/API/import tests.
- Modify `src/lib/footage-app.ts`: add storyboard saved-item types and API client methods.
- Modify `src/App.tsx`: hold saved storyboard list, copy prompt, import dialog state, load saved storyboard, persist generated result.
- Modify `src/pages/StoryboardPage.tsx`: pass saved storyboards and actions into the UI.
- Modify `src/components/storyboard/StoryboardInputPanel.tsx`: add `Copy input`, `Import storyboard JSON`, and saved storyboard list controls.
- Add or extend frontend tests under `src/lib` and `src/components/storyboard` for copy/import/list behavior.

---

### Task 1: Backend Storyboard DB Persistence

**Files:**
- Modify: `server/db.py`
- Test: `server/tests/test_storyboards.py`

- [ ] **Step 1: Write failing DB tests**

Create `server/tests/test_storyboards.py` with tests for save/list/get/delete:

```python
import json
import sqlite3

import pytest

import db


@pytest.fixture()
def temp_db(tmp_path, monkeypatch):
    db_path = tmp_path / "storyboards.db"
    monkeypatch.setattr(db, "DB_PATH", db_path)
    monkeypatch.setattr(db, "_conn", None)
    db.init_db()
    yield db_path
    if db._conn is not None:
        db._conn.close()
        db._conn = None


def sample_payload():
    return {
        "product_name": "Serum Vitamin C",
        "category": "Skincare",
        "target_audience": "Nữ 20-35",
        "tone": "Tin cậy",
        "key_benefits": "Sáng da",
        "script_text": "Hook\nBenefit\nCTA",
        "selected_version_ids": ["version-1"],
        "candidate_snapshot": [
            {
                "candidate_id": "version-1:0",
                "file_name": "demo.mp4",
                "video_version_id": "version-1",
                "scene_index": 0,
                "keyword": "demo",
                "description": "Cận sản phẩm",
                "context": "",
                "subjects": [],
                "actions": [],
                "mood": "",
                "shot_type": "",
                "marketing_uses": [],
                "relevance_notes": "",
                "start": 15,
                "end": 20,
            }
        ],
        "result": {
            "beats": [
                {
                    "id": "beat-1",
                    "label": "hook",
                    "text": "Mở đầu",
                    "intent": "Thu hút",
                    "desiredVisuals": "Cận sản phẩm",
                    "durationHint": 5,
                    "position": 0,
                }
            ],
            "beatMatches": [
                {
                    "beatId": "beat-1",
                    "matches": [
                        {
                            "id": "beat-1:version-1:0",
                            "beatId": "beat-1",
                            "videoVersionId": "version-1",
                            "fileName": "demo.mp4",
                            "sceneIndex": 0,
                            "score": 0.9,
                            "matchReason": "Phù hợp hook",
                            "usageType": "direct_product",
                            "scene": {"keyword": "demo", "start": 15, "end": 20, "description": "Cận sản phẩm"},
                        }
                    ],
                }
            ],
            "models": {"video_analysis_model": "test", "script_planning_model": "test", "scene_matching_model": "test"},
        },
        "source": "generated",
    }


def test_save_list_get_delete_storyboard(temp_db):
    saved = db.save_storyboard_project(sample_payload())

    assert saved["id"]
    assert saved["productName"] == "Serum Vitamin C"
    assert saved["source"] == "generated"
    assert saved["beatCount"] == 1
    assert saved["result"]["beats"][0]["id"] == "beat-1"

    listed = db.list_storyboard_projects()
    assert [item["id"] for item in listed] == [saved["id"]]
    assert listed[0]["beatCount"] == 1
    assert "result" not in listed[0]

    loaded = db.get_storyboard_project(saved["id"])
    assert loaded["scriptText"] == "Hook\nBenefit\nCTA"
    assert loaded["candidateSnapshot"][0]["candidate_id"] == "version-1:0"

    assert db.delete_storyboard_project(saved["id"]) is True
    assert db.get_storyboard_project(saved["id"]) is None
```

- [ ] **Step 2: Run DB test to verify it fails**

Run: `python -m pytest server/tests/test_storyboards.py -q`

Expected: FAIL with missing `save_storyboard_project` or missing table.

- [ ] **Step 3: Add SQLite schema and CRUD helpers**

In `server/db.py`, add `storyboard_project` to `init_db()` and implement:

```python
def _new_storyboard_id() -> str:
    return f"storyboard-{uuid.uuid4().hex}"


def _storyboard_row_to_dict(row: sqlite3.Row, include_result: bool) -> dict:
    result = json.loads(row["result_json"] or "{}")
    beat_count = len(result.get("beats", [])) if isinstance(result, dict) else 0
    item = {
        "id": row["id"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "productName": row["product_name"],
        "category": row["category"],
        "targetAudience": row["target_audience"],
        "tone": row["tone"],
        "keyBenefits": row["key_benefits"],
        "scriptText": row["script_text"],
        "selectedVersionIds": json.loads(row["selected_version_ids"] or "[]"),
        "candidateSnapshot": json.loads(row["candidate_snapshot_json"] or "[]"),
        "source": row["source"],
        "beatCount": beat_count,
    }
    if include_result:
        item["result"] = result
    return item


def save_storyboard_project(payload: dict[str, Any]) -> dict:
    conn = _get_conn()
    now = int(time.time() * 1000)
    storyboard_id = payload.get("id") or _new_storyboard_id()
    conn.execute(
        """
        INSERT INTO storyboard_project (
            id, created_at, updated_at, product_name, category, target_audience,
            tone, key_benefits, script_text, selected_version_ids,
            candidate_snapshot_json, result_json, source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            storyboard_id,
            now,
            now,
            payload.get("product_name", ""),
            payload.get("category", ""),
            payload.get("target_audience", ""),
            payload.get("tone", ""),
            payload.get("key_benefits", ""),
            payload.get("script_text", ""),
            json.dumps(payload.get("selected_version_ids", []), ensure_ascii=False),
            json.dumps(payload.get("candidate_snapshot", []), ensure_ascii=False),
            json.dumps(payload.get("result", {}), ensure_ascii=False),
            payload.get("source", "generated"),
        ),
    )
    conn.commit()
    return get_storyboard_project(storyboard_id)
```

Also implement `list_storyboard_projects()`, `get_storyboard_project(storyboard_id)`, and `delete_storyboard_project(storyboard_id)` using `ORDER BY updated_at DESC` for listing.

- [ ] **Step 4: Run DB test to verify it passes**

Run: `python -m pytest server/tests/test_storyboards.py -q`

Expected: PASS.

---

### Task 2: Backend Candidate Snapshot And Import Normalization

**Files:**
- Modify: `server/analysis.py`
- Modify: `server/main.py`
- Test: `server/tests/test_storyboards.py`

- [ ] **Step 1: Write failing import normalization test**

Append this test to `server/tests/test_storyboards.py`:

```python
from analysis import build_candidate_snapshot, normalize_imported_storyboard


def test_imported_storyboard_maps_candidate_id_to_scene():
    versions = [
        {
            "versionId": "version-1",
            "fileName": "demo.mp4",
            "timestamp": 1,
            "scenes": [{"keyword": "demo", "start": 15, "end": 20, "description": "Cận sản phẩm"}],
        }
    ]
    candidates, candidate_map = build_candidate_snapshot(versions)
    imported = {
        "beats": [
            {"id": "beat-1", "label": "hook", "text": "Mở đầu", "intent": "Thu hút", "desiredVisuals": "Cận", "durationHint": 5, "position": 0}
        ],
        "beatMatches": [
            {"beatId": "beat-1", "matches": [{"candidateId": "version-1:0", "score": 0.93, "matchReason": "Đúng cảnh", "usageType": "direct_product"}]}
        ],
    }

    normalized = normalize_imported_storyboard(imported, candidate_map)

    assert candidates[0]["candidate_id"] == "version-1:0"
    match = normalized["beatMatches"][0]["matches"][0]
    assert match["fileName"] == "demo.mp4"
    assert match["scene"]["start"] == 15
    assert match["scene"]["end"] == 20
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest server/tests/test_storyboards.py -q`

Expected: FAIL with missing `build_candidate_snapshot` or `normalize_imported_storyboard`.

- [ ] **Step 3: Implement helpers in `server/analysis.py`**

Extract the candidate loop from `generate_storyboard()` into:

```python
def build_candidate_snapshot(candidate_versions: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
    candidate_scenes: list[dict[str, Any]] = []
    candidate_map: dict[str, dict[str, Any]] = {}
    for version in candidate_versions:
        version_id = version["versionId"]
        file_name = version["fileName"]
        for scene_index, scene in enumerate(version.get("scenes", [])):
            normalized_scene = normalize_scene(scene if isinstance(scene, dict) else {})
            candidate_id = f"{version_id}:{scene_index}"
            candidate_entry = {
                "candidate_id": candidate_id,
                "file_name": file_name,
                "video_version_id": version_id,
                "scene_index": scene_index,
                "keyword": normalized_scene["keyword"],
                "description": normalized_scene["description"],
                "context": normalized_scene["context"],
                "subjects": normalized_scene["subjects"],
                "actions": normalized_scene["actions"],
                "mood": normalized_scene["mood"],
                "shot_type": normalized_scene["shot_type"],
                "marketing_uses": normalized_scene["marketing_uses"],
                "relevance_notes": normalized_scene["relevance_notes"],
                "start": normalized_scene["start"],
                "end": normalized_scene["end"],
            }
            candidate_scenes.append(candidate_entry)
            candidate_map[candidate_id] = {"videoVersionId": version_id, "fileName": file_name, "sceneIndex": scene_index, "scene": normalized_scene}
    return candidate_scenes, candidate_map
```

Add `normalize_imported_storyboard(payload, candidate_map)` that normalizes beats, accepts match field `candidateId` or `candidate_id`, validates candidate IDs, clamps score to `0..1`, and returns `{ beats, beatMatches, models }` with `models` from `get_model_config()`.

- [ ] **Step 4: Update `generate_storyboard()` to use helper**

Replace its inline candidate scene loop with `candidate_scenes, candidate_map = build_candidate_snapshot(candidate_versions)`.

- [ ] **Step 5: Run tests**

Run: `python -m pytest server/tests/test_storyboards.py -q`

Expected: PASS.

---

### Task 3: Backend Storyboard API Endpoints

**Files:**
- Modify: `server/main.py`
- Modify: `server/db.py`
- Test: `server/tests/test_storyboards.py`

- [ ] **Step 1: Write failing API tests**

Add tests using FastAPI `TestClient` that seed a video version, monkeypatch `generate_storyboard`, call `POST /api/storyboards/generate`, `GET /api/storyboards`, `GET /api/storyboards/{id}`, and `POST /api/storyboards/import`.

Core assertion code:

```python
def assert_saved_storyboard_response(payload):
    assert payload["id"].startswith("storyboard-")
    assert payload["productName"] == "Serum Vitamin C"
    assert payload["result"]["beats"][0]["id"] == "beat-1"
```

- [ ] **Step 2: Run API tests to verify failure**

Run: `python -m pytest server/tests/test_storyboards.py -q`

Expected: FAIL with 404 for new endpoints.

- [ ] **Step 3: Add Pydantic models in `server/main.py`**

Add:

```python
class StoryboardImportRequest(StoryboardRequest):
    result_json: dict
```

- [ ] **Step 4: Add API endpoints**

Implement:

```python
@app.get("/api/storyboards")
async def storyboards_list():
    return {"storyboards": await asyncio.to_thread(list_storyboard_projects)}


@app.get("/api/storyboards/{storyboard_id}")
async def storyboards_get(storyboard_id: str):
    item = await asyncio.to_thread(get_storyboard_project, storyboard_id)
    if not item:
        raise HTTPException(status_code=404, detail="Storyboard not found")
    return item
```

For generate/import, load versions, build candidate snapshot, save via `save_storyboard_project`, and return saved item.

- [ ] **Step 5: Keep legacy endpoint**

Leave `/api/storyboard/generate` returning raw `StoryboardResult` for compatibility.

- [ ] **Step 6: Run backend tests**

Run: `python -m pytest server/tests/test_storyboards.py -q`

Expected: PASS.

---

### Task 4: Frontend API Types And Prompt Builder

**Files:**
- Modify: `src/lib/footage-app.ts`
- Test: `src/lib/footage-app.test.ts`

- [ ] **Step 1: Write failing frontend lib tests**

Add tests for `buildStoryboardCopyPrompt()` and new API endpoint paths:

```typescript
it('builds a storyboard copy prompt with candidate scenes and schema', () => {
  const prompt = buildStoryboardCopyPrompt({
    product: { product_name: 'Serum Vitamin C', category: 'Skincare', target_audience: 'Nữ 20-35', tone: 'Tin cậy', key_benefits: 'Sáng da' },
    script_text: 'Hook\nCTA',
    candidate_scenes: [{ candidate_id: 'version-1:0', file_name: 'demo.mp4', video_version_id: 'version-1', scene_index: 0, keyword: 'demo', description: 'Cận', context: '', subjects: [], actions: [], mood: '', shot_type: '', marketing_uses: [], relevance_notes: '', start: 15, end: 20 }],
  });

  expect(prompt).toContain('Return ONLY valid JSON');
  expect(prompt).toContain('version-1:0');
  expect(prompt).toContain('beatMatches');
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- src/lib/footage-app.test.ts`

Expected: FAIL with missing function/type/API method.

- [ ] **Step 3: Add types and API methods**

In `src/lib/footage-app.ts`, add `SavedStoryboard`, `StoryboardCandidateScene`, `StoryboardGenerateResponse` types, `api.listStoryboards`, `api.getStoryboard`, `api.generateSavedStoryboard`, `api.importStoryboard`, `api.deleteStoryboard`, and `buildStoryboardCopyPrompt()`.

- [ ] **Step 4: Run lib tests**

Run: `npm test -- src/lib/footage-app.test.ts`

Expected: PASS.

---

### Task 5: Frontend Storyboard Controls And State

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/pages/StoryboardPage.tsx`
- Modify: `src/components/storyboard/StoryboardInputPanel.tsx`
- Test: `src/components/storyboard/StoryboardPreviewPanel.test.tsx` or new `StoryboardInputPanel.test.tsx`

- [ ] **Step 1: Write failing UI test for controls**

Create a component test that renders `StoryboardInputPanel` with saved storyboard props and asserts the presence of `Copy input`, `Import storyboard JSON`, and saved item button.

- [ ] **Step 2: Run UI test to verify failure**

Run: `npm test -- src/components/storyboard/StoryboardInputPanel.test.tsx`

Expected: FAIL because controls/props do not exist.

- [ ] **Step 3: Extend `StoryboardInputPanel` props**

Add props for `savedStoryboards`, `selectedStoryboardId`, `onCopyInput`, `onImportStoryboard`, `onSelectSavedStoryboard`, `onDeleteSavedStoryboard`.

- [ ] **Step 4: Render saved list and buttons**

Add a compact saved storyboard section under the input header. Use Vietnamese labels except `Copy input` as requested.

- [ ] **Step 5: Wire state in `App.tsx`**

Add saved storyboard list state. On app load, call `api.listStoryboards()`. On generate, call `api.generateSavedStoryboard()` and apply returned input/result. On select saved, call `api.getStoryboard(id)` and restore fields/result/version IDs. On copy, build prompt and call `navigator.clipboard.writeText()`.

- [ ] **Step 6: Add import dialog**

Use a simple textarea dialog in Storyboard page/component. Submit pasted JSON to `api.importStoryboard()` with current product/script/selected versions.

- [ ] **Step 7: Run frontend tests**

Run: `npm test -- src/components/storyboard/StoryboardInputPanel.test.tsx src/lib/footage-app.test.ts`

Expected: PASS.

---

### Task 6: Full Verification

**Files:**
- No new files.

- [ ] **Step 1: Run backend tests**

Run: `python -m pytest server/tests/test_storyboards.py -q`

Expected: PASS.

- [ ] **Step 2: Run frontend tests**

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 3: Run typecheck**

Run: `npm run lint`

Expected: `tsc --noEmit -p tsconfig.app.json` exits 0.

- [ ] **Step 4: Run build**

Run: `npm run build`

Expected: Vite build exits 0.

---

## Self-Review

- Spec coverage: DB persistence, candidate snapshot, copy prompt, import JSON, saved list, generate persistence, delete endpoint, validation, tests are covered.
- Placeholder scan: no TBD/TODO placeholders remain.
- Type consistency: plan uses `candidate_id` for prompt candidate scenes, accepts `candidateId`/`candidate_id` on import, and returns existing frontend `StoryboardResult` shape.
