# Full Analysis + Keyword Search Design

## Goal

Update the analysis flow so video understanding is always built from a full-video analysis first.

- If the user does not enter keywords, the app should analyze the whole video and show the full set of scenes.
- If the user enters keywords, the app should still analyze the whole video first, then search those analysis results for the keyword request.
- Changing keywords after a video has already been analyzed should not require re-uploading or re-analyzing the source video.

## Current Constraints

- The frontend is a Vite React app and the backend is FastAPI.
- `/api/analyze` currently sends the user keywords directly into the video-analysis prompt.
- Analysis results are persisted in SQLite with per-video versions.
- The UI can switch versions and persists `currentVersionIndex` back through `/api/history`.
- Clip trim/export remains server-side through `/api/trim`.

## Proposed Flow

### 1. Full analysis is always the first step

The backend should always run a full-video analysis prompt against DashScope/Qwen. That prompt should segment the video into scenes and describe each scene in Vietnamese without depending on user keywords.

The result of this step becomes the canonical analysis record for that video version.

### 2. Keyword search is a second step

When `keywords` is empty:

- return the full analysis result
- do not run a search step

When `keywords` is present:

- run a second AI step that takes the saved full-analysis scene JSON as input
- ask Qwen to select only the scenes relevant to the requested keywords
- do not send the original video again for this second step

This keeps video analysis and keyword search logically separate.

### 3. Re-search without re-analysis

Add a dedicated backend search path so the frontend can submit new keywords against an already analyzed video version.

- `POST /api/search` should accept the selected `video_version.id` plus the keyword string
- it should read the stored full-analysis scenes from SQLite
- it should run the second-step search prompt only
- it should persist the search result for history reloads

## Data Model Changes

Keep `video_version` for full analysis only.

Add a separate persisted search-result record associated with a specific video version and keyword string.

Suggested fields:

- `id`
- `video_version_id`
- `keywords`
- `timestamp`
- `scenes` JSON
- optional `error`

This separation avoids treating every keyword search as a new video-analysis version.

## API Behavior

### `POST /api/analyze`

- Input still accepts `filename`, `keywords`, and `history_id`
- Always perform full analysis first
- Save the full-analysis version
- If `keywords` is provided, immediately run search-from-analysis and include both the full-scene result and the matched-scene result in the response stream
- If `keywords` is blank, stream only the full-analysis result

### `POST /api/search`

- Input should contain `version_id` and `keywords`
- Runs search-from-analysis only

- Saves the matched scenes separately from the full-analysis version
- Returns matched scenes and the saved search metadata

## Frontend Changes

Each video needs to distinguish between:

- `fullScenes`: the canonical scene list for the selected analysis version
- `matchedScenes`: the search result for the current keyword query

The UI should support two view modes:

- `Kết quả tìm kiếm`
- `Toàn bộ phân tích`

Default behavior:

- if keywords exist, default to `Kết quả tìm kiếm`
- if keywords are blank, default to `Toàn bộ phân tích`

When the user changes keywords after analysis exists:

- call `/api/search`
- do not call `/api/analyze` again unless the user explicitly wants a fresh full analysis

Export SRT and trim should act on the currently visible scene list so the output matches the active UI mode.

## Error Handling

- If full analysis fails, mark the video as failed and skip search.
- If full analysis succeeds but search fails, preserve the full-analysis scenes and show a search-specific error.
- In that case, the user must still be able to switch to `Toàn bộ phân tích`.

## Persistence And History

History reload should restore:

- the current full-analysis version per video
- the latest keyword string used for each video's currently selected version
- the latest persisted matched-scenes result for that version+keyword pair, if one exists

Version switching should continue to work for full analysis. Search results should follow the selected version instead of becoming versions themselves.

## Verification

Minimum manual verification after implementation:

1. Analyze one video with no keywords and confirm full scenes are shown.
2. Analyze one video with keywords and confirm the app shows search results first.
3. Change keywords after analysis and confirm only `/api/search` is needed.
4. Reload the page and confirm history restores the latest full analysis and latest search result.
5. Confirm SRT export and trim operate on the currently displayed scene list.
6. Run `npm run lint` and `npm run build`.

## Scope

This change includes:

- backend prompt split between full analysis and search-from-analysis
- SQLite schema updates for persisted search results
- backend API changes for analyze and search
- frontend state and UI updates for full scenes vs matched scenes
- history restore updates for the new persisted data

This change does not include:

- changing the trim API contract
- reworking the DashScope provider
- adding automated backend tests or CI
