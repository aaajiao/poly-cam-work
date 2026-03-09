# poly.cam.work

Visualization platform and digital archive for the work of aaajiao.
It renders GLB textured meshes + PLY point clouds and provides measurement, clipping, annotation, and rich-media workflows for documenting the intersection of labor, material production, and global trade.

## Stack

Vite 6 + React 19 + TypeScript strict + bun  
@react-three/fiber v9 + drei v9 + Three.js  
zustand (persist) + shadcn/ui + Tailwind v4

---

## Repository Map

```text
src/
├── __tests__/       # unit + browser integration tests (Vitest)
├── components/
│   ├── viewer/      # R3F Canvas + GLB/PLY renderers (see viewer/AGENTS.md)
│   ├── tools/       # 3D interaction tools (see tools/AGENTS.md)
│   ├── sidebar/     # FileManager/PublishButton split modules, PropertyPanel, AnnotationManager
│   ├── toolbar/     # Toolbar, ToolButtons, ViewModeToggle, lazy-loaded auth/publish entry
│   ├── upload/      # DropZone + upload UI
│   └── ui/          # shadcn + app-specific UI (VimeoEmbed, StatusBar, etc.)
├── hooks/           # usePLYLoader, useFileUpload, useScreenshot
├── lib/             # shared helpers + API clients (modelApi, publishApi, utils)
├── storage/         # IndexedDB + Vercel Blob adapters for images/models
├── store/           # zustand viewerStore + extracted sceneCatalog/draftPersistence helpers + presetScenes
├── types/           # shared app types
├── utils/           # pure helpers: colorMapping, measurement, vimeo, raycasting, screenshot
└── workers/         # ply-parser.worker.ts (off-thread PLY parsing)

api/                 # Vercel Functions for auth/draft/media/models/publish/release/rollback
e2e/                 # Playwright smoke E2E tests only
public/              # static assets (source model files live in public/models)
scripts/             # maintenance scripts (cleanup-orphan-assets)
docs/                # planning and implementation notes
```

---

## Architecture & Data Flows

### 1) Rendering flow (3D core)

`SceneCanvas.tsx` is the entry point for all 3D runtime:
- mounts viewers (`GLBViewer`, `PointCloudViewer`)
- mounts tools (`MeasurementTool`, `ClippingPlaneController`, `AnnotationTool`, `AnnotationMarkers`, `AnnotationPanel`)
- owns `OrbitControls` and binds `enabled={cameraControlsEnabled}`

### 2) PLY flow (worker)

`usePLYLoader` → `workers/ply-parser.worker.ts` (transferable Float32Arrays).  
Never parse large PLY on main thread.

### 3) Annotation interaction flow (current model)

Store fields (in `viewerStore.ts`) drive behavior:
- `selectedAnnotationId`: focused annotation
- `openAnnotationPanelIds`: supports multiple opened floating panels
- `cameraControlsEnabled`: temporary orbit lock during media resize

Main interaction:
1. Marker/list click toggles panel open state (`openAnnotationPanel` / `closeAnnotationPanel`)
2. `AnnotationPanel.tsx` renders one floating panel per opened id
3. Panel layout is screen-space aware (`worldToScreen` + clamp + `screenToWorld`)
4. During camera motion, relayout is deferred; after settle, panel transitions with eased/randomized motion profile
5. Media resize handles disable camera controls while dragging

### 4) Rich media flow

- Images: local-first storage in IndexedDB (`localId`) during editing; upload to Blob happens during publish and then becomes remote URL (`url`)
- Video: `VimeoEmbed` uses Vimeo oEmbed to derive aspect ratio and renders inline player (no fake overlay)

### 5) Draft + release flow (current model)

