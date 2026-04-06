# Repository Notes

- This repo is not frontend-only anymore. The shipped app is a Vite React frontend in `src/` plus a FastAPI backend in `server/`.
- Frontend entry is `src/main.tsx`; most UI/state lives in `src/App.tsx`.
- Backend entry is `server/main.py`; analysis streaming lives in `server/analysis.py`, persistence in `server/db.py`, and video-folder resolution in `server/video_folder.py`.

# Setup And Commands

- Install both sides before running anything: `npm install` and `python -m pip install -r server/requirements.txt`.
- Frontend dev server: `npm run dev` on `0.0.0.0:3000`.
- Backend dev server: `npm run dev:server` which runs `uvicorn` from `server/` on `127.0.0.1:8000`.
- Vite proxies `/api` to `http://127.0.0.1:8000`, so most local work needs both processes running.
- `npm run lint` is only TypeScript typechecking for the frontend (`tsc --noEmit`).
- `npm run build` only builds the Vite app; it does not validate backend code.
- `npm run clean` uses `rm -rf dist`, which fails in default PowerShell on Windows.

# Env And Runtime

- Backend loads `.env.local` first, then `.env`, from the repo root.
- `DASHSCOPE_API_KEY` is read on the Python side, not injected into the browser.
- `VIDEO_FOLDER` must point to an existing directory or `/api/videos` and filename-based analysis/trim routes fail.
- Server-side trim requires a system `ffmpeg` binary on `PATH`; without it `/api/trim` is unavailable.
- DashScope analysis is hardcoded to `qwen3.6-plus` in the backend.
- `DISABLE_HMR=true` disables Vite HMR; `vite.config.ts` says not to change this AI Studio behavior.

# Product Gotchas

- History is stored in SQLite at `server/data.db`, not in browser storage. Related WAL files are also created in `server/`.
- Analyses are versioned per video in the database; switching versions in the UI persists `currentVersionIndex` back through `/api/history`.
- Analysis reads the whole source video into memory and sends it to DashScope as a base64 data URL, so large files are expensive in RAM and request size.
- Uploaded videos are copied into `VIDEO_FOLDER`; duplicate names are auto-renamed on upload.
- Clip export is server-side now: the frontend posts `filename/start/end` to `/api/trim` and downloads the returned file.
- The UI text and model prompt outputs are Vietnamese; keep user-facing copy consistent.

# Verification

- After frontend changes, run `npm run lint` then `npm run build`.
- There is no repo-native Python test suite, formatter, ESLint config, or CI workflow.
