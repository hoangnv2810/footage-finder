# Single-Folder Video Rename Implementation Plan

> This plan implements `docs/superpowers/specs/2026-04-19-single-folder-video-rename-design.md` and supersedes the earlier multi-folder execution plan for folder-management scope.

**Goal:** Simplify the library domain so each physical video belongs to exactly one logical folder, move video edits to the video item popup, keep folder actions limited to rename/delete, and preserve safe physical filename rename without breaking saved analysis history.

**Architecture:** Keep `video_file` as the physical asset identity and `history_video` as the dataset identity, but collapse folder ownership to `video_file.primary_product_folder_id` as the only runtime source of truth. Backend owns migration from legacy multi-folder links, a unified atomic `PATCH /api/video-files/{id}` mutation, and immutable handling of `Chưa phân loại`. Frontend removes linked-folder UI/state, adds `3 chấm` folder menus plus per-video edit popup, and consumes a simplified `folder` payload.

**Tech Stack:** FastAPI, SQLite, React 18, TypeScript, Vitest, Testing Library, Python `unittest`

---

## File Structure

- Modify: `server/db.py` - collapse folder runtime model to single-folder ownership, update migrations/backfills, simplify folder mutations, add unified video patch mutation, simplify serializers
- Modify: `server/main.py` - remove/replace multi-folder routes, simplify folder delete payload, add `PATCH /api/video-files/{id}`
- Modify: `server/video_folder.py` - keep filename validation and filesystem rename helper for atomic video patch flow
- Modify: `server/tests/test_db_video_assets.py` - replace multi-folder DB assertions with single-folder migration and folder-rehome coverage
- Modify: `server/tests/test_main_video_files_api.py` - replace folder link/set-primary tests with folder delete-to-unclassified and unified video patch tests
- Modify: `src/lib/footage-app.ts` - replace `primaryFolder/linkedFolders` payload model with `folder`, replace video rename/folder APIs with unified patch API, update normalization
- Modify: `src/lib/footage-app.test.ts` - update normalization expectations to single-folder payload shape
- Modify: `src/components/library/types.ts` - remove linked-folder fields from UI types and model the single-folder/video-edit sidebar state
- Create: `src/components/ui/dropdown-menu.tsx` - Radix wrapper for `3 chấm` menus used by folder rows
- Modify: `src/components/library/ProductVideoList.tsx` - pass folder/video action handlers into folder and video rows
- Modify: `src/components/library/ProductGroup.tsx` - replace inline folder action icons with `3 chấm` menu
- Modify: `src/components/library/VideoListItem.tsx` - remove linked-folder badge, add video edit trigger
- Modify: `src/components/library/FolderFormDialog.tsx` - keep as rename dialog for folders only
- Modify: `src/components/library/DeleteFolderDialog.tsx` - simplify copy and remove replacement-folder chooser
- Create: `src/components/library/EditVideoDialog.tsx` - combined rename-file + move-folder popup for a single video item
- Delete: `src/components/library/RenameVideoFileDialog.tsx` - superseded by `EditVideoDialog`
- Delete: `src/components/library/VideoAssetManager.tsx` - obsolete multi-folder detail-panel behavior
- Modify: `src/components/library/VideoDetailPanel.tsx` - remove multi-folder asset manager block; keep metadata read-only
- Modify: `src/pages/LibraryPage.tsx` - map simplified folder payload and wire folder/video popup state
- Modify: `src/components/library/ProductVideoList.test.tsx` - update sidebar tests for folder `3 chấm` and video edit trigger
- Create: `src/components/library/EditVideoDialog.test.tsx` - cover combined popup behavior
- Delete: `src/components/library/VideoAssetManager.test.tsx` - obsolete multi-folder expectations
- Modify: `src/App.tsx` - remove linked-folder state/mutations, wire unified video patch mutation, keep selection stable after rename/move

