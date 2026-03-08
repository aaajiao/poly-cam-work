import { useState } from 'react'
import { Layers, Cloud, CloudCheck, HardDrive, Loader2, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { useViewerStore } from '@/store/viewerStore'
import type { ScanScene } from '@/types'

type SceneSyncState = 'published' | 'bootstrap' | 'discovered' | 'session'

function SceneItem({ scene, syncState, isActive, onClick }: {
  scene: ScanScene
  syncState: SceneSyncState
  isActive: boolean
  onClick: () => void
}) {
  const officialStatus = scene.officialStatus?.syncStatus
  
  let syncLabel = 'Bootstrap'
  let SyncIcon = HardDrive
  let badgeClass = 'border-zinc-600 bg-zinc-800 text-zinc-400'

  if (syncState === 'published') {
    syncLabel = 'Cloud'
    SyncIcon = CloudCheck
    badgeClass = 'border-emerald-500/40 bg-emerald-600/20 text-emerald-300'
  } else if (syncState === 'session') {
    syncLabel = 'Session'
    SyncIcon = Layers
    badgeClass = 'border-purple-500/40 bg-purple-600/20 text-purple-300'
  } else if (syncState === 'discovered') {
    SyncIcon = Layers
    if (officialStatus === 'error') {
      syncLabel = 'Sync Error'
      badgeClass = 'border-red-500/40 bg-red-600/20 text-red-300'
    } else if (officialStatus === 'syncing') {
      syncLabel = 'Syncing'
      SyncIcon = Loader2
      badgeClass = 'border-blue-500/40 bg-blue-600/20 text-blue-300'
    } else {
      syncLabel = 'Discovered'
      badgeClass = 'border-sky-500/40 bg-sky-600/20 text-sky-300'
    }
  }

  return (
    <button
      data-testid={`scene-item-${scene.id}`}
      onClick={onClick}
      className={cn(
        'w-full text-left px-3 py-2 rounded-md text-sm transition-colors',
        'flex items-center gap-2',
        isActive
          ? 'bg-blue-600/20 text-blue-300 border border-blue-600/30'
          : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
      )}
    >
      <Layers size={14} className="flex-shrink-0" />
      <span className="flex-1 truncate">{scene.name}</span>
      <span
        data-testid={`scene-sync-state-${scene.id}`}
        className={cn(
          'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px]',
          badgeClass
        )}
      >
        <SyncIcon size={10} className={cn("flex-shrink-0", officialStatus === 'syncing' && "animate-spin")} />
        <span>{syncLabel}</span>
      </span>
      {isActive && (
        <Badge variant="secondary" className="text-xs px-1 py-0 h-4 bg-blue-600/30 text-blue-300 border-0">
          Active
        </Badge>
      )}
    </button>
  )
}

export function FileManager() {
  const scenes = useViewerStore((s) => s.scenes)
  const publishedScenes = useViewerStore((s) => s.publishedScenes)
  const discoveredScenes = useViewerStore((s) => s.discoveredScenes)
  const uploadedScenes = useViewerStore((s) => s.uploadedScenes)
  const activeSceneId = useViewerStore((s) => s.activeSceneId)
  const isAuthenticated = useViewerStore((s) => s.isAuthenticated)
  const setActiveScene = useViewerStore((s) => s.setActiveScene)
  const syncPresetScenesToCloud = useViewerStore((s) => s.syncPresetScenesToCloud)
  const syncDiscoveredScene = useViewerStore((s) => s.syncDiscoveredScene)
  const loadDiscoveredScenes = useViewerStore((s) => s.loadDiscoveredScenes)

  const [isSyncingPresets, setIsSyncingPresets] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [syncNotice, setSyncNotice] = useState<string | null>(null)

  const publishedScenesById = new Map(publishedScenes.map((scene) => [scene.id, scene]))
  const discoveredScenesById = new Map(discoveredScenes.map((scene) => [scene.id, scene]))
  const uploadedScenesById = new Map(uploadedScenes.map((scene) => [scene.id, scene]))
  const presetSceneIds = new Set(scenes.map((scene) => scene.id))

  const presetEntries = scenes.map((presetScene) => {
    const publishedScene = publishedScenesById.get(presetScene.id)
    const discoveredScene = discoveredScenesById.get(presetScene.id)
    const sessionScene = uploadedScenesById.get(presetScene.id)
    if (publishedScene) {
      return {
        scene: publishedScene,
        syncState: 'published' as const,
      }
    }

    if (discoveredScene) {
      return {
        scene: discoveredScene,
        syncState: 'discovered' as const,
      }
    }

    if (sessionScene) {
      return {
        scene: sessionScene,
        syncState: 'session' as const,
      }
    }

    return {
      scene: presetScene,
      syncState: 'bootstrap' as const,
    }
  })

  const publishedOnlyEntries = publishedScenes
    .filter((scene) => !presetSceneIds.has(scene.id))
    .map((scene) => ({
      scene,
      syncState: 'published' as const,
    }))

  const discoveredOnlyEntries = discoveredScenes
    .filter((scene) => !presetSceneIds.has(scene.id) && !publishedScenesById.has(scene.id))
    .map((scene) => ({
      scene,
      syncState: 'discovered' as const,
    }))

  const sessionOnlyEntries = uploadedScenes
    .filter((scene) => !presetSceneIds.has(scene.id) && !publishedScenesById.has(scene.id) && !discoveredScenesById.has(scene.id))
    .map((scene) => ({
      scene,
      syncState: 'session' as const,
    }))

  const sceneEntries = [...presetEntries, ...publishedOnlyEntries, ...discoveredOnlyEntries, ...sessionOnlyEntries]
  const unsyncedPresetCount = presetEntries.filter((entry) => entry.syncState !== 'published').length
  const canSyncPresets =
    isAuthenticated && unsyncedPresetCount > 0 && !isSyncingPresets

  const onSyncPresets = async () => {
    if (!isAuthenticated) {
      setSyncError('Login required to sync preset models.')
      return
    }

    if (unsyncedPresetCount === 0) {
      setSyncError(null)
      setSyncNotice('All preset scenes are already synced.')
      return
    }

    setSyncError(null)
    setSyncNotice(null)
    setIsSyncingPresets(true)

    try {
      const synced = await syncPresetScenesToCloud()
      setSyncNotice(`Synced ${synced.length} preset scenes to cloud.`)
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Failed to sync preset models.')
    } finally {
      setIsSyncingPresets(false)
    }
  }

  const onSyncDiscoveredScene = async (sceneId: string) => {
    try {
      await syncDiscoveredScene(sceneId)
    } catch {
      // Store already sets error sync status; suppress console noise for expected retryable errors
    }
  }

  const onRefreshDiscovered = async () => {
    setIsRefreshing(true)
    try {
      await loadDiscoveredScenes()
    } finally {
      setIsRefreshing(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="text-xs text-zinc-500 uppercase tracking-wider">Scenes</p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              data-testid="refresh-scenes-button"
              disabled={isRefreshing}
              onClick={() => {
                void onRefreshDiscovered()
              }}
              className={cn(
                'flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors',
                isRefreshing
                  ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
              )}
            >
              <RefreshCw size={12} className={cn(isRefreshing && "animate-spin")} />
              <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
            <button
              type="button"
              data-testid="sync-preset-models-button"
              disabled={!canSyncPresets}
              onClick={() => {
                void onSyncPresets()
              }}
              className={cn(
                'flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors',
                !canSyncPresets
                  ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                  : 'bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30'
              )}
            >
              {isSyncingPresets ? (
                <Loader2 size={12} className="animate-spin" />
              ) : unsyncedPresetCount > 0 ? (
                <Cloud size={12} />
              ) : (
                <CloudCheck size={12} />
              )}
              <span>
                {isSyncingPresets
                  ? 'Syncing...'
                  : unsyncedPresetCount > 0
                    ? `Sync ${unsyncedPresetCount}`
                    : 'Synced'}
              </span>
            </button>
          </div>
        </div>

        {syncError && (
          <p className="mb-2 px-1 text-[11px] text-red-400" data-testid="sync-error">
            {syncError}
          </p>
        )}

        {syncNotice && !syncError && (
          <p className="mb-2 px-1 text-[11px] text-emerald-400" data-testid="sync-notice">
            {syncNotice}
          </p>
        )}

        <div className="space-y-1" data-testid="scan-list">
          {sceneEntries.length === 0 ? (
            <p className="px-3 py-2 text-xs text-zinc-600">No scenes available.</p>
          ) : (
            sceneEntries.map((entry) => {
              const officialSyncStatus = entry.scene.officialStatus?.syncStatus
              const showSyncAction =
                entry.syncState === 'discovered' &&
                officialSyncStatus !== 'synced' &&
                isAuthenticated

              if (showSyncAction) {
                return (
                  <div key={entry.scene.id} className="flex items-center gap-1">
                    <div className="flex-1 min-w-0">
                      <SceneItem
                        scene={entry.scene}
                        syncState={entry.syncState}
                        isActive={entry.scene.id === activeSceneId}
                        onClick={() => setActiveScene(entry.scene.id)}
                      />
                    </div>
                    <button
                      type="button"
                      data-testid={`sync-scene-button-${entry.scene.id}`}
                      disabled={officialSyncStatus === 'syncing'}
                      onClick={() => void onSyncDiscoveredScene(entry.scene.id)}
                      className={cn(
                        'flex items-center justify-center rounded p-1.5 transition-colors',
                        officialSyncStatus === 'syncing'
                          ? 'text-zinc-500 cursor-not-allowed'
                          : officialSyncStatus === 'error'
                            ? 'text-red-400 hover:bg-red-600/20'
                            : 'text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
                      )}
                      title={
                        officialSyncStatus === 'syncing'
                          ? 'Syncing...'
                          : officialSyncStatus === 'error'
                            ? 'Retry sync to cloud'
                            : 'Sync to cloud'
                      }
                    >
                      {officialSyncStatus === 'syncing' ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Cloud size={14} />
                      )}
                    </button>
                  </div>
                )
              }

              return (
                <SceneItem
                  key={entry.scene.id}
                  scene={entry.scene}
                  syncState={entry.syncState}
                  isActive={entry.scene.id === activeSceneId}
                  onClick={() => setActiveScene(entry.scene.id)}
                />
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
