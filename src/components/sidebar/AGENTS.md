# sidebar/ — Scene Management & Publishing UI

13 files. All outside R3F canvas (DOM context). Driven by `useViewerStore`.

## Files

| File | Role |
|------|------|
| `Sidebar.tsx` | Container: conditionally renders sections based on auth + scene state |
| `FileManager.tsx` | Scene catalog: lists all scene sources, refresh, sync actions |
| `FileManagerHeader.tsx` | Catalog header with refresh/discover buttons |
| `FileManagerSceneList.tsx` | Renders scene entries with status badges |
| `fileManagerSceneEntries.ts` | Pure logic: merges scene sources, derives display state |
| `AnnotationManager.tsx` | Annotation list for active scene: select, delete, toggle visibility |
| `PropertyPanel.tsx` | Point size slider, color map controls |
| `ClipControls.tsx` | Clipping plane: axis, position slider, flip, enable/disable |
| `ColorMapControls.tsx` | Color mapping mode selector (original/height/intensity) |
| `LoginDialog.tsx` | Password dialog → `viewerStore.login()` |
| `PublishButton.tsx` | Publish/save draft triggers, status display |
| `PublishActionControls.tsx` | Publish action buttons (save draft, publish, import/export) |
| `PublishVersionMenu.tsx` | Version list: rollback, delete, live indicator |

## Publish Workflow (UI Side)

```
LoginDialog → login()
  ↓
PublishButton → shows draft status (saved/unsaved/live)
  ├─ PublishActionControls → saveDraft() / publishDraft() / downloadDraft() / importDraft()
  └─ PublishVersionMenu → rollbackToVersion() / deletePublishedVersion()
```

## Scene Catalog Flow

```
FileManager
  ├─ FileManagerHeader → loadDiscoveredScenes() / loadCloudScenes()
  └─ FileManagerSceneList → scene entries with:
       ├─ Status badges: discovered / cloud / session / syncing
       ├─ Sync button → syncDiscoveredScene(sceneId)
       └─ Click → setActiveScene(id)
```

## Conventions

- All state via `useViewerStore((s) => s.field)` selector pattern
- Actions called via `useViewerStore.getState().action()`
- `data-testid` on all interactive elements (browser tests target these)
- No direct API calls — everything goes through store actions
