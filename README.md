# Polycam 3D Scan Viewer (v0.1.0)

Web-based viewer for Polycam LiDAR exports. It renders textured GLB meshes and PLY point clouds, and supports annotations, clipping, measurements, and rich-media publish workflow.

## Highlights

- GLB + PLY scene rendering with React Three Fiber
- Annotation system with image/video/link content
- Draft save + publish + rollback workflow on Vercel
- Media upload to Vercel Blob via client upload tokens
- Smoke and browser-level test coverage

## Tech Stack

- Vite 6 + React 19 + TypeScript (strict)
- Three.js + @react-three/fiber + @react-three/drei
- zustand + shadcn/ui + Tailwind CSS v4
- Vercel Functions (`api/`) + Vercel Blob

## Project Structure

```text
src/          Frontend app code
api/          Vercel Functions (auth/draft/media/publish/release/rollback)
public/       Static assets (source model files live in public/models)
e2e/          Playwright smoke tests
docs/         Planning and implementation docs
```

## Prerequisites

- Bun 1.3+
- Node.js 20+
- (For API local runtime) Vercel CLI

## Environment Variables

Create a local env file from `.env.example` and set:

- `BLOB_READ_WRITE_TOKEN`: Vercel Blob read/write token
- `ADMIN_PASSWORD`: editor login password
- `AUTH_SECRET`: cookie signing secret (32+ chars)

## Local Development

Install dependencies:

```bash
bun install
```

Run frontend dev server:

```bash
bun run dev
```

To run API routes locally, run Vercel Functions runtime in another terminal:

```bash
vercel dev
```

If you want full local API testing without Vercel CLI login, use:

```bash
bun run dev:api
```

## Scripts

```bash
bun run lint
bun run dev:api
bun run test:vitest
bun run test:e2e
bun run test:all
bun run build
```

## Publish Workflow (Vercel)

Authenticated editor flow:

1. Login via `POST /api/auth/login`
2. Save scene draft via `PUT /api/draft/:sceneId`
3. Upload media via `POST /api/media/upload` + client direct upload
4. Publish release via `POST /api/publish/:sceneId`
5. Public clients read latest release via `GET /api/release/:sceneId`
6. Roll back via `POST /api/rollback/:sceneId`

## Models and Build Output

- Source model assets are maintained in `public/models`
- `dist/` is generated build output and should not be treated as a source of truth
- `.vercelignore` excludes `dist` and other non-deploy source folders from upload

## Current Version

`v0.1.0`
