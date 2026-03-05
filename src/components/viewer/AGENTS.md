# viewer/ — R3F Canvas + 3D Renderers

Main 3D rendering layer. Everything here runs inside `<Canvas>` (R3F context required).

## Files

| File | Role |
|------|------|
| `SceneCanvas.tsx` | Top-level Canvas: lighting, controls, tools, loading overlay. **Entry point for all 3D.** |
| `GLBViewer.tsx` | Loads GLB via `useGLTF`, renders `<primitive>`. Stores `_originalSide` on materials for clipping restore. Disposes geometry on unmount. |
| `PointCloudViewer.tsx` | Loads PLY via `usePLYLoader` (WebWorker), renders `<points>`. Applies coordinate transform. Saves `originalColorsRef` for color mapping restore. |
| `ScreenshotButton.tsx` | Null-render component: bridges `useScreenshot` (needs useThree) to `window.__takeScreenshot` for Toolbar access. |

## Coordinate Transform (CRITICAL)

PLY = Z-up. GLB = Y-up. Transform on PLY group:

```tsx
<group rotation={[-Math.PI / 2, 0, 0]}>
```

`PLY(x, y, z)` → `Scene(x, z, -y)`. Do NOT apply this to GLB.

## Canvas Config (CRITICAL)

```tsx
gl={{ preserveDrawingBuffer: true }}  // Screenshot depends on this — cannot be changed after creation
```

## Inside vs Outside Canvas

| Inside Canvas (R3F context) | Outside Canvas (DOM) |
|------------------------------|----------------------|
| GLBViewer, PointCloudViewer | LoadingOverlay |
| MeasurementTool, ClippingPlane, AnnotationTool | Toolbar, Sidebar |
| OrbitControls, GizmoHelper, Stats | DropZone, ErrorBoundary |
| ScreenshotCapture, CameraController | StatusBar |

## Adding a New Viewer

1. Create component accepting `url` prop
2. Build geometry from loaded data (useMemo, dispose on unmount)
3. Add to `SceneCanvas.tsx` inside `<Suspense>`, gated by `viewMode`
4. If non-Y-up coordinate system, wrap in `<group rotation={...}>`
