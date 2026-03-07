import { useState } from 'react'
import { CloudUpload, Upload, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useViewerStore } from '@/store/viewerStore'

export function PublishButton() {
  const activeSceneId = useViewerStore((state) => state.activeSceneId)
  const isAuthenticated = useViewerStore((state) => state.isAuthenticated)
  const draftStatus = useViewerStore((state) => state.draftStatus)
  const draftError = useViewerStore((state) => state.draftError)
  const publishedVersionByScene = useViewerStore((state) => state.publishedVersionByScene)
  const saveDraft = useViewerStore((state) => state.saveDraft)
  const publishDraft = useViewerStore((state) => state.publishDraft)
  const rollbackToVersion = useViewerStore((state) => state.rollbackToVersion)
  const importLocalData = useViewerStore((state) => state.importLocalData)

  const [isSaving, setIsSaving] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [rollbackValue, setRollbackValue] = useState('')

  if (!activeSceneId || !isAuthenticated) {
    return null
  }

  const version = publishedVersionByScene[activeSceneId]

  return (
    <div className="flex items-center gap-2">
      <Button
        data-testid="import-local-data"
        variant="outline"
        disabled={isImporting}
        className="h-8 gap-1 border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
        onClick={() => {
          setIsImporting(true)
          void importLocalData(activeSceneId).finally(() => setIsImporting(false))
        }}
      >
        <CloudUpload size={14} />
        <span className="hidden xl:inline">Import Local</span>
      </Button>

      <Button
        data-testid="save-draft-button"
        variant="outline"
        disabled={isSaving || draftStatus === 'saving'}
        className="h-8 gap-1 border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
        onClick={() => {
          setIsSaving(true)
          void saveDraft(activeSceneId).finally(() => setIsSaving(false))
        }}
      >
        <CloudUpload size={14} />
        <span className="hidden lg:inline">Save Draft</span>
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

      <div className="hidden items-center gap-1 xl:flex">
        <input
          data-testid="rollback-version-input"
          inputMode="numeric"
          placeholder="v"
          value={rollbackValue}
          onChange={(event) => setRollbackValue(event.target.value.replace(/[^0-9]/g, ''))}
          className="h-8 w-14 rounded border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-200 outline-none focus:border-blue-500"
        />
        <Button
          data-testid="rollback-button"
          variant="outline"
          disabled={!rollbackValue}
          className="h-8 gap-1 border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
          onClick={() => {
            const parsed = Number.parseInt(rollbackValue, 10)
            if (!Number.isFinite(parsed) || parsed <= 0) return
            void rollbackToVersion(activeSceneId, parsed)
          }}
        >
          <RotateCcw size={14} />
          Rollback
        </Button>
      </div>

      <div className="hidden text-xs text-zinc-500 xl:block" data-testid="publish-version-label">
        {typeof version === 'number' ? `v${version}` : 'unpublished'}
      </div>

      {draftError && (
        <div className="hidden text-xs text-red-400 2xl:block" data-testid="publish-error-label">
          {draftError}
        </div>
      )}
    </div>
  )
}