- Auth session: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/session`
- Draft API: `GET/PUT /api/draft/:sceneId` with revision conflict control
- Publish API: `POST /api/publish/:sceneId` creates immutable release + updates live pointer
- Release management: `GET /api/publish/:sceneId` lists versions, `DELETE /api/publish/:sceneId` deletes one version
- Rollback API: `POST /api/rollback/:sceneId` moves live pointer and syncs draft baseline
- Store helpers: `src/store/draftPersistence.ts` contains local draft import/export and publish-payload helpers
- UI controls: `PublishButton` shows `saved/unsaved`, release dropdown, rollback click, and delete with confirmation; `Toolbar.tsx` lazy-loads `LoginDialog` and `PublishButton`

### 6) Model registry + cloud scene flow

- Model registry API: `GET/POST /api/models` stores cloud scene metadata in Blob (`models/index.json`)
- Model upload API: `POST /api/models/upload` issues client upload tokens with strict path/metadata checks
- Frontend API client: `src/lib/modelApi.ts` powers list/create/replace model operations
- Store integration: `src/store/sceneCatalog.ts` contains cloud/discovered scene catalog resolution helpers; `viewerStore.loadCloudScenes` and `syncPresetScenesToCloud` hydrate cloud scenes and keep active scene valid
- Stale model/image cleanup: handled in registry replacement code and `scripts/cleanup-orphan-assets.ts`

### 7) Official scene workflow (Maintainer)

Official scenes are repository-first. Maintainers add model assets to the codebase, then sync them to the cloud catalog.

1. **Discovery**: `GET /api/models/discover` (dev-only) scans `public/models/` for GLB/PLY pairs.
2. **Refresh**: `FileManager` uses `loadDiscoveredScenes` to find new local models.
3. **Sync**: `syncDiscoveredScene` uploads local assets to Vercel Blob and registers them in the cloud catalog.
4. **Authoring**: Once synced, the scene is available for annotation and publishing like any other cloud scene.
5. **Separation**: Asset sync (model files) and scene-content publish (annotations) are separate workflows.

---

## Where To Look

| Task | Primary Files |
|------|---------------|
| Add/update 3D tool | `src/components/tools/*` + registration in `src/components/viewer/SceneCanvas.tsx` |
| Change annotation panel behavior | `src/components/tools/AnnotationPanel.tsx` |
| Change marker click/open rules | `src/components/tools/AnnotationMarkers.tsx`, `src/components/sidebar/AnnotationManager.tsx` |
| Change annotation state model | `src/store/viewerStore.ts` + `src/types/index.ts` |
| Change PLY parsing/perf | `src/workers/ply-parser.worker.ts`, `src/hooks/usePLYLoader.ts` |
| Change clipping behavior | `src/components/tools/ClippingPlane.tsx` |
| Change screenshot behavior | `src/components/viewer/ScreenshotButton.tsx`, `src/hooks/useScreenshot.ts` |
| Change Vimeo URL handling | `src/utils/vimeo.ts`, `src/components/ui/VimeoEmbed.tsx` |
| Change cloud model loading/sync behavior | `src/store/sceneCatalog.ts`, `src/store/viewerStore.ts`, `src/lib/modelApi.ts` |
| Change model registry or upload token logic | `api/models/index.ts`, `api/models/upload.ts` |
| Change draft import/export or publish payload shaping | `src/store/draftPersistence.ts`, `src/store/viewerStore.ts`, `src/lib/publishApi.ts` |
| Change publish workflow APIs | `api/*`, `api/_lib/*`, `src/lib/publishApi.ts` |
| Change publish UI/labels/version menu | `src/components/sidebar/PublishButton.tsx`, `src/components/sidebar/PublishActionControls.tsx`, `src/components/sidebar/PublishVersionMenu.tsx`, `src/components/sidebar/LoginDialog.tsx` |
| Change scene list/sidebar sync UI | `src/components/sidebar/FileManager.tsx`, `src/components/sidebar/FileManagerHeader.tsx`, `src/components/sidebar/FileManagerSceneList.tsx`, `src/components/sidebar/fileManagerSceneEntries.ts` |
| Change lazy-loaded editor/auth UI boundaries | `src/components/toolbar/Toolbar.tsx`, `src/components/sidebar/Sidebar.tsx` |
| Change orphaned blob cleanup behavior | `api/_lib/sceneAssetCleanup.ts`, `scripts/cleanup-orphan-assets.ts` |
| Add/adjust browser integration test | `src/__tests__/browser/*.test.tsx`, especially `viewer.test.tsx`, `publishButton.test.tsx`, `toolbarLazyUi.test.tsx`, `sidebarLazyUi.test.tsx` |
| Add/adjust E2E smoke test | `e2e/smoke.test.ts` |

---

## Critical Invariants

### Coordinate system

PLY is Z-up, GLB is Y-up.

In `PointCloudViewer.tsx`:
```tsx
<group rotation={[-Math.PI / 2, 0, 0]}>
```

Do not apply this transform to GLB path.

### Canvas screenshot contract

`preserveDrawingBuffer: true` must stay enabled in Canvas config, otherwise screenshot capture breaks.

### Clipping consistency

Tools and clipping constants must stay aligned (`CLIP_SCENE_HALF` vs clipping plane world mapping).

### Cloud model URL hygiene

Cloud scenes are filtered by `hasValidSceneAssetUrls` before runtime use.
Keep model `glbUrl`/`plyUrl` as valid HTTP(S) URLs with non-placeholder hosts, or scenes will be excluded.

---

## Test Strategy (Unified)

Use a 3-layer test model and keep responsibilities strict.

Before adding or debugging tests, read `docs/TESTING.md` for command selection, the repo's two Playwright paths, and local hang/stall troubleshooting.

### Layer boundaries

1. **Unit (Vitest + jsdom)**
   - Pure functions, store transitions, parser/math logic
   - No full UI journey expectations

2. **Browser integration (Vitest browser project)**
   - Component interactions and store integration through UI
   - Primary place for annotation/sidebar/tool interaction behavior
   - Includes lazy-loaded toolbar/sidebar resolution checks and publish UI interaction coverage

3. **E2E (Playwright)**
   - Keep minimal and high-value only
   - Smoke-level workflows and app shell integrity
   - Avoid duplicating component-level scenarios already covered by browser Vitest

### Commands

```bash
bun run lint                # eslint checks
bun run test                # alias to test:vitest
bun run test:vitest         # unit + browser projects
bun run test:vitest:unit    # unit only
bun run test:vitest:browser # browser integration only
bun run test:e2e            # Playwright smoke only (e2e/smoke.test.ts)
bun run test:e2e:ui         # Playwright UI mode
bun run test:all            # vitest + smoke e2e
bun run cleanup:orphans     # delete unreferenced Blob assets (apply)
bun run cleanup:orphans:dry # preview unreferenced Blob assets (dry run)
bun run build               # typecheck + production build

# Local API runtime (recommended)
bun run dev:api

# Vercel Functions runtime (alternative)
vercel dev
```

### E2E policy (important)

- E2E should cover only what must be validated in full app runtime.
- Prefer browser Vitest for annotation/store/UI behavior validation.
- Do not grow E2E suite for state transitions or component internals.
- If a UI behavior can be proven in `bun run test:vitest:browser`, do that before reaching for Playwright CLI.
- Treat `bun run test:e2e:ui` as a debugging tool, not the default test path; it stays interactive until stopped.

---

## Conventions

- Path alias: `@/` → `src/`
- Tailwind v4 via `@tailwindcss/vite` (no tailwind.config.js)
- shadcn components in `src/components/ui/`
- Single zustand store (`viewerStore.ts`), serializable state only
- `data-testid` required on interactive UI used by tests
- Worker syntax: `new Worker(new URL('...', import.meta.url), { type: 'module' })`
- Cloud model IDs are normalized to lowercase slug form (prefixed `cloud-`) in `/api/models`

---

## Anti-Patterns (Do Not Introduce)

- `as any`, `@ts-ignore`, `@ts-expect-error`
- Three.js objects in persisted zustand state
- Main-thread parsing for large PLY files
- Expanding E2E to cover scenarios already in browser Vitest
- Removing `preserveDrawingBuffer` from Canvas
- Breaking clipping material-side restore behavior
- Overwriting dirty local draft state by auto-loading remote draft on refresh
- Uploading local images immediately during annotation editing (must upload on publish path)
- Bypassing `/api/models/upload` validation path for cloud model uploads

---

## Environment Notes (Shared macOS + Linux workspace)

- Linux side (agent runtime) owns dependency install and command execution.
- macOS side accesses dev server through forwarded localhost port.
- Standard local URL: `http://localhost:5173`.
- Publish workflow env vars: `POLYCAM_BLOB_READ_WRITE_TOKEN`, `ADMIN_PASSWORD`, `AUTH_SECRET` (`BLOB_READ_WRITE_TOKEN` remains a legacy fallback).