## Task 1: Collapse Backend Folder Runtime Model To Single-Folder Ownership

**Files:**
- Modify: `server/db.py`
- Modify: `server/tests/test_db_video_assets.py`

- [ ] **Step 1: Write failing DB coverage for the approved single-folder rules**

Add/replace DB tests to prove the new invariants:

- legacy multi-folder data keeps only the existing `primary_product_folder_id`
- legacy rows without a valid primary folder fall back to `Chưa phân loại`
- serialized videos expose `folder` only, not `primaryFolder/linkedFolders`
- product folder counts are derived from `video_file.primary_product_folder_id`

Suggested cases:

- `test_init_db_keeps_primary_folder_and_discards_legacy_linked_folders`
- `test_init_db_falls_back_to_unclassified_when_primary_missing`
- `test_list_history_serializes_single_folder_payload`

- [ ] **Step 2: Run the targeted DB suite and confirm the old multi-folder assumptions fail**

Run:

```bash
python -m unittest server.tests.test_db_video_assets -v
```

Expected: failures around `linkedFolders`, folder counts, or legacy many-to-many behavior.

- [ ] **Step 3: Implement the minimal DB/model changes**

Update `server/db.py` so runtime behavior uses exactly one folder per video:

- keep `video_file.primary_product_folder_id` as the only runtime ownership field
- treat `product_folder_video` as legacy migration input only, not a runtime source of truth
- during `init_db()` / backfill:
  - preserve `primary_product_folder_id` when valid
  - otherwise assign `Chưa phân loại`
  - remove or ignore legacy linked-folder rows after choosing the surviving folder
- update folder summary/count queries to count videos by `video_file.primary_product_folder_id`
- update history/video serialization from:
  - `primaryFolder`, `linkedFolders`, `linkedFolderCount`
  to:
  - `folder`

- [ ] **Step 4: Re-run DB tests until the single-folder migration passes**

Run again:

```bash
python -m unittest server.tests.test_db_video_assets -v
```

Expected: DB tests pass with no remaining serializer references to linked-folder state.

## Task 2: Simplify Backend Mutations And Expose Unified Video Patch API

**Files:**
- Modify: `server/main.py`
- Modify: `server/db.py`
- Modify: `server/video_folder.py`
- Modify: `server/tests/test_main_video_files_api.py`

- [ ] **Step 1: Replace API tests that encode the old multi-folder workflow**

Remove or rewrite tests for:

- `/api/video-files/{id}/folders`
- `/api/video-files/{id}/folders/{folder_id}`
- `/api/video-files/{id}/primary-folder`

Add failing tests for the new behavior:

- `DELETE /api/product-folders/{id}` moves all videos to `Chưa phân loại`
- deleting or renaming `Chưa phân loại` returns a clear error
- `PATCH /api/video-files/{id}` supports:
  - rename only
  - move folder only
  - rename + move together
  - invalid folder id
  - filename conflict
  - rollback when DB update fails after filesystem rename

- [ ] **Step 2: Run the API suite and confirm the old contract is now broken**

Run:

```bash
python -m unittest server.tests.test_main_video_files_api -v
```

Expected: failures due to changed route expectations and missing unified patch behavior.

- [ ] **Step 3: Implement the backend mutation contract**

In `server/main.py`:

- keep `GET/POST/PATCH /api/product-folders`
- simplify `DELETE /api/product-folders/{id}` so it no longer takes replacement-folder selection from the client
- add `PATCH /api/video-files/{video_file_id}` with optional `filename` and `folder_id`
- remove or stop exporting the old link/unlink/set-primary routes from the active API surface

In `server/db.py`:

- simplify `delete_product_folder(folder_id)` so it always rehomes current videos to `Chưa phân loại`
- add a single mutation helper for video updates, e.g. `update_video_file(video_file_id, filename=None, folder_id=None)`
- validate all inputs before committing DB changes
- preserve rename atomicity by rolling back the filesystem rename if DB persistence fails

