# tools/ — 3D Interactive Tools

All tools render inside `<Canvas>` in SceneCanvas.tsx. Activated by `toolMode` from zustand store.

## Files

| File | Tool Mode | Activation |
|------|-----------|------------|
| `MeasurementTool.tsx` | `measure` | Click two points → distance line + label |
| `ClippingPlane.tsx` | always (via `clipPlane.enabled`) | Sidebar slider controls position/axis |
| `AnnotationTool.tsx` | `annotate` | Click surface → input dialog → persistent label |
| `AnnotationLabel.tsx` | — | Individual label component (drei `<Html>`) |

## Tool Registration Pattern

Every tool is a null-or-render component inside SceneCanvas:

```tsx
<MeasurementTool />       // reads toolMode === 'measure'
<ClippingPlaneController /> // reads clipPlane.enabled
<AnnotationTool />         // reads toolMode === 'annotate'
```

## Raycaster Pattern

All tools that need click-to-3D use the same pattern:

1. `useThree()` → get `camera`, `scene`, `gl`
2. `gl.domElement.addEventListener('click', handler)`
3. `raycaster.setFromCamera(mouse, camera)`
4. `raycaster.intersectObjects(targets)` — traverse scene for Mesh + Points
5. Dynamic threshold for Points: `raycaster.params.Points.threshold = 0.01 + dist * 0.005`

## ClippingPlane: DoubleSide Fix

GLB materials are `side: FrontSide`. Clipping exposes hollow interior.

When enabled: `material.side = DoubleSide` + store original in `material._originalSide`
When disabled: restore `material.side = material._originalSide`

Also applies `material.clippingPlanes = [plane]` to both Mesh AND Points materials.

## Adding a New Tool

1. Create component in this directory
2. Gate rendering on `toolMode` or a dedicated store flag
3. Use Raycaster pattern above for click-to-3D
4. Register in `SceneCanvas.tsx` after existing tools
5. Add keyboard shortcut in `Toolbar.tsx` keydown handler
6. Add button in `ToolButtons.tsx` TOOLS array
