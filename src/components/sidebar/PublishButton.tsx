import { useEffect, useRef, useState } from 'react'
import { CloudDownload, CloudUpload, Upload, RotateCcw, X, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useViewerStore } from '@/store/viewerStore'

export function PublishButton() {
  const activeSceneId = useViewerStore((state) => state.activeSceneId)
  const isAuthenticated = useViewerStore((state) => state.isAuthenticated)
  const draftStatus = useViewerStore((state) => state.draftStatus)
  const draftError = useViewerStore((state) => state.draftError)
  const publishedVersionByScene = useViewerStore((state) => state.publishedVersionByScene)
  const publishedVersionsByScene = useViewerStore((state) => state.publishedVersionsByScene)
  const downloadLocalDraft = useViewerStore((state) => state.downloadLocalDraft)
  const importLocalDraftFile = useViewerStore((state) => state.importLocalDraftFile)
  const loadPublishedVersions = useViewerStore((state) => state.loadPublishedVersions)
  const publishDraft = useViewerStore((state) => state.publishDraft)
  const rollbackToVersion = useViewerStore((state) => state.rollbackToVersion)
  const deletePublishedVersion = useViewerStore((state) => state.deletePublishedVersion)

  const [isSaving, setIsSaving] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [rollingBackVersion, setRollingBackVersion] = useState<number | null>(null)
  const [deletingVersion, setDeletingVersion] = useState<number | null>(null)
  const [isVersionsOpen, setIsVersionsOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!activeSceneId || !isAuthenticated) return
    void loadPublishedVersions(activeSceneId)
  }, [activeSceneId, isAuthenticated, loadPublishedVersions])

  if (!activeSceneId || !isAuthenticated) {
    return null
  }

  const liveVersion = publishedVersionByScene[activeSceneId]
  const versions = publishedVersionsByScene[activeSceneId] ?? []

  return (
    <div className="flex items-center gap-2">
      <Button
        data-testid="import-local-data"
        variant="outline"
        disabled={isImporting}
        className="h-8 gap-1 border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
        onClick={() => {
          fileInputRef.current?.click()
        }}
      >
        <CloudUpload size={14} />
        <span className="hidden xl:inline">Import</span>
      </Button>

      <Button
        data-testid="save-draft-button"
        variant="outline"
        disabled={isSaving || draftStatus === 'saving'}
        className="h-8 gap-1 border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
        onClick={() => {
          setIsSaving(true)
          void downloadLocalDraft(activeSceneId).finally(() => setIsSaving(false))
        }}
      >
        <CloudDownload size={14} />
        <span className="hidden lg:inline">Export</span>
      </Button>

      <Button
        data-testid="publish-button"
        disabled={isPublishing}
        className="h-8 gap-1 bg-emerald-600 text-white hover:bg-emerald-500"
        onClick={() => {
          setIsPublishing(true)
          void publishDraft(activeSceneId).finally(() => setIsPublishing(false))
        }}
      >
        <Upload size={14} />
        <span className="hidden md:inline">Publish</span>
      </Button>

      <div className="relative hidden xl:block" data-testid="published-version-menu">
        <Button
          type="button"
          variant="outline"
          className="h-8 gap-1 border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
          data-testid="published-version-menu-trigger"
          onClick={() => setIsVersionsOpen((open) => !open)}
        >
          <span className="text-xs">
            {typeof liveVersion === 'number' ? `v${liveVersion}` : 'Versions'}
          </span>
          <ChevronDown size={14} className={isVersionsOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
        </Button>

        {isVersionsOpen && (
          <div
            className="absolute right-0 top-10 z-50 w-56 rounded border border-zinc-700 bg-zinc-900/95 p-2 shadow-2xl"
            data-testid="published-version-menu-content"
          >
            <div className="mb-1 px-1 text-[10px] uppercase tracking-wide text-zinc-500">
              Published Versions
            </div>

            <div className="max-h-56 space-y-1 overflow-y-auto" data-testid="published-version-list">
              {versions.length === 0 ? (
                <div className="rounded px-2 py-2 text-xs text-zinc-500">No versions</div>
              ) : (
                versions.map((version) => {
                  const isLive = liveVersion === version
                  const isRollingBack = rollingBackVersion === version
                  const isDeleting = deletingVersion === version

                  return (
                    <div
                      key={version}
                      className="group flex items-center justify-between gap-1 rounded border border-zinc-700 bg-zinc-900/80 px-1.5 py-1"
                      data-testid={`published-version-item-${version}`}
                    >
                      <button
                        type="button"
                        disabled={isRollingBack || isDeleting}
                        className="flex items-center gap-1 text-xs text-zinc-300 hover:text-zinc-100 disabled:opacity-50"
                        data-testid={`rollback-version-${version}`}
                        onClick={() => {
                          setRollingBackVersion(version)
                          void rollbackToVersion(activeSceneId, version).finally(() => {
                            setRollingBackVersion(null)
                            setIsVersionsOpen(false)
                          })
                        }}
                      >
                        <RotateCcw size={12} className={isLive ? 'text-emerald-400' : ''} />
                        <span>{`v${version}`}</span>
                        {isLive && <span className="text-[10px] text-emerald-400">live</span>}
                      </button>

                      <button
                        type="button"
                        disabled={isDeleting || isRollingBack}
                        className="rounded p-0.5 text-zinc-500 transition-colors hover:text-red-400 disabled:opacity-50"
                        aria-label={`Delete version ${version}`}
                        data-testid={`delete-version-${version}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          setDeletingVersion(version)
                          void deletePublishedVersion(activeSceneId, version).finally(() =>
                            setDeletingVersion(null)
                          )
                        }}
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

      <div className="hidden text-xs text-zinc-500 xl:block" data-testid="publish-version-label">
        {typeof liveVersion === 'number' ? `v${liveVersion}` : 'unpublished'}
      </div>

      {draftError && (
        <div className="text-xs text-red-400" data-testid="publish-error-label">
          {draftError}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.currentTarget.value = ''
          if (!file) return

          setIsImporting(true)
          void importLocalDraftFile(activeSceneId, file).finally(() => setIsImporting(false))
        }}
      />
    </div>
  )
}