- [ ] **Step 4: Re-run the API tests until the new contract passes**

Run:

```bash
python -m unittest server.tests.test_main_video_files_api -v
```

Expected: API suite passes under the new single-folder and unified-patch behavior.

## Task 3: Simplify Frontend Data Layer To A Single `folder` Payload

**Files:**
- Modify: `src/lib/footage-app.ts`
- Modify: `src/lib/footage-app.test.ts`

- [ ] **Step 1: Write/update failing frontend normalization tests**

Replace linked-folder expectations with single-folder expectations:

- normalized datasets expose `folder`
- no frontend code depends on `linkedFolders` or `primaryFolder`
- product grouping derives only from `dataset.folder`
- unified video patch API wrapper sends a single request for rename/move save

- [ ] **Step 2: Run the targeted frontend normalization tests and confirm they fail**

Run:

```bash
npm run test -- src/lib/footage-app.test.ts
```

Expected: failures where old payload fields are still expected.

- [ ] **Step 3: Implement the frontend data-layer changes**

Update `src/lib/footage-app.ts` to:

- replace `primaryFolder` and `linkedFolders` with `folder`
- remove add/remove/set-primary API wrappers
- add one API wrapper for `PATCH /api/video-files/{id}`
- simplify `DeleteProductFolderPayload` so the client no longer sends replacement routing decisions
- keep normalization tolerant enough to read transitional data during the refactor, but write all new app logic against `folder`

- [ ] **Step 4: Re-run the frontend normalization tests**

Run:

```bash
npm run test -- src/lib/footage-app.test.ts
```

Expected: payload normalization and API wrappers pass under the new contract.

## Task 4: Redesign Sidebar Interactions Around Folder `3 Chấm` And Video Edit Popup

**Files:**
- Create: `src/components/ui/dropdown-menu.tsx`
- Modify: `src/components/library/types.ts`
- Modify: `src/components/library/ProductVideoList.tsx`
- Modify: `src/components/library/ProductGroup.tsx`
- Modify: `src/components/library/VideoListItem.tsx`
- Modify: `src/components/library/FolderFormDialog.tsx`
- Modify: `src/components/library/DeleteFolderDialog.tsx`
- Create: `src/components/library/EditVideoDialog.tsx`
- Modify: `src/components/library/ProductVideoList.test.tsx`
- Create/Modify: `src/components/library/EditVideoDialog.test.tsx`

- [ ] **Step 1: Update sidebar tests to the new UX before changing components**

Cover the approved behavior:

- folder row renders `3 chấm` menu instead of inline rename/delete icons
- `Chưa phân loại` menu is read-only and offers no destructive actions
- video row renders an edit affordance
- linked-folder badge no longer appears
- `DeleteFolderDialog` copy states that videos move to `Chưa phân loại`
- `EditVideoDialog` can save rename-only, move-only, and combined changes

- [ ] **Step 2: Run the sidebar/dialog test subset and confirm failures**

Run:

```bash
npm run test -- src/components/library/ProductVideoList.test.tsx src/components/library/EditVideoDialog.test.tsx
```

Expected: current multi-folder UI assumptions fail.

- [ ] **Step 3: Implement the UI redesign**

Update component responsibilities:

- `ProductGroup.tsx`
  - replace inline pencil/trash buttons with a `3 chấm` menu
  - folder menu offers only `Sửa tên` and `Xóa` for normal folders
  - `Chưa phân loại` keeps a read-only menu state
- `VideoListItem.tsx`
  - remove linked-folder badge
  - add an edit icon/button for the video popup
- `DeleteFolderDialog.tsx`
  - remove replacement-folder selector
  - keep only confirmation copy about moving videos to `Chưa phân loại`
- `FolderFormDialog.tsx`
  - keep it focused on folder rename/create only
