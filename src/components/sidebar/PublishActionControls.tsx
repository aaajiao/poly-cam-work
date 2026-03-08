import type { ChangeEvent, RefObject } from 'react'
import { CloudDownload, CloudUpload, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface PublishActionControlsProps {
  fileInputRef: RefObject<HTMLInputElement | null>
  isImporting: boolean
  isSaving: boolean
  isPublishing: boolean
  draftStatus: string
  isDraftDirty: boolean
  hasPublishedVersions: boolean
  onImportClick: () => void
  onExportClick: () => void
  onPublishClick: () => void
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void
}

export function PublishActionControls({
  fileInputRef,
  isImporting,
  isSaving,
  isPublishing,
  draftStatus,
  isDraftDirty,
  hasPublishedVersions,
  onImportClick,
  onExportClick,
  onPublishClick,
  onFileChange,
}: PublishActionControlsProps) {
  return (
    <>
      <Button
        data-testid="import-local-data"
        variant="outline"
        disabled={isImporting}
        className="h-8 gap-1 border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
        onClick={onImportClick}
      >
        <CloudUpload size={14} />
        <span className="hidden xl:inline">Import</span>
      </Button>

      <Button
        data-testid="save-draft-button"
        variant="outline"
        disabled={isSaving || draftStatus === 'saving'}
        className="h-8 gap-1 border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
        onClick={onExportClick}
      >
        <CloudDownload size={14} />
        <span className="hidden lg:inline">Export</span>
      </Button>

      <Button
        data-testid="publish-button"
        disabled={isPublishing || (!isDraftDirty && hasPublishedVersions)}
        className="h-8 gap-1 bg-emerald-600 text-white hover:bg-emerald-500"
        onClick={onPublishClick}
      >
        <Upload size={14} />
        <span className="hidden md:inline">Publish</span>
      </Button>

      <div className="hidden text-xs xl:block" data-testid="draft-dirty-indicator">
        {isDraftDirty ? (
          <span className="text-amber-400">unsaved</span>
        ) : (
          <span className="text-zinc-500">saved</span>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={onFileChange}
      />
    </>
  )
}
