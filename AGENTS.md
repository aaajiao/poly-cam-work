# poly.cam.work

Visualization platform and digital archive for the work of aaajiao.
GLB textured meshes + PLY point clouds with measurement, clipping, annotation, and rich-media workflows.

## Stack

Vite 6 + React 19 + TypeScript strict + bun
@react-three/fiber v9 + drei v9 + Three.js
zustand (persist) + shadcn/ui (new-york) + Tailwind v4

## Structure

```
poly.cam/
├── src/
│   ├── components/
│   │   ├── sidebar/       # Scene management, publish, annotations list (13 files)
│   │   ├── toolbar/       # Tool buttons, view mode, scan controls
│   │   ├── tools/         # 3D tools: measurement, clipping, annotations (R3F context)
│   │   ├── ui/            # shadcn + custom: ImageUpload, StatusBar, ErrorBoundary
│   │   ├── viewer/        # R3F canvas, GLB/PLY viewers, scan reveal (R3F context)
│   │   └── Layout.tsx
│   ├── store/             # zustand: viewerStore (1973L hub), scanStore, sceneCatalog, draftPersistence
│   ├── hooks/             # usePLYLoader, useScanEngine, useScanAnnotationTrigger
│   ├── lib/               # API clients: publishApi, modelApi, introApi
│   ├── storage/           # imageStorage (IndexedDB), vercelBlobImageStorage, vercelBlobModelStorage
│   ├── utils/             # raycasting, colorMapping, measurement, annotationPanelLayout
│   ├── shaders/           # scanRevealMesh, scanRevealPoints (GLSL via onBeforeCompile)
│   ├── workers/           # ply-parser.worker.ts (off-thread PLY parsing)
│   ├── types/             # All shared types (226L, serializable)
│   └── __tests__/         # Unit (26 files, jsdom) + browser/ (8 files, Playwright)
├── api/                   # Vercel Functions: auth, draft, publish, release, rollback, intro, models, media
│   └── _lib/              # Shared: auth, http, blobStore, modelRegistry, discovery (9 files)
├── e2e/                   # Playwright smoke (app boot only)
├── docs/                  # Architecture, testing, manifesto
├── public/models/         # Official scene GLB/PLY assets
└── scripts/               # cleanup-orphan-assets.ts
```

---

## Commands

```bash
bun run build               # tsc -b && vite build (typecheck + production build)
bun run lint                 # eslint .
bun run dev                  # vite dev server (localhost:5173)
bun run dev:api              # local API server (localhost:3000, no Vercel login needed)

# Tests — all layers
bun run test                 # alias → test:vitest (unit + browser)
bun run test:vitest          # unit + browser projects
bun run test:vitest:unit     # unit only (jsdom)
bun run test:vitest:browser  # browser integration only (Playwright-backed)
bun run test:e2e             # Playwright smoke (e2e/smoke.test.ts)
bun run test:all             # vitest + e2e

# Single test file
bun run test:vitest:unit -- src/__tests__/store.test.ts
bun run test:vitest:browser -- src/__tests__/browser/viewer.test.tsx

# Single test by name
bun run test:vitest:unit -- -t "initializes with preset scenes"
bun run test:vitest:browser -- -t "view mode toggle"

# Watch mode
bun run test:watch                             # all projects
bun run test:watch -- --project unit           # unit only
bun run test:watch -- --project browser        # browser only
```

### Test layer selection

| Changed | Run |
|---------|-----|
| Pure helpers, math, store logic | `test:vitest:unit` |
| Sidebar, toolbar, annotation, publish UI | `test:vitest:browser` |
| App shell boot, critical runtime smoke | `test:e2e` |

Prefer browser Vitest over Playwright E2E for component behavior. See `docs/TESTING.md` for debugging tips.

---

## Code Style

### Formatting

- **No Prettier**. ESLint handles TS/TSX linting. Biome handles CSS parsing (tailwind directives only).
- Single quotes, no semicolons (dominant pattern in codebase).
- 2-space indentation in most files.
- Unused vars: prefix with `_` (eslint `argsIgnorePattern: ^_`).

### Imports

Order: external libs → `@/` aliases → relative (`./`, `../`). Blank line between groups.

```typescript
import { useCallback, useRef } from 'react'           // 1. External
import type * as THREE from 'three'                    // 1. External (type-only)

import { useViewerStore } from '@/store/viewerStore'   // 2. Internal @/ alias
import type { ScanScene } from '@/types'               // 2. Internal (type-only)

import { GLBViewer } from './GLBViewer'                // 3. Relative
```

Use `import type { ... }` for type-only imports. Path alias: `@/` → `src/`.

### Types & Interfaces

- TypeScript `strict: true` everywhere (`noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`).
- ESLint enforces `@typescript-eslint/no-explicit-any: 'error'` — never use `any`.
- Never use `as any`, `@ts-ignore`, or `@ts-expect-error`.
- Interfaces for data shapes. Type aliases for unions and string literals.
- Shared types live in `src/types/index.ts`. Keep them serializable.

```typescript
export interface ScanScene { id: SceneId; name: string; glbUrl: string }
export type ViewMode = 'mesh' | 'pointcloud' | 'both'
export type ToolMode = 'orbit' | 'measure' | 'annotate' | 'clip'
```

### Naming

