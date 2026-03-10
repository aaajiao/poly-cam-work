# viewer/ — R3F Canvas + 3D Renderers

Main 3D rendering layer. Everything here runs inside `<Canvas>` (R3F context required).

## Files

| File | Role |
|------|------|
| `SceneCanvas.tsx` | Top-level Canvas (453L): lighting, controls, tools, loading overlay. **Entry point for all 3D.** |
| `GLBViewer.tsx` | Loads GLB via `useGLTF`, renders `<primitive>`. Stores `_originalSide` on materials for clipping restore. Disposes geometry on unmount. |
| `PointCloudViewer.tsx` | Loads PLY via `usePLYLoader` (WebWorker), renders `<points>`. Applies coordinate transform. Saves `originalColorsRef` for color mapping restore. |
| `PresentationGizmo.tsx` | Viewport orientation gizmo with opacity fade in presentation mode. Uses `useFrame` + `THREE.MathUtils.damp`. |
| `presentationGizmoState.ts` | Shared mutable state for gizmo opacity (avoids re-renders). |
| `ScanRevealGLBViewer.tsx` | **Scan mode only.** Wraps GLB loading + injects scan-wave shader via `onBeforeCompile`. Replaces `GLBViewer` when scanning. |
| `ScanRevealPointCloudViewer.tsx` | **Scan mode only.** Wraps PLY loading + custom `ShaderMaterial` for point activation. Replaces `PointCloudViewer` when scanning. |
| `ScanOrchestrator.tsx` | **Scan mode only.** Null-render component that mounts scan hooks (engine + annotation trigger + camera director). |

## Coordinate Transform (CRITICAL)

PLY = Z-up. GLB = Y-up. Transform on PLY group:

```tsx
<group rotation={[-Math.PI / 2, 0, 0]}>
```

`PLY(x, y, z)` → `Scene(x, z, -y)`. Do NOT apply this to GLB.

Both scan reveal viewers inherit this convention. Scan distance calculations use world-space coordinates (post-transform), so GLB and PLY are already in the same Y-up space.

## Related Hooks (in `src/hooks/`)

| Hook | Purpose |
|------|---------|
| `usePLYLoader` | Off-thread PLY parsing via WebWorker. Returns `{ positions, colors, count, bounds }`. |
| `useScanEngine` | Drives scan animation: progress, radius, phase transitions. Feeds `scanStore`. |
| `useScanAnnotationTrigger` | Triggers annotation reveals based on scan radius proximity. |

## Inside vs Outside Canvas

| Inside Canvas (R3F context) | Outside Canvas (DOM) |
|------------------------------|----------------------|
| GLBViewer, PointCloudViewer | LoadingOverlay |
| ScanRevealGLBViewer, ScanRevealPointCloudViewer | Toolbar, Sidebar |
| MeasurementTool, ClippingPlane, AnnotationTool | DropZone, ErrorBoundary |
| OrbitControls, GizmoHelper, Stats | StatusBar |
| ScanOrchestrator, CameraController | |

## Scan Reveal Integration Pattern

SceneCanvas conditionally swaps normal viewers for scan-enhanced viewers based on `scanStore.isScanning`:

```tsx
{isScanning
  ? <ScanRevealGLBViewer url={...} />
  : <GLBViewer url={...} />}

{isScanning
  ? <ScanRevealPointCloudViewer url={...} />
  : <PointCloudViewer url={...} />}

{isScanning && <ScanOrchestrator />}
```

**Non-invasive principle**: GLBViewer and PointCloudViewer are never modified. Scan reveal components are parallel implementations that share the same data sources (useGLTF, usePLYLoader) but apply custom materials. When scan mode is off, the rendering path is identical to the original.

Shaders live in `src/shaders/`: `scanRevealMesh.ts` (onBeforeCompile injection) and `scanRevealPoints.ts` (custom ShaderMaterial). See `docs/scan-reveal-architecture.md` for full system design.

## Adding a New Viewer

1. Create component accepting `url` prop
2. Build geometry from loaded data (useMemo, dispose on unmount)
3. Add to `SceneCanvas.tsx` inside `<Suspense>`, gated by `viewMode`
4. If non-Y-up coordinate system, wrap in `<group rotation={...}>`
