import { Cloud, CloudCheck, Loader2, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FileManagerHeaderProps {
  isRefreshing: boolean
  isSyncingPresets: boolean
  canSyncPresets: boolean
  unsyncedPresetCount: number
  syncError: string | null
  syncNotice: string | null
  onRefresh: () => void
  onSyncPresets: () => void
}

export function FileManagerHeader({
  isRefreshing,
  isSyncingPresets,
  canSyncPresets,
  unsyncedPresetCount,
  syncError,
  syncNotice,
  onRefresh,
  onSyncPresets,
}: FileManagerHeaderProps) {
  return (
    <>
      <div className="mb-2 flex items-center justify-between px-1">
        <p className="text-xs text-faint uppercase tracking-wider">Scenes</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            data-testid="refresh-scenes-button"
            disabled={isRefreshing}
            onClick={onRefresh}
            className={cn(
              'ui-hover-emphasis flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors',
              isRefreshing
                ? 'bg-panel text-faint cursor-not-allowed'
                : 'bg-panel text-dim hover:bg-elevated hover:text-soft'
            )}
          >
            <RefreshCw size={12} className={cn(isRefreshing && 'animate-spin')} />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
          <button
            type="button"
            data-testid="sync-preset-models-button"
            disabled={!canSyncPresets}
            onClick={onSyncPresets}
            className={cn(
              'ui-hover-emphasis flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors',
              !canSyncPresets
                ? 'bg-panel text-faint cursor-not-allowed'
                : 'ui-action-success'
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
          <p className="mb-2 px-1 text-[11px] text-danger" data-testid="sync-error">
          {syncError}
        </p>
      )}

      {syncNotice && !syncError && (
          <p className="mb-2 px-1 text-[11px] text-success" data-testid="sync-notice">
          {syncNotice}
        </p>
      )}
    </>
  )
}
