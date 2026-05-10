# Storyboard Timeline Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây tính năng nhiều bản dựng timeline cho mỗi storyboard đã lưu, mỗi bản dựng export thành một file ZIP gồm nhiều clip MP4 rời.

**Architecture:** Backend thêm hai bảng SQLite: `storyboard_timeline` và `storyboard_timeline_clip`, kèm API CRUD timeline và export ZIP bằng helper ffmpeg hiện có. Frontend thêm type/API helpers, state trong `App.tsx`, panel bản dựng trong `StoryboardPage`, và action thêm match vào timeline từ match card.

**Tech Stack:** FastAPI, SQLite, Pydantic, ffmpeg, Python `zipfile`, Vite React, TypeScript, Vitest/Testing Library.

---

## File Structure

- Modify `server/db.py`: migration bảng timeline, CRUD bản dựng, CRUD clip, xoá cascade thủ công khi xoá storyboard.
- Modify `server/main.py`: Pydantic models, API timeline, export ZIP, helper sanitize filename.
- Add `server/tests/test_storyboard_timelines.py`: backend tests cho CRUD, isolation, xoá, validation export.
- Modify `src/lib/footage-app.ts`: TypeScript types và fetch helpers cho timeline.
- Add `src/components/storyboard/StoryboardTimelinePanel.tsx`: UI panel chọn/tạo/đổi tên/xoá bản dựng, list clip, reorder, export.
- Add `src/components/storyboard/StoryboardTimelinePanel.test.tsx`: tests UI panel.
- Modify `src/components/storyboard/types.ts`: thêm view types cho timeline clip nếu cần chia sẻ trong Storyboard components.
- Modify `src/components/storyboard/StoryboardMatchCard.tsx`: thêm nút `Thêm vào timeline`.
- Modify `src/components/storyboard/StoryboardPreviewPanel.tsx`: truyền callback thêm match vào timeline.
- Modify `src/pages/StoryboardPage.tsx`: render timeline panel và nối props.
- Modify `src/pages/StoryboardPage.test.tsx`: cập nhật props bắt buộc và tests tích hợp nhẹ.
- Modify `src/App.tsx`: state timeline, load theo saved storyboard, persist clips, export ZIP download.

---

### Task 1: Backend DB Timeline Model

**Files:**
- Modify: `server/db.py`
- Test: `server/tests/test_storyboard_timelines.py`

- [ ] **Step 1: Viết failing tests cho CRUD và isolation**

Tạo file `server/tests/test_storyboard_timelines.py` với nội dung:

