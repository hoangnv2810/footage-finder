# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # install dependencies (required before anything else)
npm run dev          # start Vite dev server on 0.0.0.0:3000
npm run build        # production build
npm run lint         # typecheck only (tsc --noEmit) — the only verification step
npm run preview      # serve production build
npm run clean        # rm -rf dist (fails on Windows default shell — use PowerShell)
```

No test suite, ESLint, Prettier, or CI exists. After changes, run `npm run lint` and `npm run build` to verify.

## Architecture

Single-page Vite + React 19 + Tailwind v4 app. Nearly all logic lives in **`src/App.tsx`** (a single large file containing state, UI, API calls, and FFmpeg clip export). Entry point is `src/main.tsx`.

**What it does:** Users upload videos (max 10), enter keywords, and the app sends each video as base64 to DashScope's OpenAI-compatible chat API (`qwen3.6-plus`) to find matching scenes. Users can then trim/export clips in-browser using `@ffmpeg/ffmpeg` WASM (lazy-loaded from unpkg.com). UI language is Vietnamese.

**Path alias:** `@/` maps to the project root (configured in both `vite.config.ts` and `tsconfig.json`).

## Environment

- Set `DASHSCOPE_API_KEY` in `.env.local`. It is injected at build time via Vite `define` as `process.env.DASHSCOPE_API_KEY` — do not convert to `import.meta.env` without updating `vite.config.ts`.
- The key must have access to `qwen3.6-plus` or analysis requests fail with `access_denied`.
- `DISABLE_HMR=true` disables Vite HMR (used by AI Studio). Do not change this behavior.

## Key Details

- Search history persists in `localStorage` under `footage_finder_history`. Saved entries strip `File` objects and object URLs, so old items can't be re-analyzed without relinking the video.
- Videos are sent as base64, so payload size matters.
- FFmpeg clip trimming depends on runtime WASM download from unpkg.com.
