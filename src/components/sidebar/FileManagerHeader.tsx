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
        <p className="text-xs text-zinc-500 uppercase tracking-wider">Scenes</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            data-testid="refresh-scenes-button"
            disabled={isRefreshing}
            onClick={onRefresh}
            className={cn(
              'flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors',
              isRefreshing
                ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
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
    </>
  )
}
