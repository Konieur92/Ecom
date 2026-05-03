# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Vinted AI Photo Transformer** — transforms AliExpress product photos into organic Vinted-style listing photos using AI image generation.

For each product, the app generates a "Fiche Produit" of 3-4 photos:
- Photo 1 (Worn front): mannequin + garment face → mirror selfie front try-on
- Photo 2 (Worn back): generated photo 1 + garment back → mirror selfie back view
- Photo 3 (Worn 3/4): generated photo 1 + garment face → 3/4 angle mirror selfie
- Photo 4 (Flat-lay): product on white background + floor photo → flat-lay (WIP)

## Development Commands

```bash
# Start both servers simultaneously (recommended)
npm start            # Backend (port 3001) + Frontend (port 5173) via concurrently

# Or start separately
npm run dev          # Frontend only: http://localhost:5173 (Vite)
node server.cjs      # Backend only:  http://localhost:3001 (Express)

# Build & lint
npm run build        # tsc -b && vite build
npm run lint         # eslint
```

### Docker (single command)

```bash
docker compose up --build   # Build & run → http://localhost:3001
docker compose up -d        # Detached mode
docker compose down          # Stop
```

In Docker, Express serves both the API and the built frontend from a single container on port 3001. No separate Vite dev server needed.

No test suite is configured.

## Architecture

### Two-process setup (local dev)

The app requires both processes running:
- **Frontend** (`npm run dev`) — React + Vite + TypeScript at `localhost:5173`
- **Backend** (`node server.cjs`) — CommonJS Express at `localhost:3001`

The frontend reads `VITE_API_BASE` (defaults to `http://localhost:3001`). CORS origin is controlled by the `ALLOWED_ORIGIN` env variable (defaults to `http://localhost:5173`).

### Single-process setup (Docker / production)

In production, `server.cjs` serves the built Vite frontend from `dist/` as static files alongside the API. The frontend is built with `VITE_API_BASE=""` so all API calls go to the same origin. CORS is set to `*`. Everything runs on port 3001 in a single Node.js Alpine container.

### Request flow

```
App.tsx → src/services/api-client.ts → POST /api/generate/openrouter → OpenRouter API
```

`src/services/api-client.ts` is the sole frontend API client. It selects the right prompt and image payload per photo type and calls the backend endpoint. Each call is passed an `AbortSignal` — relaunching a generation cancels any in-flight request.

`server.cjs` proxies to OpenRouter (`black-forest-labs/flux.2-klein-4b` by default), sends images as base64 data URLs in the messages array, and returns `{ imageBase64 }`. The fetch to OpenRouter has a 120 s timeout; the frontend enforces a 130 s timeout via `AbortSignal.any()`. Gemini models require extra params (`modalities`, `image_config`, `provider`) added conditionally in the server.

### Image persistence

Generated images are auto-saved to `output/{ISO-timestamp}/` by the `/api/save-batch` endpoint (async I/O). Labels: `porte_face.png`, `porte_dos.png`, `porte_3quart.png`, `plat_face.png`.

### Generation flow

Photos 2 and 3 depend on photo 1 (they use it as base image). The correct batch order is:
1. Generate photo 1 (front)
2. Generate photos 2 (back) and 3 (3/4) in parallel, passing `generatedFrontImage` to `generateVintedPhoto`

`generateVintedPhoto` accepts an optional `generatedFrontImage` param for this purpose. ~11s total for 3 photos (~$0.042).

### Model

`black-forest-labs/flux.2-klein-4b` is a true image editor (FLUX Kontext architecture) — it edits existing images rather than regenerating from scratch. This is why it works for virtual try-on while Gemini/GPT-Image did not. Pricing: $0.014/megapixel.

### ShadcnUI components

`src/components/ui/` contains the ShadcnUI primitives (button, card, input, label, tabs) — modify via shadcn CLI, not directly.

## Environment

Copy `.env.example` to `.env` at project root:
```
OPENROUTER=<your-openrouter-key>
ALLOWED_ORIGIN=http://localhost:5173   # optional, override for deployment
VITE_API_BASE=http://localhost:3001    # only needed for local dev, not in Docker
```

The server validates `OPENROUTER` at startup and exits immediately if it is missing.

In Docker, `ALLOWED_ORIGIN` is set to `*` and `VITE_API_BASE` is baked as `""` at build time (same-origin). Only `OPENROUTER` needs to be in `.env`.

## Key files

| File | Role |
|------|------|
| `server.cjs` | Express backend — OpenRouter proxy + batch save + static frontend serving |
| `src/App.tsx` | Main UI — upload, config, generation orchestration |
| `src/services/api-client.ts` | Frontend API client — prompt building + fetch calls |
| `src/hooks/useGeneration.ts` | Generation state + AbortController logic |
| `src/hooks/useImageUpload.ts` | Upload state + drag-and-drop + validation |
| `src/components/ErrorBoundary.tsx` | React error boundary — catches runtime errors |
| `src/lib/utils.ts` | Shared utilities — `cn()` for Tailwind, `downloadFile()` |
| `Dockerfile` | Multi-stage build — Vite build → Node Alpine production image |
| `docker-compose.yml` | Single-command orchestration — `docker compose up --build` |
| `.dockerignore` | Excludes `node_modules`, images, etc. from build context |

## Current limitations

- `GENERATION_COUNT = 1` in `useGeneration.ts` — only the first photo of the batch is generated. Change to `3` for the full fiche produit (front, back, 3/4).
- Photos 2 and 3 require `generatedFrontImage` to be passed — the UI orchestration in `App.tsx`/`useGeneration.ts` needs to be updated to chain generation correctly.
- Flat-lay prompt (`flatFront`/`flatBack`) is WIP — needs a floor photo as second input image and a better prompt. Do not use the existing flat prompts as-is.
- Object mode (`mode: 'object'`) generates a single lifestyle photo using a generic prompt. No multi-angle logic yet.
