import { Cloud, CloudCheck, HardDrive, Layers, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ScanScene } from '@/types'
import type { SceneEntry, SceneSyncState } from './fileManagerSceneEntries'

function SceneItem({
  scene,
  syncState,
  isActive,
  onClick,
}: {
  scene: ScanScene
  syncState: SceneSyncState
  isActive: boolean
  onClick: () => void
}) {
  const officialStatus = scene.officialStatus?.syncStatus

  let syncLabel = 'Bootstrap'
  let SyncIcon = HardDrive
  let badgeClass = 'border-subtle bg-panel text-dim'

  if (syncState === 'published') {
    syncLabel = 'Cloud'
    SyncIcon = CloudCheck
    badgeClass = 'border-subtle bg-success-soft text-success'
  } else if (syncState === 'session') {
    syncLabel = 'Session'
    SyncIcon = Layers
    badgeClass = 'border-accent-soft bg-accent-soft text-accent'
  } else if (syncState === 'discovered') {
    SyncIcon = Layers
    if (officialStatus === 'error') {
      syncLabel = 'Sync Error'
      badgeClass = 'border-danger-soft bg-[color:color-mix(in_oklab,var(--destructive)_16%,transparent)] text-danger'
    } else if (officialStatus === 'syncing') {
      syncLabel = 'Syncing'
      SyncIcon = Loader2
      badgeClass = 'border-accent-soft bg-accent-soft text-accent'
    } else {
      syncLabel = 'Discovered'
      badgeClass = 'border-accent-soft bg-accent-soft text-accent'
    }
  }

  return (
    <button
      data-testid={`scene-item-${scene.id}`}
      onClick={onClick}
      className={cn(
        'ui-hover-emphasis w-full text-left px-3 py-2 rounded-md text-sm transition-colors',
        'flex items-center gap-2',
        isActive
          ? 'bg-accent-soft text-accent border border-accent-soft'
          : 'text-dim hover:bg-elevated hover:text-soft'
      )}
    >
      <Layers size={14} className="flex-shrink-0" />
      <span className="flex-1 truncate">{scene.name}</span>
      <span
        data-testid={`scene-sync-state-${scene.id}`}
        className={cn('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px]', badgeClass)}
      >
        <SyncIcon size={10} className={cn('flex-shrink-0', officialStatus === 'syncing' && 'animate-spin')} />
        <span>{syncLabel}</span>
      </span>
      {isActive && (
          <Badge variant="secondary" className="text-xs px-1 py-0 h-4 bg-accent-soft text-accent border-0">
          Active
        </Badge>
      )}
    </button>
  )
}

interface FileManagerSceneListProps {
  sceneEntries: SceneEntry[]
  activeSceneId: string | null
  isAuthenticated: boolean
  onSelectScene: (sceneId: string) => void
  onSyncScene: (sceneId: string) => void
}

export function FileManagerSceneList({
  sceneEntries,
  activeSceneId,
  isAuthenticated,
  onSelectScene,
  onSyncScene,
}: FileManagerSceneListProps) {
  return (
    <div className="space-y-1" data-testid="scan-list">
      {sceneEntries.length === 0 ? (
        <p className="px-3 py-2 text-xs text-faint">No scenes available.</p>
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
                    onClick={() => onSelectScene(entry.scene.id)}
                  />
                </div>
                <button
                  type="button"
                  data-testid={`sync-scene-button-${entry.scene.id}`}
                  disabled={officialSyncStatus === 'syncing'}
                  onClick={() => void onSyncScene(entry.scene.id)}
                  className={cn(
                     'ui-hover-emphasis flex items-center justify-center rounded p-1.5 transition-colors',
                    officialSyncStatus === 'syncing'
                      ? 'text-faint cursor-not-allowed'
                      : officialSyncStatus === 'error'
                        ? 'text-danger hover:bg-[color:color-mix(in_oklab,var(--destructive)_14%,transparent)]'
                        : 'text-dim hover:bg-elevated hover:text-soft'
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
              onClick={() => onSelectScene(entry.scene.id)}
            />
          )
        })
      )}
    </div>
  )
}
