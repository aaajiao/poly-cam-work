# store/ — Zustand State Management

2 stores + 3 utility modules. No React Context for app state.

## Stores

| Store | File | Lines | Persist | Purpose |
|-------|------|-------|---------|---------|
| `useViewerStore` | `viewerStore.ts` | 1973 | ✓ localStorage | Central hub: scenes, annotations, drafts, publish, auth, UI |
| `useScanStore` | `scanStore.ts` | 154 | — | Scan reveal animation: progress, phase, triggers |

## viewerStore State Domains

| Domain | Key Fields |
|--------|-----------|
| Scene catalog | `scenes`, `publishedScenes`, `discoveredScenes`, `uploadedScenes`, `activeSceneId` |
| Viewer UI | `viewMode`, `toolMode`, `sidebarOpen`, `presentationMode`, `cameraControlsEnabled` |
| Annotations | `annotations[]` (all scenes), `selectedAnnotationId`, `openAnnotationPanelIds[]`, `hoveredAnnotationId` |
| Clipping/Render | `clipPlane`, `colorMapMode`, `pointSize` |
| Draft workflow | `draftStatus`, `draftRevisionByScene`, `draftDirtyByScene`, `publishedVersionByScene` |
| Auth | `isAuthenticated`, `presentationMode` (linked: login→OFF, logout→ON) |
| Intro presets | `introPreset`, `introPresetStatus`, `runtimeCamera` |
| Scene sync | `cloudScenesLoaded`, `officialSceneSyncOverridesByScene` |

## Persist Configuration

**Key**: `"polycam-viewer-state"` | **Version**: 9 (5 migration paths)

**Persisted** (13 fields): `discoveredScenes`, `officialSceneSyncOverridesByScene`, `activeSceneId`, `annotations`, `introPreset`, `draftRevisionByScene`, `draftRevisionSourceByScene`, `draftDirtyByScene`, `sceneMutationVersion`, `colorMapMode`, `pointSize`, `viewMode`, `annotationsVisible`

**NOT persisted**: `scenes`, `publishedScenes`, `uploadedScenes`, `measurements`, `toolMode`, `sidebarOpen`, `isAuthenticated`, `draftStatus`, loading state, `runtimeCamera`

## Cross-Store Dependencies

`viewerStore` → reads `scanStore` via `getState()` in `captureIntroPreset()`, `continueIntroScan()`. One-way only — scanStore never imports viewerStore.

## Utility Modules (Not Stores)

| File | Purpose |
|------|---------|
| `sceneCatalog.ts` | 9 pure functions: scene deduplication, sync status derivation, catalog resolution |
| `draftPersistence.ts` | 12 pure functions: image handling, annotation filtering, draft serialization |
| `presetScenes.ts` | `PRESET_SCENES` constant (bootstrap scene definitions) |

## Selector Pattern

```typescript
// Component consumption — always use selector
useViewerStore((s) => s.viewMode)

// Custom selectors (exported hooks)
export const useActiveScene = () => useViewerStore(resolveActiveSceneFromCatalog)

// Action invocation outside React
useViewerStore.getState().setActiveScene(id)
```

## Key Invariants

- **Annotations are global**: `annotations[]` contains all scenes; filter by `sceneId`
- **Measurements are ephemeral**: Cleared on `setActiveScene()`
- **Presentation mode gates tools**: Only `"orbit"` allowed when `presentationMode = true`
- **Draft dirty tracking**: `draftDirtyByScene[sceneId]` — annotation mutations auto-set dirty
- **Conflict retry**: `saveDraft()` retries up to 3 times on 409
- **No Three.js objects**: State must be serializable. Three.js objects are ephemeral refs.

## Test Reset Pattern

```typescript
beforeEach(() => {
  localStorage.removeItem('polycam-viewer-state')
  useViewerStore.setState({ activeSceneId: 'scan-a', annotations: [], ... })
  useScanStore.setState({ isScanning: false, ... })
})
```
