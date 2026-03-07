# Polycam 3D Scan Viewer

Web-based visualization tool for Polycam LiDAR exports.
It renders GLB textured meshes + PLY point clouds and provides measurement, clipping, annotation, and rich-media workflows.

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
│   ├── sidebar/     # FileManager, PropertyPanel, AnnotationManager, etc.
│   ├── toolbar/     # Toolbar, ToolButtons, ViewModeToggle
│   ├── upload/      # DropZone + upload UI
│   └── ui/          # shadcn + app-specific UI (VimeoEmbed, StatusBar, etc.)
├── hooks/           # usePLYLoader, useFileUpload, useScreenshot
├── lib/             # shared cn() helper
├── storage/         # IndexedDB-backed image storage abstraction
├── store/           # zustand viewerStore + presetScenes
├── types/           # shared app types
├── utils/           # pure helpers: colorMapping, measurement, vimeo, raycasting, screenshot
└── workers/         # ply-parser.worker.ts (off-thread PLY parsing)

e2e/                 # Playwright smoke E2E tests only
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

- Images: thumbnails from IndexedDB (`imageStorage.getThumbnail`), single-image ratio derived from actual image size
- Video: `VimeoEmbed` uses Vimeo oEmbed to derive aspect ratio and renders inline player (no fake overlay)

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
| Add/adjust browser integration test | `src/__tests__/browser/*.test.tsx` |
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

---

## Test Strategy (Unified)

Use a 3-layer test model and keep responsibilities strict.

### Layer boundaries

1. **Unit (Vitest + jsdom)**
   - Pure functions, store transitions, parser/math logic
   - No full UI journey expectations

2. **Browser integration (Vitest browser project)**
   - Component interactions and store integration through UI
   - Primary place for annotation/sidebar/tool interaction behavior

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
bun run build               # typecheck + production build
```

### E2E policy (important)

- E2E should cover only what must be validated in full app runtime.
- Prefer browser Vitest for annotation/store/UI behavior validation.
- Do not grow E2E suite for state transitions or component internals.

---

## Conventions

- Path alias: `@/` → `src/`
- Tailwind v4 via `@tailwindcss/vite` (no tailwind.config.js)
- shadcn components in `src/components/ui/`
- Single zustand store (`viewerStore.ts`), serializable state only
- `data-testid` required on interactive UI used by tests
- Worker syntax: `new Worker(new URL('...', import.meta.url), { type: 'module' })`

---

## Anti-Patterns (Do Not Introduce)

- `as any`, `@ts-ignore`, `@ts-expect-error`
- Three.js objects in persisted zustand state
- Main-thread parsing for large PLY files
- Expanding E2E to cover scenarios already in browser Vitest
- Removing `preserveDrawingBuffer` from Canvas
- Breaking clipping material-side restore behavior

---

## Environment Notes (Shared macOS + Linux workspace)

- Linux side (agent runtime) owns dependency install and command execution.
- macOS side accesses dev server through forwarded localhost port.
- Standard local URL: `http://localhost:5173`.
