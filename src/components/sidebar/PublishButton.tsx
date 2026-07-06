import { useEffect, useRef, useState } from 'react'
import { useViewerStore } from '@/store/viewerStore'
import { PublishActionControls } from './PublishActionControls'
import { PublishVersionMenu } from './PublishVersionMenu'

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  return fallback
}

export function PublishButton() {
  const activeSceneId = useViewerStore((state) => state.activeSceneId)
  const isAuthenticated = useViewerStore((state) => state.isAuthenticated)
  const draftStatus = useViewerStore((state) => state.draftStatus)
  const draftError = useViewerStore((state) => state.draftError)
  const draftDirtyByScene = useViewerStore((state) => state.draftDirtyByScene)
  const publishedVersionByScene = useViewerStore((state) => state.publishedVersionByScene)
  const publishedVersionsByScene = useViewerStore((state) => state.publishedVersionsByScene)
  const downloadLocalDraft = useViewerStore((state) => state.downloadLocalDraft)
  const importLocalDraftFile = useViewerStore((state) => state.importLocalDraftFile)
  const loadPublishedVersions = useViewerStore((state) => state.loadPublishedVersions)
  const publishDraft = useViewerStore((state) => state.publishDraft)
  const rollbackToVersion = useViewerStore((state) => state.rollbackToVersion)
  const deletePublishedVersion = useViewerStore((state) => state.deletePublishedVersion)
  const setDraftError = useViewerStore((state) => state.setDraftError)

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
  const isDraftDirty = draftDirtyByScene[activeSceneId] ?? false

  return (
    <div className="flex items-center gap-2">
      <PublishActionControls
        fileInputRef={fileInputRef}
        isImporting={isImporting}
        isSaving={isSaving}
        isPublishing={isPublishing}
        draftStatus={draftStatus}
        isDraftDirty={isDraftDirty}
        hasPublishedVersions={versions.length > 0}
        onImportClick={() => {
          fileInputRef.current?.click()
        }}
        onExportClick={() => {
          setDraftError(null)
          setIsSaving(true)
          void downloadLocalDraft(activeSceneId)
            .catch((error) => setDraftError(toErrorMessage(error, 'Failed to export draft')))
            .finally(() => setIsSaving(false))
        }}
        onPublishClick={() => {
          setDraftError(null)
          setIsPublishing(true)
          void publishDraft(activeSceneId)
            .catch((error) => setDraftError(toErrorMessage(error, 'Failed to publish draft')))
            .finally(() => setIsPublishing(false))
        }}
        onFileChange={(event) => {
          const file = event.target.files?.[0]
          event.currentTarget.value = ''
          if (!file) return

          setDraftError(null)
          setIsImporting(true)
          void importLocalDraftFile(activeSceneId, file)
            .catch((error) => setDraftError(toErrorMessage(error, 'Failed to import draft')))
            .finally(() => setIsImporting(false))
        }}
      />

      <PublishVersionMenu
        liveVersion={liveVersion}
        versions={versions}
        isOpen={isVersionsOpen}
        rollingBackVersion={rollingBackVersion}
        deletingVersion={deletingVersion}
        isActionInFlight={rollingBackVersion !== null || deletingVersion !== null}
        onToggle={() => setIsVersionsOpen((open) => !open)}
        onRollback={(version) => {
          setDraftError(null)
          setRollingBackVersion(version)
          void rollbackToVersion(activeSceneId, version)
            .then(() => setIsVersionsOpen(false))
            .catch((error) =>
              setDraftError(toErrorMessage(error, `Failed to roll back to v${version}`))
            )
            .finally(() => setRollingBackVersion(null))
        }}
        onDelete={(version, event) => {
          event.stopPropagation()

          const confirmed = window.confirm(
            liveVersion === version
              ? `Delete live version v${version}? The app will fall back to the newest remaining release.`
              : `Delete version v${version}?`
          )
          if (!confirmed) return

          setDraftError(null)
          setDeletingVersion(version)
          void deletePublishedVersion(activeSceneId, version)
            .catch((error) =>
              setDraftError(toErrorMessage(error, `Failed to delete v${version}`))
            )
            .finally(() => setDeletingVersion(null))
        }}
      />

      <div className="hidden text-xs text-faint xl:block" data-testid="publish-version-label">
        {typeof liveVersion === 'number' ? `v${liveVersion}` : 'none'}
      </div>

      {draftError && (
        <div className="text-xs text-danger" data-testid="publish-error-label">
          {draftError}
        </div>
      )}
    </div>
  )
}