```python
from server.db import (
    create_storyboard_timeline,
    delete_storyboard_project,
    delete_storyboard_timeline,
    get_storyboard_project,
    list_storyboard_timelines,
    replace_storyboard_timeline_clips,
    save_storyboard_project,
    update_storyboard_timeline,
)


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


def test_storyboard_can_have_multiple_timelines():
    storyboard = _save_storyboard("Kem tri nam")

    first = create_storyboard_timeline(storyboard["id"], "Version 1")
    second = create_storyboard_timeline(storyboard["id"], "Hook nhanh")

    timelines = list_storyboard_timelines(storyboard["id"])

    assert [timeline["id"] for timeline in timelines] == [first["id"], second["id"]]
    assert [timeline["name"] for timeline in timelines] == ["Version 1", "Hook nhanh"]
    assert timelines[0]["clips"] == []
    assert timelines[1]["clips"] == []


def test_timeline_clips_are_isolated_per_timeline():
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


def test_update_and_delete_storyboard_timeline():
    storyboard = _save_storyboard("Sua rua mat")
    timeline = create_storyboard_timeline(storyboard["id"], "Version 1")

    updated = update_storyboard_timeline(timeline["id"], {"name": "Version 2", "position": 3})
    assert updated is not None
    assert updated["name"] == "Version 2"
    assert updated["position"] == 3

    assert delete_storyboard_timeline(timeline["id"]) is True
    assert list_storyboard_timelines(storyboard["id"]) == []


def test_deleting_storyboard_removes_timelines_and_clips():
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
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `python -m pytest server/tests/test_storyboard_timelines.py -q`

Expected: FAIL vì các function timeline chưa tồn tại trong `server.db`.

- [ ] **Step 3: Thêm migration bảng timeline**

Trong `server/db.py`, trong hàm khởi tạo/migrate schema hiện có, thêm SQL:

```python
        CREATE TABLE IF NOT EXISTS storyboard_timeline (
            id TEXT PRIMARY KEY,
            storyboard_id TEXT NOT NULL,
            name TEXT NOT NULL,
            position INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
```

và:

```python
        CREATE TABLE IF NOT EXISTS storyboard_timeline_clip (
            id TEXT PRIMARY KEY,
            timeline_id TEXT NOT NULL,
            beat_id TEXT,
            label TEXT NOT NULL,
            filename TEXT NOT NULL,
            start REAL NOT NULL,
            end REAL NOT NULL,
            scene_index INTEGER,
            position INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
```

- [ ] **Step 4: Thêm helpers row mapping và CRUD tối thiểu**

Trong `server/db.py`, gần nhóm storyboard functions, thêm code:

```python
def _new_storyboard_timeline_id() -> str:
    return f"storyboard-timeline-{uuid.uuid4().hex}"


def _new_storyboard_timeline_clip_id() -> str:
    return f"storyboard-timeline-clip-{uuid.uuid4().hex}"


def _timeline_clip_row_to_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "timelineId": row["timeline_id"],
        "beatId": row["beat_id"],
        "label": row["label"],
        "filename": row["filename"],
        "start": row["start"],
        "end": row["end"],
        "sceneIndex": row["scene_index"],
        "position": row["position"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def _timeline_row_to_dict(row: sqlite3.Row, clips: list[dict] | None = None) -> dict:
    return {
        "id": row["id"],
        "storyboardId": row["storyboard_id"],
        "name": row["name"],
        "position": row["position"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "clips": clips or [],
    }
```

Thêm các functions public:

```python
def list_storyboard_timelines(storyboard_id: str) -> list[dict]:
    conn = _get_conn()
    rows = conn.execute(
        "SELECT * FROM storyboard_timeline WHERE storyboard_id = ? ORDER BY position, created_at",
        (storyboard_id,),
    ).fetchall()
    if not rows:
        return []

    timeline_ids = [row["id"] for row in rows]
    placeholders = ",".join("?" for _ in timeline_ids)
    clip_rows = conn.execute(
        f"SELECT * FROM storyboard_timeline_clip WHERE timeline_id IN ({placeholders}) ORDER BY position, created_at",
        timeline_ids,
    ).fetchall()
    clips_by_timeline: dict[str, list[dict]] = {timeline_id: [] for timeline_id in timeline_ids}
    for clip_row in clip_rows:
        clips_by_timeline[clip_row["timeline_id"]].append(_timeline_clip_row_to_dict(clip_row))

    return [_timeline_row_to_dict(row, clips_by_timeline[row["id"]]) for row in rows]


def get_storyboard_timeline(timeline_id: str) -> dict | None:
    conn = _get_conn()
    row = conn.execute("SELECT * FROM storyboard_timeline WHERE id = ?", (timeline_id,)).fetchone()
    if not row:
        return None
    clip_rows = conn.execute(
        "SELECT * FROM storyboard_timeline_clip WHERE timeline_id = ? ORDER BY position, created_at",
        (timeline_id,),
    ).fetchall()
    return _timeline_row_to_dict(row, [_timeline_clip_row_to_dict(clip) for clip in clip_rows])


def create_storyboard_timeline(storyboard_id: str, name: str | None = None) -> dict | None:
    conn = _get_conn()
    storyboard = conn.execute("SELECT id FROM storyboard_project WHERE id = ?", (storyboard_id,)).fetchone()
    if not storyboard:
        return None
    now = int(time.time() * 1000)
    position = conn.execute(
        "SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM storyboard_timeline WHERE storyboard_id = ?",
        (storyboard_id,),
    ).fetchone()["next_position"]
    timeline_id = _new_storyboard_timeline_id()
    timeline_name = (name or "").strip() or f"Bản dựng {position + 1}"
    conn.execute(
        """
        INSERT INTO storyboard_timeline (id, storyboard_id, name, position, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (timeline_id, storyboard_id, timeline_name, position, now, now),
    )
    conn.commit()
    return get_storyboard_timeline(timeline_id)


def update_storyboard_timeline(timeline_id: str, payload: dict[str, Any]) -> dict | None:
    current = get_storyboard_timeline(timeline_id)
    if not current:
        return None
    now = int(time.time() * 1000)
    name = str(payload.get("name", current["name"])).strip() or current["name"]
    position = int(payload.get("position", current["position"]))
    conn = _get_conn()
    conn.execute(
        "UPDATE storyboard_timeline SET name = ?, position = ?, updated_at = ? WHERE id = ?",
        (name, position, now, timeline_id),
    )
    conn.commit()
    return get_storyboard_timeline(timeline_id)


def delete_storyboard_timeline(timeline_id: str) -> bool:
    conn = _get_conn()
    conn.execute("DELETE FROM storyboard_timeline_clip WHERE timeline_id = ?", (timeline_id,))
    cur = conn.execute("DELETE FROM storyboard_timeline WHERE id = ?", (timeline_id,))
    conn.commit()
    return cur.rowcount > 0


def replace_storyboard_timeline_clips(timeline_id: str, clips: list[dict]) -> dict | None:
    timeline = get_storyboard_timeline(timeline_id)
    if not timeline:
        return None
    now = int(time.time() * 1000)
    conn = _get_conn()
    conn.execute("DELETE FROM storyboard_timeline_clip WHERE timeline_id = ?", (timeline_id,))
    for position, clip in enumerate(clips):
        conn.execute(
            """
            INSERT INTO storyboard_timeline_clip (
                id, timeline_id, beat_id, label, filename, start, end, scene_index,
                position, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                clip.get("id") or _new_storyboard_timeline_clip_id(),
                timeline_id,
                clip.get("beat_id") or clip.get("beatId"),
                clip.get("label") or f"beat-{position + 1}",
                clip.get("filename") or clip.get("fileName"),
                float(clip.get("start", 0)),
                float(clip.get("end", 0)),
                clip.get("scene_index") if "scene_index" in clip else clip.get("sceneIndex"),
                position,
                now,
                now,
            ),
        )
    conn.execute("UPDATE storyboard_timeline SET updated_at = ? WHERE id = ?", (now, timeline_id))
    conn.commit()
    return get_storyboard_timeline(timeline_id)
```

- [ ] **Step 5: Cập nhật xoá storyboard để xoá timeline**

Trong `delete_storyboard_project`, thay bằng:

```python
def delete_storyboard_project(storyboard_id: str) -> bool:
    conn = _get_conn()
    timeline_rows = conn.execute(
        "SELECT id FROM storyboard_timeline WHERE storyboard_id = ?", (storyboard_id,)
    ).fetchall()
    for row in timeline_rows:
        conn.execute("DELETE FROM storyboard_timeline_clip WHERE timeline_id = ?", (row["id"],))
    conn.execute("DELETE FROM storyboard_timeline WHERE storyboard_id = ?", (storyboard_id,))
    cur = conn.execute("DELETE FROM storyboard_project WHERE id = ?", (storyboard_id,))
    conn.commit()
    return cur.rowcount > 0
```

- [ ] **Step 6: Chạy backend test**

Run: `python -m pytest server/tests/test_storyboard_timelines.py -q`

Expected: PASS.

- [ ] **Step 7: Commit task nếu được yêu cầu commit**

Run nếu user yêu cầu commit: `git add server/db.py server/tests/test_storyboard_timelines.py && git commit -m "feat: add storyboard timeline storage"`

---

### Task 2: Backend Timeline API Và Export ZIP

**Files:**
- Modify: `server/main.py`
- Modify: `server/db.py` nếu cần helper nhỏ
- Test: `server/tests/test_storyboard_timelines.py`

- [ ] **Step 1: Viết failing tests cho API validation cơ bản**

Thêm vào `server/tests/test_storyboard_timelines.py`:

```python
from fastapi.testclient import TestClient
from server.main import app


client = TestClient(app)


def test_timeline_api_create_list_and_replace_clips():
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


def test_timeline_api_returns_404_for_missing_storyboard():
    response = client.post("/api/storyboards/missing/timelines", json={"name": "Version"})
    assert response.status_code == 404
    assert response.json()["detail"] == "Storyboard not found"


def test_timeline_export_rejects_empty_timeline():
    storyboard = _save_storyboard("Empty export")
    timeline = create_storyboard_timeline(storyboard["id"], "Version 1")

    response = client.post(f"/api/storyboard-timelines/{timeline['id']}/export")

    assert response.status_code == 400
    assert response.json()["detail"] == "Timeline is empty"
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `python -m pytest server/tests/test_storyboard_timelines.py -q`

Expected: FAIL vì API chưa tồn tại.

- [ ] **Step 3: Thêm imports trong `server/main.py`**

Thêm vào import từ `db`:

```python
    create_storyboard_timeline,
    delete_storyboard_timeline,
    get_storyboard_timeline,
    list_storyboard_timelines,
    replace_storyboard_timeline_clips,
    update_storyboard_timeline,
```

Thêm import chuẩn nếu chưa có:

```python
import re
import zipfile
```

- [ ] **Step 4: Thêm Pydantic models**

Trong `server/main.py`, gần Storyboard request models, thêm:

```python
class TimelineCreateRequest(BaseModel):
    name: str | None = None


class TimelineUpdateRequest(BaseModel):
    name: str | None = None
    position: int | None = None


class TimelineClipPayload(BaseModel):
    id: str | None = None
    beatId: str | None = None
    label: str
    filename: str
    start: float
    end: float
    sceneIndex: int | None = None


class TimelineClipsReplaceRequest(BaseModel):
    clips: list[TimelineClipPayload]
```

- [ ] **Step 5: Thêm API endpoints**

Trong `server/main.py`, sau endpoint xoá storyboard, thêm:

```python
@app.get("/api/storyboards/{storyboard_id}/timelines")
async def storyboards_timelines_list(storyboard_id: str):
    storyboard = await asyncio.to_thread(get_storyboard_project, storyboard_id)
    if not storyboard:
        raise HTTPException(status_code=404, detail="Storyboard not found")
    timelines = await asyncio.to_thread(list_storyboard_timelines, storyboard_id)
    return {"timelines": timelines}


@app.post("/api/storyboards/{storyboard_id}/timelines")
async def storyboards_timelines_create(storyboard_id: str, req: TimelineCreateRequest):
    timeline = await asyncio.to_thread(create_storyboard_timeline, storyboard_id, req.name)
    if not timeline:
        raise HTTPException(status_code=404, detail="Storyboard not found")
    return timeline


@app.patch("/api/storyboard-timelines/{timeline_id}")
async def storyboard_timelines_update(timeline_id: str, req: TimelineUpdateRequest):
    payload = req.model_dump(exclude_unset=True)
    timeline = await asyncio.to_thread(update_storyboard_timeline, timeline_id, payload)
    if not timeline:
        raise HTTPException(status_code=404, detail="Timeline not found")
    return timeline


@app.delete("/api/storyboard-timelines/{timeline_id}")
async def storyboard_timelines_delete(timeline_id: str):
    deleted = await asyncio.to_thread(delete_storyboard_timeline, timeline_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Timeline not found")
    return {"deleted": True}


@app.put("/api/storyboard-timelines/{timeline_id}/clips")
async def storyboard_timeline_clips_replace(timeline_id: str, req: TimelineClipsReplaceRequest):
    for clip in req.clips:
        if clip.end <= clip.start:
            raise HTTPException(status_code=400, detail="Invalid clip range")
    timeline = await asyncio.to_thread(
        replace_storyboard_timeline_clips,
        timeline_id,
        [clip.model_dump() for clip in req.clips],
    )
    if not timeline:
        raise HTTPException(status_code=404, detail="Timeline not found")
    return timeline
```

- [ ] **Step 6: Thêm helpers export filename và ZIP**

Trong `server/main.py`, gần section Trim, thêm:

```python
def _slug_filename_part(value: str, fallback: str) -> str:
    normalized = re.sub(r"[^A-Za-z0-9]+", "-", value.strip()).strip("-").lower()
    return normalized or fallback


def _format_time_for_filename(seconds: float) -> str:
    total = max(0, int(seconds))
    minutes = total // 60
    secs = total % 60
    return f"{minutes:02d}-{secs:02d}"


def _timeline_clip_download_name(index: int, clip: dict) -> str:
    label = _slug_filename_part(clip.get("label") or "", f"beat-{index + 1}")
    source = _slug_filename_part(os.path.splitext(clip.get("filename") or "video")[0], "video")
    start = _format_time_for_filename(float(clip["start"]))
    end = _format_time_for_filename(float(clip["end"]))
    return f"{index + 1:02d}_{label}_{source}_{start}_{end}.mp4"


def _timeline_zip_download_name(timeline: dict) -> str:
    storyboard = get_storyboard_project(timeline["storyboardId"])
    storyboard_name = _slug_filename_part((storyboard or {}).get("productName") or "storyboard", "storyboard")
    timeline_name = _slug_filename_part(timeline.get("name") or "ban-dung", "ban-dung")
    return f"{storyboard_name}_{timeline_name}_clips.zip"
```

- [ ] **Step 7: Thêm export endpoint**

Trong `server/main.py`, sau endpoint clips replace, thêm:

```python
@app.post("/api/storyboard-timelines/{timeline_id}/export")
async def storyboard_timeline_export(timeline_id: str):
    if not FFMPEG_PATH:
        raise HTTPException(status_code=500, detail="ffmpeg not found on server")

    timeline = await asyncio.to_thread(get_storyboard_timeline, timeline_id)
    if not timeline:
        raise HTTPException(status_code=404, detail="Timeline not found")
    clips = timeline.get("clips") or []
    if not clips:
        raise HTTPException(status_code=400, detail="Timeline is empty")

    for clip in clips:
        if float(clip["end"]) <= float(clip["start"]):
            raise HTTPException(status_code=400, detail="Invalid clip range")

    tmpdir = tempfile.mkdtemp(prefix="storyboard_timeline_")
    zip_path = os.path.join(tmpdir, "clips.zip")
    try:
        with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for index, clip in enumerate(clips):
                source_path = await asyncio.to_thread(get_video_path, clip["filename"])
                clip_name = _timeline_clip_download_name(index, clip)
                output_path = os.path.join(tmpdir, clip_name)
                await asyncio.to_thread(
                    _trim,
                    str(source_path),
                    output_path,
                    float(clip["start"]),
                    float(clip["end"]),
                )
                archive.write(output_path, arcname=clip_name)

        return FileResponse(
            path=zip_path,
            media_type="application/zip",
            filename=_timeline_zip_download_name(timeline),
            background=BackgroundTask(shutil.rmtree, tmpdir, ignore_errors=True),
        )
    except Exception:
        shutil.rmtree(tmpdir, ignore_errors=True)
        raise
```

- [ ] **Step 8: Chạy backend tests**

Run: `python -m pytest server/tests/test_storyboard_timelines.py -q`

Expected: PASS.

- [ ] **Step 9: Commit task nếu được yêu cầu commit**

Run nếu user yêu cầu commit: `git add server/main.py server/tests/test_storyboard_timelines.py && git commit -m "feat: add storyboard timeline api"`

---

### Task 3: Frontend Types Và API Helpers

**Files:**
- Modify: `src/lib/footage-app.ts`

- [ ] **Step 1: Thêm timeline interfaces**

Trong `src/lib/footage-app.ts`, sau `SavedStoryboard`, thêm:

```ts
export interface StoryboardTimelineClip {
  id: string;
  timelineId: string;
  beatId: string | null;
  label: string;
  filename: string;
  start: number;
  end: number;
  sceneIndex: number | null;
  position: number;
  createdAt: number;
  updatedAt: number;
}

export interface StoryboardTimeline {
  id: string;
  storyboardId: string;
  name: string;
  position: number;
  createdAt: number;
  updatedAt: number;
  clips: StoryboardTimelineClip[];
}

export interface StoryboardTimelineClipInput {
  id?: string;
  beatId: string | null;
  label: string;
  filename: string;
  start: number;
  end: number;
  sceneIndex: number | null;
}
```

- [ ] **Step 2: Thêm API helper functions**

Trong `src/lib/footage-app.ts`, thêm các helpers gần nhóm fetch helpers hiện có:

```ts
export async function fetchStoryboardTimelines(storyboardId: string): Promise<StoryboardTimeline[]> {
  const response = await fetch(`/api/storyboards/${encodeURIComponent(storyboardId)}/timelines`);
  if (!response.ok) throw new Error('Không thể tải bản dựng timeline.');
  const payload = await response.json() as { timelines: StoryboardTimeline[] };
  return payload.timelines;
}

export async function createStoryboardTimeline(storyboardId: string, name?: string): Promise<StoryboardTimeline> {
  const response = await fetch(`/api/storyboards/${encodeURIComponent(storyboardId)}/timelines`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) throw new Error('Không thể tạo bản dựng timeline.');
  return await response.json() as StoryboardTimeline;
}

export async function updateStoryboardTimeline(timelineId: string, payload: { name?: string; position?: number }): Promise<StoryboardTimeline> {
  const response = await fetch(`/api/storyboard-timelines/${encodeURIComponent(timelineId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error('Không thể cập nhật bản dựng timeline.');
  return await response.json() as StoryboardTimeline;
}

export async function deleteStoryboardTimeline(timelineId: string): Promise<void> {
  const response = await fetch(`/api/storyboard-timelines/${encodeURIComponent(timelineId)}`, { method: 'DELETE' });
  if (!response.ok) throw new Error('Không thể xoá bản dựng timeline.');
}

export async function replaceStoryboardTimelineClips(timelineId: string, clips: StoryboardTimelineClipInput[]): Promise<StoryboardTimeline> {
  const response = await fetch(`/api/storyboard-timelines/${encodeURIComponent(timelineId)}/clips`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clips }),
  });
  if (!response.ok) throw new Error('Không thể lưu timeline.');
  return await response.json() as StoryboardTimeline;
}

export async function exportStoryboardTimeline(timelineId: string): Promise<Blob> {
  const response = await fetch(`/api/storyboard-timelines/${encodeURIComponent(timelineId)}/export`, { method: 'POST' });
  if (!response.ok) throw new Error('Không thể xuất clip rời.');
  return await response.blob();
}
```

- [ ] **Step 3: Chạy typecheck**

Run: `npm run lint`

Expected: PASS hoặc fail chỉ vì các helpers chưa dùng cũng không phải lỗi TypeScript nếu export hợp lệ.

- [ ] **Step 4: Commit task nếu được yêu cầu commit**

Run nếu user yêu cầu commit: `git add src/lib/footage-app.ts && git commit -m "feat: add storyboard timeline client api"`

---

### Task 4: Timeline Panel Component

**Files:**
- Create: `src/components/storyboard/StoryboardTimelinePanel.tsx`
- Test: `src/components/storyboard/StoryboardTimelinePanel.test.tsx`

- [ ] **Step 1: Viết failing component tests**

Tạo `src/components/storyboard/StoryboardTimelinePanel.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { StoryboardTimelinePanel } from './StoryboardTimelinePanel';
import type { StoryboardTimeline } from '@/lib/footage-app';

const timeline: StoryboardTimeline = {
  id: 'timeline-1',
  storyboardId: 'storyboard-1',
  name: 'Version 1',
  position: 0,
  createdAt: 1,
  updatedAt: 1,
  clips: [
    {
      id: 'clip-1',
      timelineId: 'timeline-1',
      beatId: 'beat-1',
      label: 'Hook',
      filename: 'video-a.mp4',
      start: 1,
      end: 4,
      sceneIndex: 0,
      position: 0,
      createdAt: 1,
      updatedAt: 1,
    },
  ],
};

describe('StoryboardTimelinePanel', () => {
  it('shows save required message for unsaved storyboard', () => {
    render(
      <StoryboardTimelinePanel
        canUseTimeline={false}
        timelines={[]}
        selectedTimelineId={null}
        isLoading={false}
        isExporting={false}
        onCreateTimeline={vi.fn()}
        onSelectTimeline={vi.fn()}
        onRenameTimeline={vi.fn()}
        onDeleteTimeline={vi.fn()}
        onAddStoryboard={vi.fn()}
        onMoveClip={vi.fn()}
        onRemoveClip={vi.fn()}
        onClearClips={vi.fn()}
        onExport={vi.fn()}
      />,
    );

    expect(screen.getByText('Lưu storyboard để tạo bản dựng')).toBeInTheDocument();
  });

  it('renders selected timeline clips and duration', () => {
    render(
      <StoryboardTimelinePanel
        canUseTimeline
        timelines={[timeline]}
        selectedTimelineId="timeline-1"
        isLoading={false}
        isExporting={false}
        onCreateTimeline={vi.fn()}
        onSelectTimeline={vi.fn()}
        onRenameTimeline={vi.fn()}
        onDeleteTimeline={vi.fn()}
        onAddStoryboard={vi.fn()}
        onMoveClip={vi.fn()}
        onRemoveClip={vi.fn()}
        onClearClips={vi.fn()}
        onExport={vi.fn()}
      />,
    );

    expect(screen.getByText('Version 1')).toBeInTheDocument();
    expect(screen.getByText('Hook')).toBeInTheDocument();
    expect(screen.getByText('video-a.mp4')).toBeInTheDocument();
    expect(screen.getByText('1 clip · 0:03')).toBeInTheDocument();
  });

  it('calls export for selected non-empty timeline', () => {
    const onExport = vi.fn();
    render(
      <StoryboardTimelinePanel
        canUseTimeline
        timelines={[timeline]}
        selectedTimelineId="timeline-1"
        isLoading={false}
        isExporting={false}
        onCreateTimeline={vi.fn()}
        onSelectTimeline={vi.fn()}
        onRenameTimeline={vi.fn()}
        onDeleteTimeline={vi.fn()}
        onAddStoryboard={vi.fn()}
        onMoveClip={vi.fn()}
        onRemoveClip={vi.fn()}
        onClearClips={vi.fn()}
        onExport={onExport}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Xuất clip rời (.zip)' }));
    expect(onExport).toHaveBeenCalledWith('timeline-1');
  });
});
```

- [ ] **Step 2: Chạy test component để xác nhận fail**

Run: `npm test -- StoryboardTimelinePanel.test.tsx`

Expected: FAIL vì component chưa tồn tại.

- [ ] **Step 3: Tạo component panel**

Tạo `src/components/storyboard/StoryboardTimelinePanel.tsx`:

```tsx
import { Plus, Trash2 } from 'lucide-react';

import type { StoryboardTimeline } from '@/lib/footage-app';

interface StoryboardTimelinePanelProps {
  canUseTimeline: boolean;
  timelines: StoryboardTimeline[];
  selectedTimelineId: string | null;
  isLoading: boolean;
  isExporting: boolean;
  onCreateTimeline: () => void;
  onSelectTimeline: (timelineId: string) => void;
  onRenameTimeline: (timelineId: string, name: string) => void;
  onDeleteTimeline: (timelineId: string) => void;
  onAddStoryboard: () => void;
  onMoveClip: (clipId: string, direction: 'up' | 'down') => void;
  onRemoveClip: (clipId: string) => void;
  onClearClips: () => void;
  onExport: (timelineId: string) => void;
}

export function StoryboardTimelinePanel({
  canUseTimeline,
  timelines,
  selectedTimelineId,
  isLoading,
  isExporting,
  onCreateTimeline,
  onSelectTimeline,
  onRenameTimeline,
  onDeleteTimeline,
  onAddStoryboard,
  onMoveClip,
  onRemoveClip,
  onClearClips,
  onExport,
}: StoryboardTimelinePanelProps) {
  if (!canUseTimeline) {
    return (
      <aside className="border-l border-border bg-card p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Timeline</p>
        <p className="mt-2">Lưu storyboard để tạo bản dựng</p>
      </aside>
    );
  }

  const selectedTimeline = timelines.find((timeline) => timeline.id === selectedTimelineId) || timelines[0] || null;
  const clips = selectedTimeline?.clips || [];
  const totalDuration = clips.reduce((total, clip) => total + Math.max(0, clip.end - clip.start), 0);

  return (
    <aside className="flex w-[340px] shrink-0 flex-col border-l border-border bg-card">
      <div className="border-b border-border p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Bản dựng</h3>
            <p className="text-xs text-muted-foreground">{isLoading ? 'Đang tải...' : `${clips.length} clip · ${formatDuration(totalDuration)}`}</p>
          </div>
          <button type="button" onClick={onCreateTimeline} className="rounded-md border border-border p-2 text-muted-foreground hover:bg-surface-hover" aria-label="Tạo bản dựng mới">
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {timelines.length > 0 ? (
          <select
            value={selectedTimeline?.id || ''}
            onChange={(event) => onSelectTimeline(event.target.value)}
            className="mt-3 w-full rounded-md border border-border bg-background px-2 py-2 text-sm text-foreground"
          >
            {timelines.map((timeline) => (
              <option key={timeline.id} value={timeline.id}>{timeline.name}</option>
            ))}
          </select>
        ) : (
          <button type="button" onClick={onCreateTimeline} className="mt-3 w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
            Tạo bản dựng đầu tiên
          </button>
        )}

        {selectedTimeline ? (
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => onRenameTimeline(selectedTimeline.id, window.prompt('Tên bản dựng', selectedTimeline.name) || selectedTimeline.name)} className="flex-1 rounded-md border border-border px-2 py-1.5 text-xs text-foreground hover:bg-surface-hover">
              Đổi tên
            </button>
            <button type="button" onClick={() => onDeleteTimeline(selectedTimeline.id)} className="flex-1 rounded-md border border-border px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10">
              Xoá
            </button>
          </div>
        ) : null}
      </div>

      <div className="flex gap-2 border-b border-border p-3">
        <button type="button" disabled={!selectedTimeline} onClick={onAddStoryboard} className="flex-1 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-40">
          Đưa storyboard vào timeline
        </button>
        <button type="button" disabled={!selectedTimeline || clips.length === 0} onClick={onClearClips} className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground disabled:opacity-40">
          Xoá hết
        </button>
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
        {clips.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">Timeline đang trống</p>
        ) : (
          <div className="space-y-2">
            {clips.map((clip, index) => (
              <div key={clip.id} className="rounded-lg border border-border bg-background p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground">{String(index + 1).padStart(2, '0')}. {clip.label}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{clip.filename}</p>
                    <p className="text-[11px] text-muted-foreground">{formatTime(clip.start)} - {formatTime(clip.end)} · {formatDuration(clip.end - clip.start)}</p>
                  </div>
                  <button type="button" onClick={() => onRemoveClip(clip.id)} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Xoá ${clip.label}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="mt-2 flex gap-1">
                  <button type="button" disabled={index === 0} onClick={() => onMoveClip(clip.id, 'up')} className="flex-1 rounded border border-border px-2 py-1 text-[11px] disabled:opacity-40">Lên</button>
                  <button type="button" disabled={index === clips.length - 1} onClick={() => onMoveClip(clip.id, 'down')} className="flex-1 rounded border border-border px-2 py-1 text-[11px] disabled:opacity-40">Xuống</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border p-3">
        <button
          type="button"
          disabled={!selectedTimeline || clips.length === 0 || isExporting}
          onClick={() => selectedTimeline && onExport(selectedTimeline.id)}
          className="w-full rounded-md bg-success px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {isExporting ? 'Đang xuất...' : 'Xuất clip rời (.zip)'}
        </button>
      </div>
    </aside>
  );
}

function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.round(seconds));
  const mins = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatTime(seconds: number) {
  return formatDuration(seconds);
}
```

- [ ] **Step 4: Chạy component test**

Run: `npm test -- StoryboardTimelinePanel.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit task nếu được yêu cầu commit**

Run nếu user yêu cầu commit: `git add src/components/storyboard/StoryboardTimelinePanel.tsx src/components/storyboard/StoryboardTimelinePanel.test.tsx && git commit -m "feat: add storyboard timeline panel"`

---

### Task 5: Storyboard UI Integration

**Files:**
- Modify: `src/components/storyboard/StoryboardMatchCard.tsx`
- Modify: `src/components/storyboard/StoryboardPreviewPanel.tsx`
- Modify: `src/pages/StoryboardPage.tsx`
- Modify: `src/pages/StoryboardPage.test.tsx`

- [ ] **Step 1: Cập nhật match card thêm action**

Trong `StoryboardMatchCard.tsx`, thêm prop:

```ts
onAddToTimeline: () => void;
```

và thêm nút cạnh nút trim hiện có:

```tsx
<button
  type="button"
  onClick={onAddToTimeline}
  className="rounded-md border border-border px-2 py-1 text-xs text-foreground transition-colors hover:bg-surface-hover"
>
  Thêm vào timeline
</button>
```

- [ ] **Step 2: Cập nhật preview panel truyền callback**

Trong `StoryboardPreviewPanel.tsx`, thêm prop:

```ts
onAddMatchToTimeline: (match: BeatMatchView) => void;
```

Khi render `StoryboardMatchCard`, truyền:

```tsx
onAddToTimeline={() => onAddMatchToTimeline(match)}
```

- [ ] **Step 3: Cập nhật StoryboardPage props**

Trong `StoryboardPage.tsx`, import `StoryboardTimelinePanel` và types timeline:

```ts
import { StoryboardTimelinePanel } from '@/components/storyboard/StoryboardTimelinePanel';
import type { StoryboardTimeline } from '@/lib/footage-app';
```

Thêm props vào interface:

```ts
storyboardTimelines: StoryboardTimeline[];
selectedStoryboardTimelineId: string | null;
isLoadingStoryboardTimelines: boolean;
isExportingStoryboardTimeline: boolean;
onCreateStoryboardTimeline: () => void;
onSelectStoryboardTimeline: (timelineId: string) => void;
onRenameStoryboardTimeline: (timelineId: string, name: string) => void;
onDeleteStoryboardTimeline: (timelineId: string) => void;
onAddStoryboardToTimeline: () => void;
onAddMatchToTimeline: (match: StoryboardMatch) => void;
onMoveTimelineClip: (clipId: string, direction: 'up' | 'down') => void;
onRemoveTimelineClip: (clipId: string) => void;
onClearTimelineClips: () => void;
onExportStoryboardTimeline: (timelineId: string) => void;
```

- [ ] **Step 4: Render timeline panel trong layout**

Trong JSX cuối của `StoryboardPage`, đặt `StoryboardTimelinePanel` bên phải khu preview hiện có:

```tsx
<StoryboardTimelinePanel
  canUseTimeline={!!selectedSavedStoryboardId}
  timelines={storyboardTimelines}
  selectedTimelineId={selectedStoryboardTimelineId}
  isLoading={isLoadingStoryboardTimelines}
  isExporting={isExportingStoryboardTimeline}
  onCreateTimeline={onCreateStoryboardTimeline}
  onSelectTimeline={onSelectStoryboardTimeline}
  onRenameTimeline={onRenameStoryboardTimeline}
  onDeleteTimeline={onDeleteStoryboardTimeline}
  onAddStoryboard={onAddStoryboardToTimeline}
  onMoveClip={onMoveTimelineClip}
  onRemoveClip={onRemoveTimelineClip}
  onClearClips={onClearTimelineClips}
  onExport={onExportStoryboardTimeline}
/>
```

Nếu layout hiện tại chỉ có hai cột, chỉnh tối thiểu để preview area vẫn co được: wrap preview và timeline trong `div className="flex flex-1 min-w-0"`.

- [ ] **Step 5: Cập nhật test props mặc định**

Trong `StoryboardPage.test.tsx`, ở helper render page, thêm default props:

```tsx
storyboardTimelines={[]}
selectedStoryboardTimelineId={null}
isLoadingStoryboardTimelines={false}
isExportingStoryboardTimeline={false}
onCreateStoryboardTimeline={vi.fn()}
onSelectStoryboardTimeline={vi.fn()}
onRenameStoryboardTimeline={vi.fn()}
onDeleteStoryboardTimeline={vi.fn()}
onAddStoryboardToTimeline={vi.fn()}
onAddMatchToTimeline={vi.fn()}
onMoveTimelineClip={vi.fn()}
onRemoveTimelineClip={vi.fn()}
onClearTimelineClips={vi.fn()}
onExportStoryboardTimeline={vi.fn()}
```

- [ ] **Step 6: Chạy tests Storyboard UI**

Run: `npm test -- StoryboardPage.test.tsx StoryboardPreviewPanel.test.tsx`

Expected: PASS sau khi cập nhật props và button expectations nếu cần.

- [ ] **Step 7: Commit task nếu được yêu cầu commit**

Run nếu user yêu cầu commit: `git add src/components/storyboard src/pages/StoryboardPage.tsx src/pages/StoryboardPage.test.tsx && git commit -m "feat: wire storyboard timeline ui"`

---

### Task 6: App State, Persist Và Export Download

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Import timeline helpers**

Trong `src/App.tsx`, thêm imports từ `@/lib/footage-app`:

```ts
import type { StoryboardTimeline, StoryboardTimelineClipInput, StoryboardMatch } from '@/lib/footage-app';
import {
  createStoryboardTimeline,
  deleteStoryboardTimeline,
  exportStoryboardTimeline,
  fetchStoryboardTimelines,
  replaceStoryboardTimelineClips,
  updateStoryboardTimeline,
} from '@/lib/footage-app';
```

Nếu file đang có import grouped từ `footage-app`, merge vào import hiện có thay vì tạo import duplicate.

- [ ] **Step 2: Thêm state timeline**

Trong `App`, gần storyboard state hiện có, thêm:

```ts
const [storyboardTimelines, setStoryboardTimelines] = useState<StoryboardTimeline[]>([]);
const [selectedStoryboardTimelineId, setSelectedStoryboardTimelineId] = useState<string | null>(null);
const [isLoadingStoryboardTimelines, setIsLoadingStoryboardTimelines] = useState(false);
const [isExportingStoryboardTimeline, setIsExportingStoryboardTimeline] = useState(false);
```

- [ ] **Step 3: Load timelines theo saved storyboard đang chọn**

Thêm effect:

```ts
useEffect(() => {
  if (!selectedSavedStoryboardId) {
    setStoryboardTimelines([]);
    setSelectedStoryboardTimelineId(null);
    return;
  }

  let cancelled = false;
  setIsLoadingStoryboardTimelines(true);
  fetchStoryboardTimelines(selectedSavedStoryboardId)
    .then((timelines) => {
      if (cancelled) return;
      setStoryboardTimelines(timelines);
      setSelectedStoryboardTimelineId((prev) => {
        if (prev && timelines.some((timeline) => timeline.id === prev)) return prev;
        return timelines[0]?.id ?? null;
      });
    })
    .catch((error) => {
      if (cancelled) return;
      console.error(error);
      setStoryboardTimelines([]);
      setSelectedStoryboardTimelineId(null);
    })
    .finally(() => {
      if (!cancelled) setIsLoadingStoryboardTimelines(false);
    });

  return () => {
    cancelled = true;
  };
}, [selectedSavedStoryboardId]);
```

- [ ] **Step 4: Thêm helper chuyển match sang clip input**

Trong `App.tsx`, thêm helper ngoài component hoặc trong component nếu cần access state:

```ts
function matchToTimelineClipInput(match: StoryboardMatch, fallbackLabel: string): StoryboardTimelineClipInput {
  return {
    beatId: match.beatId,
    label: fallbackLabel || match.scene.keyword || 'beat',
    filename: match.fileName,
    start: match.scene.start,
    end: match.scene.end,
    sceneIndex: match.sceneIndex,
  };
}
```

- [ ] **Step 5: Thêm persist helper**

Trong component `App`, thêm:

```ts
const selectedStoryboardTimeline = storyboardTimelines.find((timeline) => timeline.id === selectedStoryboardTimelineId) || null;

const persistTimelineClips = async (timelineId: string, clips: StoryboardTimelineClipInput[]) => {
  const updated = await replaceStoryboardTimelineClips(timelineId, clips);
  setStoryboardTimelines((prev) => prev.map((timeline) => (timeline.id === updated.id ? updated : timeline)));
  setSelectedStoryboardTimelineId(updated.id);
  return updated;
};
```

- [ ] **Step 6: Thêm handlers tạo/chọn/rename/xoá timeline**

Trong component `App`, thêm:

```ts
const handleCreateStoryboardTimeline = async () => {
  if (!selectedSavedStoryboardId) return;
  const created = await createStoryboardTimeline(selectedSavedStoryboardId);
  setStoryboardTimelines((prev) => [...prev, created]);
  setSelectedStoryboardTimelineId(created.id);
};

const handleRenameStoryboardTimeline = async (timelineId: string, name: string) => {
  const updated = await updateStoryboardTimeline(timelineId, { name });
  setStoryboardTimelines((prev) => prev.map((timeline) => (timeline.id === timelineId ? updated : timeline)));
};

const handleDeleteStoryboardTimeline = async (timelineId: string) => {
  await deleteStoryboardTimeline(timelineId);
  setStoryboardTimelines((prev) => {
    const next = prev.filter((timeline) => timeline.id !== timelineId);
    setSelectedStoryboardTimelineId((current) => (current === timelineId ? next[0]?.id ?? null : current));
    return next;
  });
};
```

- [ ] **Step 7: Thêm handlers thêm match/storyboard vào timeline**

Trong component `App`, thêm:

```ts
const handleAddMatchToTimeline = async (match: StoryboardMatch) => {
  if (!selectedStoryboardTimeline) return;
  const beat = storyboardResult?.beats.find((item) => item.id === match.beatId);
  const nextClip = matchToTimelineClipInput(match, beat?.label || match.scene.keyword || 'beat');
  const existing = selectedStoryboardTimeline.clips.some(
    (clip) => clip.beatId === nextClip.beatId && clip.filename === nextClip.filename && clip.start === nextClip.start && clip.end === nextClip.end,
  );
  if (existing) return;
  await persistTimelineClips(selectedStoryboardTimeline.id, [...selectedStoryboardTimeline.clips, nextClip]);
};

const handleAddStoryboardToTimeline = async () => {
  if (!selectedStoryboardTimeline || !storyboardResult) return;
  const clips: StoryboardTimelineClipInput[] = [];
  for (const beat of storyboardResult.beats) {
    const matches = storyboardResult.beatMatches.find((item) => item.beatId === beat.id)?.matches || [];
    const selectedMatch = storyboardPreviewMatch?.beatId === beat.id ? storyboardPreviewMatch : matches[0];
    if (!selectedMatch) continue;
    clips.push(matchToTimelineClipInput(selectedMatch, beat.label));
  }
  const existingKeys = new Set(selectedStoryboardTimeline.clips.map((clip) => `${clip.beatId}|${clip.filename}|${clip.start}|${clip.end}`));
  const merged = [
    ...selectedStoryboardTimeline.clips,
    ...clips.filter((clip) => !existingKeys.has(`${clip.beatId}|${clip.filename}|${clip.start}|${clip.end}`)),
  ];
  await persistTimelineClips(selectedStoryboardTimeline.id, merged);
};
```

- [ ] **Step 8: Thêm handlers reorder/remove/clear/export**

Trong component `App`, thêm:

```ts
const handleMoveTimelineClip = async (clipId: string, direction: 'up' | 'down') => {
  if (!selectedStoryboardTimeline) return;
  const clips = [...selectedStoryboardTimeline.clips];
  const index = clips.findIndex((clip) => clip.id === clipId);
  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || targetIndex < 0 || targetIndex >= clips.length) return;
  [clips[index], clips[targetIndex]] = [clips[targetIndex], clips[index]];
  await persistTimelineClips(selectedStoryboardTimeline.id, clips);
};

const handleRemoveTimelineClip = async (clipId: string) => {
  if (!selectedStoryboardTimeline) return;
  await persistTimelineClips(selectedStoryboardTimeline.id, selectedStoryboardTimeline.clips.filter((clip) => clip.id !== clipId));
};

const handleClearTimelineClips = async () => {
  if (!selectedStoryboardTimeline) return;
  await persistTimelineClips(selectedStoryboardTimeline.id, []);
};

const handleExportStoryboardTimeline = async (timelineId: string) => {
  setIsExportingStoryboardTimeline(true);
  try {
    const blob = await exportStoryboardTimeline(timelineId);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'storyboard-clips.zip';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } finally {
    setIsExportingStoryboardTimeline(false);
  }
};
```

- [ ] **Step 9: Truyền props vào StoryboardPage**

Ở render `<StoryboardPage />`, thêm:

```tsx
storyboardTimelines={storyboardTimelines}
selectedStoryboardTimelineId={selectedStoryboardTimelineId}
isLoadingStoryboardTimelines={isLoadingStoryboardTimelines}
isExportingStoryboardTimeline={isExportingStoryboardTimeline}
onCreateStoryboardTimeline={() => void handleCreateStoryboardTimeline()}
onSelectStoryboardTimeline={setSelectedStoryboardTimelineId}
onRenameStoryboardTimeline={(timelineId, name) => void handleRenameStoryboardTimeline(timelineId, name)}
onDeleteStoryboardTimeline={(timelineId) => void handleDeleteStoryboardTimeline(timelineId)}
onAddStoryboardToTimeline={() => void handleAddStoryboardToTimeline()}
onAddMatchToTimeline={(match) => void handleAddMatchToTimeline(match)}
onMoveTimelineClip={(clipId, direction) => void handleMoveTimelineClip(clipId, direction)}
onRemoveTimelineClip={(clipId) => void handleRemoveTimelineClip(clipId)}
onClearTimelineClips={() => void handleClearTimelineClips()}
onExportStoryboardTimeline={(timelineId) => void handleExportStoryboardTimeline(timelineId)}
```

- [ ] **Step 10: Chạy typecheck**

Run: `npm run lint`

Expected: PASS.

- [ ] **Step 11: Commit task nếu được yêu cầu commit**

Run nếu user yêu cầu commit: `git add src/App.tsx && git commit -m "feat: persist storyboard timelines"`

---

### Task 7: Final Verification

**Files:**
- No new files unless fixes are needed.

- [ ] **Step 1: Chạy backend timeline tests**

Run: `python -m pytest server/tests/test_storyboard_timelines.py -q`

Expected: PASS.

- [ ] **Step 2: Chạy frontend tests liên quan**

Run: `npm test -- StoryboardTimelinePanel.test.tsx StoryboardPage.test.tsx StoryboardPreviewPanel.test.tsx`

Expected: PASS.

- [ ] **Step 3: Chạy lint frontend theo repo note**

Run: `npm run lint`

Expected: PASS.

- [ ] **Step 4: Chạy build frontend theo repo note**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 5: Manual smoke test**

Run backend và frontend theo repo note:

```powershell
npm run dev:server
npm run dev
```

Expected manual flow:

- Mở Storyboard.
- Chọn một storyboard đã lưu.
- Tạo `Bản dựng 1`.
- Thêm một match vào timeline.
- Bấm `Đưa storyboard vào timeline`.
- Đổi thứ tự một clip.
- Export `.zip`.
- ZIP tải về có các file tên dạng `01_hook_video-a_00-01_00-04.mp4`.

- [ ] **Step 6: Commit final nếu được yêu cầu commit**

Run nếu user yêu cầu commit: `git add . && git commit -m "feat: export storyboard timeline clips"`

---

## Self-Review

- Spec coverage: plan có task cho DB, API, nhiều timeline mỗi storyboard, UI tạo/chọn/đổi tên/xoá timeline, thêm match/storyboard vào timeline, export ZIP clip rời, xoá cascade, validation và tests.
- Placeholder scan: không có placeholder hành động trong các task. Các bước có file path, command và expected output.
- Type consistency: backend dùng `timeline_id` trong DB và `timelineId` ở API; frontend dùng `StoryboardTimeline`, `StoryboardTimelineClip`, `StoryboardTimelineClipInput` nhất quán.
