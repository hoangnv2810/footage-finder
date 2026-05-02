# Storyboard Copy, Import, And Persistence Design

## Goal

Add a manual GPT/Claude roundtrip for storyboard generation and persist storyboard results in SQLite so generated/imported storyboards survive reloads and can be reopened from a saved list.

## Current Behavior

The Storyboard page sends product fields, script text, and selected video version IDs to `/api/storyboard/generate`. The backend generates beats and matches, returns a `StoryboardResult`, and the frontend stores it only in React state. Reloading the app loses the storyboard. There is no way to copy the full model input or paste a manually generated model output back into the app.

## UX

The Storyboard page will add three controls near the existing generate action:

- `Copy input`: copies a complete prompt for GPT/Claude web.
- `Import storyboard JSON`: opens a dialog for pasting model output JSON.
- `Storyboard đã lưu`: a saved-storyboard list/dropdown sorted by newest first.

Each saved list item shows product name or a fallback title, source (`generated` or `imported`), beat count, and updated time. Selecting an item restores product fields, script text, selected version IDs, and storyboard result into the current UI.

After `Tạo storyboard` or a successful import, the backend saves the storyboard and returns the saved item. The frontend selects it immediately.

## Copy Input Format

`Copy input` builds one prompt that asks GPT/Claude to perform both planning and matching in one response. The prompt includes:

- product context: `product_name`, `category`, `target_audience`, `tone`, `key_benefits`
- `script_text`
- `candidate_scenes`, built from selected video versions, with fields: `candidate_id`, `file_name`, `video_version_id`, `scene_index`, `keyword`, `description`, `context`, `subjects`, `actions`, `mood`, `shot_type`, `marketing_uses`, `relevance_notes`, `start`, `end`
- required output schema

The expected pasted JSON is:

```json
{
  "beats": [
    {
      "id": "beat-1",
      "label": "hook",
      "text": "Nội dung beat",
      "intent": "Mục tiêu",
      "desiredVisuals": "Gợi ý hình ảnh",
      "durationHint": 3.5,
      "position": 0
    }
  ],
  "beatMatches": [
    {
      "beatId": "beat-1",
      "matches": [
        {
          "candidateId": "version-id:0",
          "score": 0.93,
          "matchReason": "Lý do chọn",
          "usageType": "direct_product"
        }
      ]
    }
  ]
}
```

The import endpoint maps `candidateId` to stored candidate scene data and returns the same normalized `StoryboardResult` shape used by the current UI.

## Backend Storage

Add `storyboard_project`:

```sql
CREATE TABLE IF NOT EXISTS storyboard_project (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  product_name TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  target_audience TEXT NOT NULL DEFAULT '',
  tone TEXT NOT NULL DEFAULT '',
  key_benefits TEXT NOT NULL DEFAULT '',
  script_text TEXT NOT NULL DEFAULT '',
  selected_version_ids TEXT NOT NULL DEFAULT '[]',
  candidate_snapshot_json TEXT NOT NULL DEFAULT '[]',
  result_json TEXT NOT NULL DEFAULT '{}',
  source TEXT NOT NULL DEFAULT 'generated'
);
```

`candidate_snapshot_json` stores the candidate scenes used when copying/generating/importing. This keeps old storyboards renderable even if video versions change later.

## API

Add these endpoints:

- `GET /api/storyboards`: list saved storyboards with summary fields and result beat count.
- `GET /api/storyboards/{id}`: return the full saved storyboard.
- `POST /api/storyboards/generate`: generate with the existing model flow, save, and return the saved storyboard.
- `POST /api/storyboards/import`: validate pasted JSON, normalize matches through the current candidate snapshot, save, and return the saved storyboard.
- `DELETE /api/storyboards/{id}`: delete a saved storyboard.

Keep `/api/storyboard/generate` for compatibility, but move frontend usage to `/api/storyboards/generate`.

## Validation And Errors

Copy/import requires non-empty script text and at least one selected version. Import rejects invalid JSON, missing beats, unknown `candidateId`, and invalid `usageType`. User-facing errors stay Vietnamese.

## Testing

Backend tests cover table initialization, save/list/get/delete, generated storyboard persistence, and import mapping from `candidateId` to normalized scenes. Frontend tests cover copy prompt construction, import submission, and loading a saved storyboard from the list.
