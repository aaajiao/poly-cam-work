# Polycam 3D Scan Viewer

Web-based visualization tool for Polycam LiDAR scan exports. Renders GLB textured meshes and PLY colored point clouds with measurement, clipping, annotation, and color mapping tools.

## Stack

Vite 6 + React 19 + TypeScript strict | @react-three/fiber v9 + drei v9 + Three.js | zustand (persist) | shadcn/ui + Tailwind v4 | bun

## Structure

```
src/
├── components/
│   ├── viewer/    # R3F Canvas + GLB/PLY renderers (see viewer/AGENTS.md)
│   ├── tools/     # 3D interactive tools: measure, clip, annotate (see tools/AGENTS.md)
│   ├── sidebar/   # FileManager, PropertyPanel, ClipControls, ColorMapControls
│   ├── toolbar/   # Toolbar, ToolButtons, ViewModeToggle
│   ├── upload/    # DropZone (drag-and-drop .glb/.ply)
│   └── ui/        # shadcn components + ErrorBoundary, LoadingOverlay, StatusBar
├── store/         # zustand: viewerStore (single store), presetScenes config
├── hooks/         # usePLYLoader (Worker bridge), useFileUpload, useScreenshot
├── workers/       # ply-parser.worker.ts (binary PLY → Float32Array, off-thread)
├── types/         # All shared types: ScanScene, ViewMode, ToolMode, Measurement, etc.
├── utils/         # Pure functions: colorMapping, measurement, screenshot
└── lib/           # shadcn cn() utility
e2e/               # Playwright E2E tests (chromium only)
public/models/     # Scan data files (gitignored, ~272MB)
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Add new 3D tool | `src/components/tools/` + register in `SceneCanvas.tsx` | Follow MeasurementTool pattern |
| Change view modes | `src/types/index.ts` ViewMode + `viewerStore.ts` + `ViewModeToggle.tsx` | |
| Modify point cloud rendering | `src/components/viewer/PointCloudViewer.tsx` | Coord transform here |
| Change PLY parsing | `src/workers/ply-parser.worker.ts` + `src/hooks/usePLYLoader.ts` | Worker ↔ hook protocol |
| Add sidebar controls | `src/components/sidebar/PropertyPanel.tsx` | Import + render new panel |
| Add keyboard shortcut | `src/components/toolbar/Toolbar.tsx` useEffect keydown handler | |
| Modify store state | `src/types/index.ts` + `src/store/viewerStore.ts` | Types first, then store |
| Add unit test | `src/__tests__/` | 65 tests, vitest + jsdom |
| Add E2E test | `e2e/` | 21 tests, playwright, use `data-testid` |

## CRITICAL: Coordinate Systems

PLY files are **Z-up** (Polycam convention). GLB files are **Y-up** (glTF standard).

Transform applied in `PointCloudViewer.tsx`: `<group rotation={[-Math.PI / 2, 0, 0]}>` converts PLY(x,y,z) → Scene(x,z,-y).

Height mapping in `colorMapping.ts` uses **Z** from raw PLY positions (index `[i*3+2]`), NOT scene Y.

## CRITICAL: File Pairing

Original Polycam export numbers do NOT match between GLB and PLY. Correct pairing (verified by bounding box alignment):

| Scan | GLB source | PLY source | Description |
|------|-----------|-----------|-------------|
| scan-a | was `01.glb` | was `00.ply` | Corridor ~5x3x13m |
| scan-b | was `00.glb` | was `01.ply` | Large room ~13x4x16m |
| scan-c | was `02.glb` | was `02.ply` | Multi-room ~14x4x19m |

Config: `src/store/presetScenes.ts`

## ANTI-PATTERNS

- **No `as any` / `@ts-ignore`** — strict mode enforced, `noUnusedLocals` + `noUnusedParameters`
- **No Three.js objects in zustand** — BufferGeometry/Mesh are not serializable; use refs
- **No main-thread PLY parsing** — always via WebWorker (`usePLYLoader` → `ply-parser.worker.ts`)
- **No `console.log` in prod** — `console.error` in error handlers only
- **Never forget `preserveDrawingBuffer: true`** on Canvas — screenshot depends on it
- **Never forget `material.side = DoubleSide`** when clipping active — GLB has no back faces

## CONVENTIONS

- **Path alias**: `@/` → `src/` (tsconfig paths + vite alias)
- **Tailwind v4**: via `@tailwindcss/vite` plugin, NO `tailwind.config.js` — config in CSS
- **shadcn/ui**: components in `src/components/ui/`, config in `components.json`
- **Store**: single zustand store, `persist` middleware for annotations/colorMap/pointSize/viewMode
- **Tests**: `data-testid` attributes on all interactive elements
- **Workers**: Vite module worker syntax: `new Worker(new URL('../workers/X.ts', import.meta.url), { type: 'module' })`
- **Transferable**: PLY parser returns Float32Arrays via transfer list (zero-copy)

## SHARED WORKSPACE (macOS + Linux)

This project directory is shared between macOS (user) and Linux (AI agent) via mount. Native binary packages (`@rollup/*`, `@esbuild/*`, `lightningcss-*`) are platform-specific.

**Setup**: Both platforms' native binaries coexist in `node_modules/`. After the user runs `bun install` on macOS, the agent runs:
```bash
bun add --no-save @rollup/rollup-linux-arm64-gnu lightningcss-linux-arm64-gnu
# (bun auto-resolves @esbuild/linux-arm64 as transitive dep)
```

**Rules**:
- **User (macOS)**: Owns `bun install`. Runs `bun run dev` for visual testing.
- **Agent (Linux)**: NEVER runs `bun install`. Only adds missing Linux native binaries via `bun add --no-save`. Runs `bun run build`, `bun run test`, `bun run test:e2e`.
- After user reinstalls (`rm -rf node_modules && bun install`), agent must re-add Linux native binaries before running build/test commands.

## COMMANDS

```bash
bun run dev        # Vite dev server → localhost:5173 (user runs on macOS)
bun run build      # Production build → dist/
bun run test       # Vitest: 65 unit tests
bun run test:e2e   # Playwright: 21 E2E tests (chromium)
```

## GOTCHAS

- `scan-b.ply` is 132MB / 5.1M points — always loads via WebWorker with progress
- Screenshot button uses `window.__takeScreenshot` bridge (useScreenshot needs useThree → must be inside Canvas)
- Sidebar toggle button needs `z-10 relative` on `<aside>` so canvas doesn't intercept clicks
- ClippingPlane stores `_originalSide` on THREE.Material instances to restore after disabling
- `setActiveScene` clears measurements (intentional — measurements are position-specific)
