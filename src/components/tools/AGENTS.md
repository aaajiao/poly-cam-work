# tools/ — 3D Interactive Tools

All tools render inside `<Canvas>` in SceneCanvas.tsx. Activated by `toolMode` from zustand store.

## Files

| File | Role | Activation |
|------|------|------------|
| `MeasurementTool.tsx` | Click two points → distance line + label | `toolMode === 'measure'` |
| `ClippingPlane.tsx` | Cross-section plane with DoubleSide fix | `clipPlane.enabled` (always available) |
| `AnnotationTool.tsx` | Click surface → placement dialog → persistent annotation | `toolMode === 'annotate'` |
| `AnnotationMarkers.tsx` | Container: InstancedMesh (far LOD) + Html markers (close LOD) | Always when annotations exist |
| `AnnotationMarker.tsx` | Individual close-LOD marker (drei Html, click to select) | Managed by AnnotationMarkers |
| `AnnotationPanel.tsx` | 3D floating content panel (1069L, drei Html, rich content) | `openAnnotationPanelIds` |
| `AnnotationPanelContent.tsx` | Panel content editor: title, description, images, video, links | Nested in AnnotationPanel |
| `AnnotationLabel.tsx` | Individual label component (drei `<Html>`) | Per annotation |

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
5. Dynamic threshold for Points via shared utility: `useFrame(() => updatePointsThreshold(raycasterRef.current, camera))`

Shared utilities in `src/utils/raycasting.ts`:
- `updatePointsThreshold(raycaster, camera)` — sets `raycaster.params.Points.threshold = 0.01 + dist * 0.005` each frame
- `raycastScene(raycaster, scene, camera)` — calls threshold update + traverses scene + returns intersections

## Annotation Architecture

Annotations are **store-driven** with screen-space awareness:
- `annotations[]` in viewerStore (global, filtered by `sceneId`)
- `openAnnotationPanelIds[]` tracks which panels are visible
- `AnnotationPanel` uses `annotationPanelLayout.ts` for collision-free positioning
- Images stored locally (IndexedDB) during editing; uploaded to Vercel Blob only on publish
- Rich content: title, description, images[], videoUrl (Vimeo), links[]

## ClippingPlane: DoubleSide Fix

GLB materials are `side: FrontSide`. Clipping exposes hollow interior.

When enabled: `material.side = DoubleSide` + store original in `material._originalSide`
When disabled: restore `material.side = material._originalSide`

Also applies `material.clippingPlanes = [plane]` to both Mesh AND Points materials.

## Adding a New Tool

1. Create component in this directory
2. Gate rendering on `toolMode` or a dedicated store flag
3. Use `raycastScene(raycaster, scene, camera)` from `src/utils/raycasting.ts` for click-to-3D
4. Register in `SceneCanvas.tsx` after existing tools
5. Add keyboard shortcut in `Toolbar.tsx` keydown handler
6. Add button in `ToolButtons.tsx` TOOLS array
