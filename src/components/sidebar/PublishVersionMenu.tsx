import { ChevronDown, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface PublishVersionMenuProps {
  liveVersion: number | undefined
  versions: number[]
  isOpen: boolean
  rollingBackVersion: number | null
  deletingVersion: number | null
  onToggle: () => void
  onRollback: (version: number) => void
  onDelete: (version: number, event: React.MouseEvent<HTMLButtonElement>) => void
}

export function PublishVersionMenu({
  liveVersion,
  versions,
  isOpen,
  rollingBackVersion,
  deletingVersion,
  onToggle,
  onRollback,
  onDelete,
}: PublishVersionMenuProps) {
  return (
    <div className="relative hidden xl:block" data-testid="published-version-menu">
      <Button
        type="button"
        variant="outline"
        className="h-8 gap-1 border-subtle bg-panel text-dim hover:bg-elevated hover:text-soft"
        data-testid="published-version-menu-trigger"
        onClick={onToggle}
      >
        <span className="text-xs">{typeof liveVersion === 'number' ? `v${liveVersion}` : 'Versions'}</span>
        <ChevronDown size={14} className={isOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
      </Button>

      {isOpen && (
        <div
          className="absolute right-0 top-10 z-50 w-56 rounded border border-strong bg-elevated p-2 shadow-panel"
          data-testid="published-version-menu-content"
        >
          <div className="mb-1 px-1 text-[10px] uppercase tracking-wide text-faint">Releases</div>

          <div className="max-h-56 space-y-1 overflow-y-auto" data-testid="published-version-list">
            {versions.length === 0 ? (
              <div className="rounded px-2 py-2 text-xs text-faint">None</div>
            ) : (
              versions.map((version) => {
                const isLive = liveVersion === version
                const isRollingBack = rollingBackVersion === version
                const isDeleting = deletingVersion === version

                return (
                  <div
                    key={version}
                    className="group flex items-center justify-between gap-1 rounded border border-subtle bg-panel px-1.5 py-1"
                    data-testid={`published-version-item-${version}`}
                  >
                    <button
                      type="button"
                      disabled={isRollingBack || isDeleting}
                      className="flex items-center gap-1 text-xs text-dim hover:text-soft disabled:opacity-50"
                      data-testid={`rollback-version-${version}`}
                      onClick={() => onRollback(version)}
                    >
                       <RotateCcw size={12} className={isLive ? 'text-success' : ''} />
                      <span>{`v${version}`}</span>
                       {isLive && <span className="text-[10px] text-success">live</span>}
                    </button>

                    <button
                      type="button"
                      disabled={isDeleting || isRollingBack}
                       className="rounded p-0.5 text-faint transition-colors hover:text-danger disabled:opacity-50"
                      aria-label={`Delete version ${version}`}
                      data-testid={`delete-version-${version}`}
                      onClick={(event) => onDelete(version, event)}
                    >
                      <X size={11} />
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
