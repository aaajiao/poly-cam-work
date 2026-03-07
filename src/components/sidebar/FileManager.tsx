import { useRef, useState } from 'react'
import { Layers, Upload, Cloud, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { useViewerStore } from '@/store/viewerStore'
import type { ScanScene } from '@/types'
import { vercelBlobModelStorage } from '@/storage/vercelBlobModelStorage'
import * as modelApi from '@/lib/modelApi'

function SceneItem({ scene, isActive, onClick }: {
  scene: ScanScene
  isActive: boolean
  onClick: () => void
}) {
  return (
    <button
      data-testid={`scene-item-${scene.id}`}
      onClick={onClick}
      className={cn(
        'w-full text-left px-3 py-2 rounded-md text-sm transition-colors',
        'flex items-center gap-2',
        isActive
          ? 'bg-blue-600/20 text-blue-300 border border-blue-600/30'
          : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
      )}
    >
      <Layers size={14} className="flex-shrink-0" />
      <span className="flex-1 truncate">{scene.name}</span>
      {isActive && (
        <Badge variant="secondary" className="text-xs px-1 py-0 h-4 bg-blue-600/30 text-blue-300 border-0">
          Active
        </Badge>
      )}
    </button>
  )
}

function extension(file: File) {
  const dotIndex = file.name.lastIndexOf('.')
  if (dotIndex < 0) return ''
  return file.name.slice(dotIndex).toLowerCase()
}

function baseName(file: File) {
  return file.name.replace(/\.[^.]+$/, '')
}

function sceneIdFromName(name: string) {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  return `cloud-${normalized || `scene-${Date.now()}`}`
}

export function FileManager() {
  const scenes = useViewerStore((s) => s.scenes)
  const cloudScenes = useViewerStore((s) => s.cloudScenes)
  const uploadedScenes = useViewerStore((s) => s.uploadedScenes)
  const activeSceneId = useViewerStore((s) => s.activeSceneId)
  const isAuthenticated = useViewerStore((s) => s.isAuthenticated)
  const setActiveScene = useViewerStore((s) => s.setActiveScene)
  const addCloudScene = useViewerStore((s) => s.addCloudScene)
  const syncPresetScenesToCloud = useViewerStore((s) => s.syncPresetScenesToCloud)

  const [isUploadingModel, setIsUploadingModel] = useState(false)
  const [isSyncingPresets, setIsSyncingPresets] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadNotice, setUploadNotice] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const onModelFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : []
    event.currentTarget.value = ''
    if (files.length === 0) return

    const glbFile = files.find((file) => extension(file) === '.glb')
    const plyFile = files.find((file) => extension(file) === '.ply')

    if (!glbFile || !plyFile) {
      setUploadError('Select one GLB file and one PLY file together.')
      return
    }

    if (!isAuthenticated) {
      setUploadError('Login required to upload models.')
      return
    }

    setUploadError(null)
    setUploadNotice(null)
    setIsUploadingModel(true)

    try {
      const displayName = baseName(glbFile) || baseName(plyFile)
      const sceneId = sceneIdFromName(displayName)

      const [glbUrl, plyUrl] = await Promise.all([
        vercelBlobModelStorage.upload(glbFile, { sceneKey: sceneId, kind: 'glb' }),
        vercelBlobModelStorage.upload(plyFile, { sceneKey: sceneId, kind: 'ply' }),
      ])

      const model = await modelApi.createModel({
        id: sceneId,
        name: displayName,
        glbUrl,
        plyUrl,
      })

      addCloudScene({
        ...model,
        source: 'cloud',
      })
      setUploadNotice(`Uploaded ${model.name}.`)
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Model upload failed.')
    } finally {
      setIsUploadingModel(false)
    }
  }

  const onSyncPresets = async () => {
    if (!isAuthenticated) {
      setUploadError('Login required to sync preset models.')
      return
    }

    setUploadError(null)
    setUploadNotice(null)
    setIsSyncingPresets(true)

    try {
      const synced = await syncPresetScenesToCloud()
      setUploadNotice(`Synced ${synced.length} preset scenes to cloud.`)
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Failed to sync preset models.')
    } finally {
      setIsSyncingPresets(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="text-xs text-zinc-500 uppercase tracking-wider">Cloud Models</p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              data-testid="sync-preset-models-button"
              disabled={!isAuthenticated || isSyncingPresets || isUploadingModel}
              onClick={() => {
                void onSyncPresets()
              }}
              className={cn(
                'flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors',
                !isAuthenticated || isSyncingPresets || isUploadingModel
                  ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                  : 'bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30'
              )}
            >
              {isSyncingPresets ? <Loader2 size={12} className="animate-spin" /> : <Cloud size={12} />}
              <span>{isSyncingPresets ? 'Syncing...' : 'Sync Presets'}</span>
            </button>
            <button
              type="button"
              data-testid="upload-model-button"
              disabled={!isAuthenticated || isUploadingModel || isSyncingPresets}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors',
                !isAuthenticated || isUploadingModel || isSyncingPresets
                  ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                  : 'bg-blue-600/20 text-blue-300 hover:bg-blue-600/30'
              )}
            >
              {isUploadingModel ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
              <span>{isUploadingModel ? 'Uploading...' : 'Upload'}</span>
            </button>
          </div>
          <input
            ref={fileInputRef}
            data-testid="upload-model-input"
            type="file"
            accept=".glb,.ply"
            multiple
            className="hidden"
            onChange={(event) => {
              void onModelFileChange(event)
            }}
          />
        </div>

        {uploadError && (
          <p className="mb-2 px-1 text-[11px] text-red-400" data-testid="upload-model-error">
            {uploadError}
          </p>
        )}

        {uploadNotice && !uploadError && (
          <p className="mb-2 px-1 text-[11px] text-emerald-400" data-testid="upload-model-notice">
            {uploadNotice}
          </p>
        )}

        {!isAuthenticated && (
          <p className="mb-2 px-1 text-[11px] text-zinc-500">Login to upload model pairs (GLB + PLY).</p>
        )}

        <div className="space-y-1" data-testid="cloud-scan-list">
          {cloudScenes.length === 0 ? (
            <p className="px-3 py-2 text-xs text-zinc-600">No cloud models yet.</p>
          ) : (
            cloudScenes.map((scene) => (
              <SceneItem
                key={scene.id}
                scene={scene}
                isActive={scene.id === activeSceneId}
                onClick={() => setActiveScene(scene.id)}
              />
            ))
          )}
        </div>
      </div>

      <div>
        <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2 px-1">Preset Scans</p>
        <div className="space-y-1" data-testid="scan-list">
          {scenes.map((scene) => (
            <SceneItem
              key={scene.id}
              scene={scene}
              isActive={scene.id === activeSceneId}
              onClick={() => setActiveScene(scene.id)}
            />
          ))}
        </div>
      </div>

      {uploadedScenes.length > 0 && (
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2 px-1 flex items-center gap-1">
            <Cloud size={10} />
            Uploaded (Session)
          </p>
          <div className="space-y-1" data-testid="uploaded-scan-list">
            {uploadedScenes.map((scene) => (
              <SceneItem
                key={scene.id}
                scene={scene}
                isActive={scene.id === activeSceneId}
                onClick={() => setActiveScene(scene.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
