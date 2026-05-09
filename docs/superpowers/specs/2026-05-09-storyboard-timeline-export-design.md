# Storyboard Timeline Export Design

## Goal

Add a saved-storyboard timeline so each saved storyboard can keep its own selected clips and export them as separate MP4 files in a ZIP. The workflow is: write/import script, generate storyboard, choose footage matches, review the storyboard timeline, export the clips, then continue editing in CapCut or another editor.

## Scope

This design covers the first implementation of timeline export for saved storyboards only.

Included:

- One timeline per saved storyboard.
- Timeline persistence in SQLite.
- Adding selected storyboard matches to the timeline.
- Reordering and removing timeline clips.
- Exporting timeline clips as a ZIP of separate MP4 files.
- Export filenames containing order, label, source video, and time range.

Not included in this version:

- A global clip basket shared by Search, Library, and Storyboard.
- Concatenating clips into one final video.
- Multi-track editing, transitions, audio mixing, subtitles, or overlays.
- Timeline support for unsaved storyboard drafts.

## Product Behavior

Each saved storyboard owns a separate timeline. When the user selects saved storyboard A, the app loads timeline A. When the user selects saved storyboard B, the app loads timeline B. Export only uses the timeline of the currently selected storyboard.

Timeline features:

- Show timeline clips in order.
- Add a match from the currently viewed beat.
- Add the whole storyboard to timeline.
- Move clips up or down.
- Remove clips.
- Clear the timeline.
- Export the timeline as `.zip`.

Unsaved generated storyboards should not silently create a timeline. If a storyboard has not been saved/imported and has no `storyboard_id`, show a Vietnamese prompt such as `Lưu storyboard để tạo timeline`.

## Match Selection Rules

For `Đưa storyboard vào timeline`, the app adds one clip per beat in beat order.

Selection priority:

1. Use the match currently selected/previewed for that beat if available.
2. Otherwise use the first match for that beat.
3. Skip beats with no matches.

If a clip already exists for the same `beat_id` and same `filename/start/end`, do not add a duplicate. If the user chooses a different match for the same beat, allow it as a separate timeline clip because users may want alternates.

## Data Model

Add a `storyboard_timeline_clip` table.

Columns:

- `id`: text primary key.
- `storyboard_id`: text, required, references `storyboard_project.id`.
- `beat_id`: text, nullable because imported data may be incomplete.
- `label`: text, required.
- `filename`: text, required.
- `start`: real, required.
- `end`: real, required.
- `scene_index`: integer, nullable.
- `position`: integer, required.
- `created_at`: text timestamp.
- `updated_at`: text timestamp.

Deleting a storyboard should delete its timeline clips. If SQLite foreign-key cascade is not already consistently enabled, delete timeline rows explicitly in `delete_storyboard_project`.

## Backend API

Add endpoints under the existing FastAPI backend.

`GET /api/storyboards/{storyboard_id}/timeline`

Returns timeline clips ordered by `position`.

`PUT /api/storyboards/{storyboard_id}/timeline`

Replaces the timeline with the provided ordered clip list. This keeps reorder, add, remove, and clear simple and avoids partial update drift.

`POST /api/storyboards/{storyboard_id}/timeline/export`

Exports the current timeline as a ZIP. The server trims each clip with the existing ffmpeg trimming helper, writes each MP4 to a temporary directory, zips the files, and returns a `FileResponse` with cleanup via `BackgroundTask`.

Validation:

- Return 404 if the storyboard does not exist.
- Return 400 if the timeline is empty when exporting.
- Return 400 for invalid clip ranges where `end <= start`.
- Return 500-style error response consistent with `/api/trim` if ffmpeg is unavailable.
- Resolve video paths through `get_video_path` so `VIDEO_FOLDER` rules stay centralized.

## Export Filename Format

Use this format:

`01_hook_videoA_00-12_00-18.mp4`

Rules:

- Prefix is 1-based timeline order, zero-padded to two digits until 99 clips.
- Label comes from beat label or match label.
- Source video is the original filename without extension.
- Time range uses `MM-SS` for both start and end.
- Sanitize all filename parts to safe ASCII-ish slug text.
- If label is missing, use `beat-1`, `beat-2`, etc.

## Frontend UI

Add a Storyboard timeline panel in `StoryboardPage` near the preview/result area.

The panel shows:

- Timeline title and clip count.
- Total duration.
- Clip rows with order, label, filename, time range, and duration.
- Up/down controls for reorder.
- Remove control.
- `Đưa storyboard vào timeline` action.
- `Xuất clip rời (.zip)` action.

Existing match cards should gain an action such as `Thêm vào timeline` in addition to preview and trim. Vietnamese copy should stay consistent with the current app.

State ownership should stay near existing storyboard state in `src/App.tsx` unless the implementation first extracts storyboard state into a focused hook. Avoid unrelated refactors.

## Data Flow

1. User opens a saved storyboard.
2. Frontend fetches `/api/storyboards/{id}/timeline`.
3. User adds matches or imports all storyboard beats into timeline.
4. Frontend updates local timeline state and persists with `PUT /api/storyboards/{id}/timeline`.
5. User clicks export.
6. Backend reads saved timeline clips, trims each clip, zips them, and returns the zip download.

## Error Handling

Show user-facing Vietnamese errors for:

- Storyboard has not been saved yet.
- Timeline is empty.
- ffmpeg is unavailable.
- A source video cannot be found.
- Export fails during trimming or zipping.

During export, disable export controls and show a loading state. If export fails, keep the timeline unchanged.

## Testing

Backend tests:

- Timeline CRUD for a saved storyboard.
- Timeline rows are isolated per storyboard.
- Deleting storyboard removes its timeline clips.
- Export rejects empty timelines.
- Export validates invalid ranges.

Frontend tests:

- Timeline panel renders for saved storyboard.
- Unsaved storyboard shows save-required message.
- `Đưa storyboard vào timeline` adds matches in beat order.
- Reorder and remove actions update timeline order.
- Export button is disabled for empty timeline and busy during export.

Manual verification:

- Run `npm run lint` after frontend changes.
- Run `npm run build` after frontend changes.
- Run relevant backend pytest files if backend tests are added.

## Open Decisions

No open product decisions remain for this version. The selected direction is many timelines, one per saved storyboard, exporting separate clips as a ZIP.