- `EditVideoDialog.tsx`
  - show current filename and folder
  - allow editing filename and selecting a new folder
  - disable save when there is no real change

- [ ] **Step 4: Re-run the sidebar/dialog tests until they pass**

Run:

```bash
npm run test -- src/components/library/ProductVideoList.test.tsx src/components/library/EditVideoDialog.test.tsx
```

Expected: sidebar and dialog interactions pass under the new UI.

## Task 5: Rewire App State And Remove Multi-Folder Detail-Panel Behavior

**Files:**
- Modify/Delete: `src/components/library/VideoAssetManager.tsx`
- Modify/Delete: `src/components/library/VideoAssetManager.test.tsx`
- Modify/Delete: `src/components/library/RenameVideoFileDialog.tsx`
- Modify: `src/components/library/VideoDetailPanel.tsx`
- Modify: `src/pages/LibraryPage.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write/update failing app-wiring tests or targeted assertions**

If existing tests are insufficient, add small focused coverage so the refactor has guardrails:

- selected video remains selected after rename/move if the dataset still exists
- moving a video updates its folder group in the sidebar without losing selection
- detail panel no longer renders multi-folder mutation controls

- [ ] **Step 2: Run the affected frontend tests and confirm old wiring fails**

Run:

```bash
npm run test -- src/components/library/ProductVideoList.test.tsx src/components/library/EditVideoDialog.test.tsx src/lib/footage-app.test.ts
```

Expected: failures where `App.tsx`, `LibraryPage.tsx`, or detail-panel mappings still depend on linked-folder state.

- [ ] **Step 3: Implement the app wiring cleanup**

In `src/App.tsx` and `src/pages/LibraryPage.tsx`:

- remove linked-folder mutations and their state wiring
- use only `dataset.folder` for grouping and folder metadata
- wire folder rename/delete flows to the folder `3 chấm` menu
- wire video edit popup state to individual video items
- call the unified video patch API for rename/move save
- preserve selected dataset and selected version/search state after successful mutation

In `src/components/library/VideoDetailPanel.tsx`:

- remove the multi-folder asset manager block
- keep file name and current folder visible in read-only form

In obsolete components:

- delete `VideoAssetManager` and `RenameVideoFileDialog` after their callers move to `EditVideoDialog`

- [ ] **Step 4: Re-run the affected frontend tests until the old multi-folder wiring is gone**

Run:

```bash
npm run test -- src/components/library/ProductVideoList.test.tsx src/components/library/EditVideoDialog.test.tsx src/lib/footage-app.test.ts
```

Expected: frontend wiring passes using the new popup-driven flow.

## Task 6: Full Verification And Cleanup

**Files:**
- Modify any touched files from Tasks 1-5

- [ ] **Step 1: Run backend tests**

```bash
python -m unittest discover server/tests -v
```

- [ ] **Step 2: Run targeted frontend tests**

```bash
npm run test -- src/components/library/ProductVideoList.test.tsx src/components/library/EditVideoDialog.test.tsx src/lib/footage-app.test.ts
```

- [ ] **Step 3: Run typecheck and build**

```bash
npm run lint
npm run build
```

- [ ] **Step 4: Final cleanup check**

Verify all of the following before calling the work complete:

- no public frontend code still reads `linkedFolders`, `linkedFolderCount`, or `primaryFolder`
- no active frontend mutation still calls add/remove/set-primary folder APIs
- `Chưa phân loại` is immutable in both backend and frontend UX
- folder delete always rehomes videos to `Chưa phân loại`
- unified video patch preserves rename safety and selected dataset continuity

## Notes For Execution

- Prefer replacing the old multi-folder workflow cleanly rather than layering more compatibility code on top of it.
- Keep the rename-safe backend logic intact; simplify only the folder model around it.
- Preserve Vietnamese user-facing copy in new dialogs and menu labels.
- If an old component becomes a thin shell around the new popup flow, delete it instead of keeping dead abstractions alive.
