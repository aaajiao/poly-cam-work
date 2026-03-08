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
        className="h-8 gap-1 border-subtle bg-panel text-dim hover:bg-elevated hover:text-soft"
        onClick={onImportClick}
      >
        <CloudUpload size={14} />
        <span className="hidden xl:inline">Import</span>
      </Button>

      <Button
        data-testid="save-draft-button"
        variant="outline"
        disabled={isSaving || draftStatus === 'saving'}
        className="h-8 gap-1 border-subtle bg-panel text-dim hover:bg-elevated hover:text-soft"
        onClick={onExportClick}
      >
        <CloudDownload size={14} />
        <span className="hidden lg:inline">Export</span>
      </Button>

      <Button
        data-testid="publish-button"
        disabled={isPublishing || (!isDraftDirty && hasPublishedVersions)}
        className="ui-action-success ui-hover-emphasis h-8 gap-1"
        onClick={onPublishClick}
      >
        <Upload size={14} />
        <span className="hidden md:inline">Publish</span>
      </Button>

      <div className="hidden text-xs xl:block" data-testid="draft-dirty-indicator">
        {isDraftDirty ? (
          <span className="text-warning">unsaved</span>
        ) : (
          <span className="text-faint">saved</span>
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
