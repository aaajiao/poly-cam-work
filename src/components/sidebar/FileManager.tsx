import { Layers, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { useViewerStore } from '@/store/viewerStore'
import type { ScanScene } from '@/types'

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

export function FileManager() {
  const scenes = useViewerStore((s) => s.scenes)
  const uploadedScenes = useViewerStore((s) => s.uploadedScenes)
  const activeSceneId = useViewerStore((s) => s.activeSceneId)
  const setActiveScene = useViewerStore((s) => s.setActiveScene)

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2 px-1">
          Preset Scans
        </p>
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
            <Upload size={10} />
            Uploaded
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
