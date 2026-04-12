# Repo Notes

- `README.md` and `CLAUDE.md` are stale in places: they still describe the older frontend-only/localStorage/`@ffmpeg/ffmpeg` setup. Trust `package.json`, `vite.config.ts`, and `server/*.py` instead.
- The shipped app is a Vite React frontend in `src/` plus a FastAPI backend in `server/`.
- Frontend entry is `src/main.tsx`; most UI/state/API wiring is still concentrated in `src/App.tsx`.
- Backend entry is `server/main.py`; model prompts/parsing live in `server/analysis.py`, SQLite persistence in `server/db.py`, and library path resolution in `server/video_folder.py`.

# Setup And Commands

- Install both sides before running anything: `npm install` and `python -m pip install -r server/requirements.txt`.
- Frontend dev server: `npm run dev` on `0.0.0.0:3000`.
- Backend dev server: `npm run dev:server`, which starts `uvicorn` from `server/` on `127.0.0.1:8000`.
- Vite proxies `/api` to `http://127.0.0.1:8000`, so most local work needs both processes running.
- `npm run lint` is frontend TypeScript typecheck only (`tsc --noEmit`).
- `npm run build` only builds the Vite app; it does not validate backend code.
- `npm run clean` uses `rm -rf dist`, which is not portable to default PowerShell on Windows.

# Env And Runtime

- The backend loads `.env.local` first, then `.env`, from the repo root.
- `DASHSCOPE_API_KEY` is read only on the Python side.
- `VIDEO_FOLDER` must point to an existing directory or `/api/videos`, upload, stream, analyze, and trim flows will fail.
- Server-side trimming depends on a system `ffmpeg` on `PATH`; without it `/api/trim` is unavailable.
- Model selection is backend-controlled via `VIDEO_ANALYSIS_MODEL`, `SCRIPT_PLANNING_MODEL`, and `SCENE_MATCHING_MODEL`; all default to `qwen3.6-plus`.
- `DISABLE_HMR=true` disables Vite HMR. `vite.config.ts` explicitly says not to change that AI Studio behavior.

# Product Gotchas

- History is stored in SQLite at `server/data.db`, not browser storage. WAL sidecar files are expected in `server/`.
- Analysis results are versioned per video in the database; the UI persists `currentVersionIndex` and `currentSearchKeywords` through `/api/history/selection`.
- `/api/analyze` streams SSE events, saves the full-scene analysis first, then optionally runs keyword search against that saved version.
- Analysis reads the whole source video into memory and sends it to DashScope as a base64 data URL, so large videos are expensive in RAM and request size.
- Uploaded videos are copied into `VIDEO_FOLDER`; duplicate filenames are auto-renamed on upload.
- Clip export is server-side now: the frontend posts `filename/start/end` to `/api/trim` and downloads the returned mp4.
- Storyboard generation is server-side and works from selected saved video versions, not raw uploads.
- User-facing UI copy and model outputs are intentionally Vietnamese; keep new text consistent.

# Verification

- After frontend changes, run `npm run lint` then `npm run build`.
- There is no repo-native Python test suite, formatter, ESLint config, or CI workflow.
