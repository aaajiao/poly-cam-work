# poly.cam.work (v0.1.0)

A visualization platform for the ongoing work of aaajiao. This repository serves as the technical foundation for the *Symbiosis* project, providing a space where 3D scans, point clouds, and rich-media annotations converge to document the intersection of labor, material production, and global trade.

[**中文文档 (Chinese Documentation)**](docs/README.md)

## Positioning

`poly.cam.work` is more than a 3D viewer. It is a digital archive and research platform designed to bridge the gap between physical labor and digital representation. By integrating high-fidelity LiDAR scans with contextual media, it allows for a multi-layered exploration of the *Symbiosis* project—a decade-long engagement with industrial production, youth precarity, and the shifting landscapes of global trade.

The platform serves as:
- **A Research Hub**: Centralizing data visualizations, field recordings, and 3D documentation.
- **An Artistic Interface**: Providing a spatial narrative for the *Symbiosis* project's core concepts of *Absorption* and *Trance*.
- **A Technical Foundation**: Offering a robust workflow for publishing and managing 3D scenes with rich-media annotations.

For deeper context on the artwork and its evolving research, see the [Symbiosis Project Background](docs/aaajiao_symbiosis_project.md) or read the [Project Manifesto](docs/manifesto.md).

## Highlights

- GLB + PLY scene rendering with React Three Fiber
- Annotation system with image/video/link content
- Local-first draft workflow (edits persist in browser before publish)
- Publish/release workflow on Vercel with rollback + version management
- Media upload to Vercel Blob at publish time via client upload tokens
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
- (Optional) Vercel CLI for `vercel dev`

## Environment Variables

Create a local env file from `.env.example` and set:

- `POLYCAM_BLOB_READ_WRITE_TOKEN`: preferred Vercel Blob read/write token name
- `ADMIN_PASSWORD`: editor login password
- `AUTH_SECRET`: cookie signing secret (32+ chars)
- Legacy fallback: `BLOB_READ_WRITE_TOKEN` is still accepted if already configured

## Local Development

Install dependencies:

```bash
bun install
```

`node_modules` is not portable across operating systems. This project runs on both macOS and Linux, but native Rollup packages are installed per platform, so after moving the repo between machines you should rerun `bun install` locally. If a copied `node_modules/` directory still causes a mismatch, remove it and reinstall on the current machine.

Run frontend dev server:

```bash
bun run dev
```

Run API routes locally (recommended, no Vercel login required):

```bash
bun run dev:api
```

Alternative API runtime using Vercel CLI:

```bash
vercel dev
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

## Testing Workflow

See `docs/TESTING.md` for the repo's test-layer rules, command selection, and Playwright hang troubleshooting.

- `bun run test:vitest:browser` is the main path for browser-based UI interaction coverage.
- `bun run test:e2e` is the Playwright smoke suite for app-shell and critical runtime checks.
- `bun run test:e2e:ui` is a debugging mode and stays interactive until you stop it.

## Publish Workflow (Vercel)

Authenticated editor flow:

1. Login via `POST /api/auth/login`
2. Session restore check via `GET /api/auth/session`
3. Local edits stay in browser storage until publish
4. Publish via `POST /api/publish/:sceneId` (uploads local images, saves draft, creates release)
5. Manage releases via `GET /api/publish/:sceneId` (list) and `DELETE /api/publish/:sceneId` (delete version)
6. Public clients read latest release via `GET /api/release/:sceneId`
7. Roll back via `POST /api/rollback/:sceneId`

## Official Scene Workflow (Maintainer)

Official scenes are repository-first. Maintainers add model assets to the codebase, then sync them to the cloud catalog.

1. **Add Assets**: Place GLB and PLY pairs in `public/models/` (e.g., `my-scan.glb` and `my-scan.ply`).
2. **Refresh**: In the File Manager, click **Refresh** to discover new local models.
3. **Sync**: Click the **Cloud** icon next to a discovered scene to upload its assets to Vercel Blob and register it in the cloud catalog.
4. **Author**: Once synced, the scene is available for annotation and publishing like any other cloud scene.

## Editor Semantics

- `Import`: load a local draft JSON file into the current scene
- `Export`: download current local draft JSON
- `Publish`: push local draft (including local images) to cloud release (scene content only)
- `Sync`: upload official model assets (GLB/PLY) to cloud catalog
- `Discovered`: local official scene found in `public/models`
- `Cloud`: official scene whose assets are synced to Vercel Blob
- `Session`: temporary scene uploaded via UI (not persisted in catalog)
- `saved` / `unsaved`: local draft publish state for current scene
- `live`: currently served release version tag

## Models and Build Output

- Source model assets are maintained in `public/models`
- `dist/` is generated build output and should not be treated as a source of truth
- `.vercelignore` excludes `dist` and other non-deploy source folders from upload

## Current Version

`v0.1.0`
