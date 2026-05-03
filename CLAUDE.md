# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Vinted AI Photo Transformer** — transforms AliExpress product photos into organic Vinted-style listing photos using AI image generation.

For each product, the Studio generates a "Fiche Produit" of 3 photos:
- Photo 1 (Porté Face): mannequin + garment face → mirror selfie front try-on
- Photo 2 (Porté Dos): generated photo 1 + garment back → mirror selfie back view
- Photo 3 (Détail / 3/4): generated photo 1 + garment face → 3/4 angle mirror selfie

## Development Commands

### Local dev (two-process legacy app)

```bash
npm start            # Backend (port 3001) + old Vite frontend (port 5173) via concurrently
npm run dev          # Old Vite frontend only: http://localhost:5173
node server.cjs      # Backend only: http://localhost:3001
```

### Next.js Studio frontend (primary UI)

```bash
cd front
npm install
npm run dev          # Next.js dev server: http://localhost:3000
```

### Docker (two containers)

```bash
docker compose up --build   # Backend (3001) + Next.js Studio (3000)
docker compose up -d        # Detached mode
docker compose down          # Stop
```

In Docker, the Next.js frontend (`front/`) proxies `/api/*` and `/output/*` to the backend container via Next.js rewrites.

No test suite is configured.

## Architecture

### Two-container setup (Docker / production)

- **Backend** (`server.cjs`) — Express on port 3001. Handles AI generation, all CRUD APIs, PostgreSQL.
- **Studio frontend** (`front/`) — Next.js 16 standalone on port 3000. Proxies API calls to backend via `next.config.mjs` rewrites.

The old Vite app at the root (`src/`) is a legacy prototype. The primary UI is the Next.js Studio in `front/`.

### Database

PostgreSQL via `pg`. Connection string in `DATABASE_URL` env var. Tables initialized at server startup:

| Table | Purpose |
|-------|---------|
| `mannequins` | Stored mannequin profiles (name, front_url, back_url) |
| `products` | Product metadata (name, type, environment, mannequin_id, source_images JSONB) |
| `generated_photos` | Photo references per product (label, approved) |
| `photo_versions` | Versioned photo URLs per generated photo (url, prompt, version number) |
| `conversation_messages` | AI editor conversation history per photo (role, text, image_url, version_label) |

### Request flow (Studio)

```
front/components → fetch /api/* → Next.js rewrites → backend:3001 → OpenRouter API
```

`front/lib/api.ts` is the sole Studio API client (typed, no AbortSignal).
`front/next.config.mjs` rewrites `/api/:path*` and `/output/:path*` to `BACKEND_URL` (default `http://localhost:3001`).

### Generation flow (Studio / BatchView)

Photos generated sequentially per product, products sequentially in the queue:
1. Porté Face — mannequin front + product face
2. Porté Dos — generated photo 1 + product back (or face if no back)
3. Détail (3/4) — generated photo 1 + product face

`generatedFrontImage` is captured after step 1 and reused for steps 2 and 3 within the same product.

Each generated photo is immediately saved to the DB via `POST /api/products/:id/photos`.

### Iterative editor (EditorPanel)

Sliding right-panel opened per photo. Sends instructions to OpenRouter using the current image version as input. Each assistant response creates a new `photo_version` + `conversation_message` in the DB. Versions are displayed as thumbnails and can be navigated.

### Model

`black-forest-labs/flux.2-klein-4b` is a true image editor (FLUX Kontext architecture) — it edits existing images rather than regenerating from scratch. This is why it works for virtual try-on while Gemini/GPT-Image did not. Pricing: $0.014/megapixel.

Gemini models require extra params (`modalities`, `image_config`, `provider`) added conditionally in the server.

### Image persistence

Generated images are saved as data URLs in `photo_versions.url` in PostgreSQL. The legacy `/api/save-batch` endpoint (filesystem save to `output/{timestamp}/`) is still available but not used by the Studio.

## Environment

Copy `.env.example` to `.env` at project root:
```
OPENROUTER=<your-openrouter-key>
DATABASE_URL=<postgresql-connection-string>
ALLOWED_ORIGIN=http://localhost:3000   # Next.js Studio port
```

For the Next.js frontend in Docker, `BACKEND_URL=http://backend:3001` is set in `docker-compose.yml`.

The server validates `OPENROUTER` at startup and exits immediately if missing.

## Key files

| File | Role |
|------|------|
| `server.cjs` | Express backend — OpenRouter proxy + PostgreSQL CRUD + legacy batch save |
| `front/app/page.tsx` | Studio entry point — renders `<StudioApp />` |
| `front/components/studio/studio-app.tsx` | Root Studio component — layout, view routing, data loading |
| `front/components/studio/mannequin-sidebar.tsx` | Left sidebar — mannequin CRUD |
| `front/components/studio/center-panel.tsx` | Center — switches between batch/products/review views |
| `front/components/studio/views/batch-view.tsx` | Product queue + generation orchestration (3 photos/product) |
| `front/components/studio/views/products-view.tsx` | Gallery of saved products |
| `front/components/studio/views/review-view.tsx` | Review generated photos per product |
| `front/components/studio/editor-panel.tsx` | Sliding AI editor panel — iterative editing with conversation history |
| `front/lib/api.ts` | Studio API client — typed fetch wrappers for all backend endpoints |
| `front/lib/studio-types.ts` | Shared TypeScript types (Mannequin, QueuedProduct, GeneratedPhoto, etc.) |
| `front/next.config.mjs` | Next.js config — standalone output + API proxy rewrites |
| `src/App.tsx` | Legacy Vite UI (prototype — not primary) |
| `src/services/api-client.ts` | Legacy frontend API client |
| `src/hooks/useGeneration.ts` | Legacy generation hook (GENERATION_COUNT = 1) |
| `Dockerfile` | Backend build — Node Alpine |
| `front/Dockerfile` (if exists) | Next.js standalone build |
| `docker-compose.yml` | Two-container orchestration — backend:3001 + front:3000 |

## ShadcnUI components

`front/components/ui/` contains the ShadcnUI primitives — modify via shadcn CLI, not directly.

## Current limitations / known issues

- Images are stored as base64 data URLs in PostgreSQL — large payloads. Future: move to object storage (S3/R2) and store URLs only.
- Legacy Vite app (`src/`) has `GENERATION_COUNT = 1` — only generates the first photo. This app is a prototype; use the Studio (`front/`) for the full flow.
- Flat-lay prompt (`flatFront`/`flatBack`) exists in legacy code but is WIP. Not implemented in the Studio.
- Object mode in the Studio generates all 3 photos with the same lifestyle prompt — no differentiation between angles yet.
- The `ALLOWED_ORIGIN` must match the Studio origin (`http://localhost:3000` for local, `*` in Docker).
