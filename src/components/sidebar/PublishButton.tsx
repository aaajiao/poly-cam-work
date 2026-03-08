import { useEffect, useRef, useState } from 'react'
import { useViewerStore } from '@/store/viewerStore'
import { PublishActionControls } from './PublishActionControls'
import { PublishVersionMenu } from './PublishVersionMenu'

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
          setIsSaving(true)
          void downloadLocalDraft(activeSceneId).finally(() => setIsSaving(false))
        }}
        onPublishClick={() => {
          setIsPublishing(true)
          void publishDraft(activeSceneId).finally(() => setIsPublishing(false))
        }}
        onFileChange={(event) => {
          const file = event.target.files?.[0]
          event.currentTarget.value = ''
          if (!file) return

          setIsImporting(true)
          void importLocalDraftFile(activeSceneId, file).finally(() => setIsImporting(false))
        }}
      />

      <PublishVersionMenu
        liveVersion={liveVersion}
        versions={versions}
        isOpen={isVersionsOpen}
        rollingBackVersion={rollingBackVersion}
        deletingVersion={deletingVersion}
        onToggle={() => setIsVersionsOpen((open) => !open)}
        onRollback={(version) => {
          setRollingBackVersion(version)
          void rollbackToVersion(activeSceneId, version).finally(() => {
            setRollingBackVersion(null)
            setIsVersionsOpen(false)
          })
        }}
        onDelete={(version, event) => {
          event.stopPropagation()

          const confirmed = window.confirm(
            liveVersion === version
              ? `Delete live version v${version}? The app will fall back to the newest remaining release.`
              : `Delete version v${version}?`
          )
          if (!confirmed) return

          setDeletingVersion(version)
          void deletePublishedVersion(activeSceneId, version).finally(() => setDeletingVersion(null))
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