| Kind | Convention | Example |
|------|-----------|---------|
| Components | PascalCase, named export | `export function GLBViewer()` |
| Hooks | `use` prefix, camelCase | `usePLYLoader`, `useActiveScene` |
| Utils/helpers | camelCase file + function | `calculateDistance`, `formatBytes` |
| Constants | UPPER_SNAKE_CASE | `PRESET_SCENES`, `PERSIST_KEY` |
| Types/Interfaces | PascalCase | `ScanScene`, `ClipPlaneState` |
| Test files | `*.test.ts` / `*.test.tsx` | `store.test.ts`, `viewer.test.tsx` |
| API routes | Vercel `fetch` web handler | `export default { fetch: handler }` |
| Test IDs | kebab-case `data-testid` | `data-testid="property-panel"` |

### Components

- Functional components only. Named exports (no default export except API handlers).
- `data-testid` required on interactive elements used by tests.
- shadcn components in `src/components/ui/`. Use `@/components/ui/button` etc.
- zustand: main store (`viewerStore.ts`) + scan store (`scanStore.ts`), selector pattern `(s) => s.field`.

### Error Handling

- API routes: use `api/_lib/http.ts` helpers — `badRequest()`, `unauthorized()`, `notFound()`, `conflict()`, `jsonResponse()`.
- Frontend fetch: channel through `requestJson<T>()` in `publishApi.ts` (handles credentials, JSON parse, error extraction).
- No empty catch blocks. Use `catch { ... }` (no variable) or `catch (_e) { ... }` for intentional swallow.

### Test Patterns

- Unit: `describe`/`it` from vitest, jsdom environment.
- Browser: `describe`/`test` from vitest, `render` from `vitest-browser-react`, `await expect.element(...)` for async assertions.
- Store reset in `beforeEach`: `localStorage.removeItem('polycam-viewer-state')` + `useViewerStore.setState({...})`.
- Mocks at file scope with `vi.mock(...)`, reseed in `beforeEach` after `vi.restoreAllMocks()`.

---

## Architecture (Key Flows)

- **SceneCanvas.tsx**: entry point for all 3D — mounts viewers, tools, OrbitControls.
- **PLY parsing**: always off-thread via `usePLYLoader` → `workers/ply-parser.worker.ts`.
- **Annotations**: store-driven (`selectedAnnotationId`, `openAnnotationPanelIds`). Panels are screen-space aware.
- **Draft flow**: local-first (IndexedDB images, browser storage). Upload to Vercel Blob only on publish.
- **API routes**: Vercel Functions in `api/` using `fetch` web handler format (`export default { fetch: handler }`). Auth via session cookie. Draft has revision conflict control.
- **Presentation mode**: defaults ON for unauthenticated visitors. Login → auto OFF, logout → auto ON, session refresh → OFF if authenticated. `cloudScenesLoaded` gates viewer rendering in production until API responds.
- **Scan reveal system**: non-invasive overlay that replaces viewers with shader-enhanced variants during scan mode. Driven by independent `scanStore`. See `docs/scan-reveal-architecture.md` for full design.

---

## Where To Look

| Task | Primary Files |
|------|---------------|
| 3D tool | `src/components/tools/*`, register in `src/components/viewer/SceneCanvas.tsx` |
| Annotation behavior | `AnnotationPanel.tsx`, `AnnotationMarkers.tsx`, `AnnotationManager.tsx` |
| Store / state | `src/store/viewerStore.ts`, `src/types/index.ts` |
| PLY parsing | `src/workers/ply-parser.worker.ts`, `src/hooks/usePLYLoader.ts` |
| Publish workflow | `api/publish/`, `api/_lib/*`, `src/lib/publishApi.ts` |
| Publish UI | `src/components/sidebar/PublishButton.tsx`, `PublishActionControls.tsx`, `PublishVersionMenu.tsx` |
| Scene catalog | `src/store/sceneCatalog.ts`, `src/lib/modelApi.ts` |
| Cloud model upload | `api/models/upload.ts`, `api/models/index.ts` |
| Scan reveal system | `src/store/scanStore.ts`, `src/hooks/useScan*.ts`, `src/shaders/*`, `src/components/viewer/ScanReveal*.tsx` |
| Browser tests | `src/__tests__/browser/*.test.tsx` |
| Unit tests | `src/__tests__/*.test.ts` |

---

## Critical Invariants

- **Coordinate system**: PLY is Z-up, GLB is Y-up. PLY gets `rotation={[-Math.PI / 2, 0, 0]}`. Never apply to GLB.
- **Clipping**: `CLIP_SCENE_HALF` and clipping plane world mapping must stay aligned.
- **Cloud URLs**: filtered by `hasValidSceneAssetUrls` — keep `glbUrl`/`plyUrl` as valid HTTPS.
- **Worker syntax**: `new Worker(new URL('...', import.meta.url), { type: 'module' })`.
- **API imports**: relative imports in `api/` must use `.js` extensions (`from '../_lib/auth.js'`). Vercel's Node.js ESM requires explicit extensions; bun resolves without them locally but production breaks.

## Anti-Patterns (Do Not Introduce)

- `as any`, `@ts-ignore`, `@ts-expect-error`
- Three.js objects in persisted zustand state
- Main-thread parsing for large PLY files
- Expanding E2E to cover scenarios browser Vitest can prove
- Auto-loading remote draft over dirty local state
- Uploading images during annotation editing (must upload on publish path)
- Bypassing `/api/models/upload` validation for cloud uploads

## Environment

- **bun** as package manager and script runner
- Path alias: `@/` → `src/`
- Tailwind v4 via `@tailwindcss/vite` (no `tailwind.config.js`)
- Env vars: `POLYCAM_BLOB_READ_WRITE_TOKEN`, `ADMIN_PASSWORD`, `AUTH_SECRET`
- Dev server: `localhost:5173` (frontend), `localhost:3000` (API proxy target)
