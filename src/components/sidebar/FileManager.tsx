import { useState } from 'react'
import { useViewerStore } from '@/store/viewerStore'
import { FileManagerHeader } from './FileManagerHeader'
import { FileManagerSceneList } from './FileManagerSceneList'
import { buildSceneEntries } from './fileManagerSceneEntries'

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

  const { sceneEntries, unsyncedPresetCount } = buildSceneEntries(
    scenes,
    publishedScenes,
    discoveredScenes,
    uploadedScenes
  )
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
        <FileManagerHeader
          isRefreshing={isRefreshing}
          isSyncingPresets={isSyncingPresets}
          canSyncPresets={canSyncPresets}
          unsyncedPresetCount={unsyncedPresetCount}
          syncError={syncError}
          syncNotice={syncNotice}
          onRefresh={() => {
            void onRefreshDiscovered()
          }}
          onSyncPresets={() => {
            void onSyncPresets()
          }}
        />

        <FileManagerSceneList
          sceneEntries={sceneEntries}
          activeSceneId={activeSceneId}
          isAuthenticated={isAuthenticated}
          onSelectScene={setActiveScene}
          onSyncScene={onSyncDiscoveredScene}
        />
      </div>
    </div>
  )
}
