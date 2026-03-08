import { useActiveScene, useViewerStore } from '@/store/viewerStore'
import { ClipControls } from './ClipControls'
import { ColorMapControls } from './ColorMapControls'

function InfoRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-faint text-xs">{label}</span>
      <span className="text-soft text-xs font-mono">{value}</span>
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function formatNumber(n: number): string {
  return n.toLocaleString()
}

export function PropertyPanel() {
  const activeScene = useActiveScene()
  const viewMode = useViewerStore((s) => s.viewMode)

  if (!activeScene) {
    return (
        <div className="text-faint text-xs text-center py-4">
        No scene selected
      </div>
    )
  }

  return (
    <div className="space-y-3" data-testid="property-panel">
      <div>
        <p className="text-strong text-sm font-medium truncate">{activeScene.name}</p>
        <p className="text-faint text-xs mt-0.5">
          {viewMode === 'mesh' ? 'Mesh view' : viewMode === 'pointcloud' ? 'Point cloud view' : 'Both'}
        </p>
      </div>

      {activeScene.metadata && (
        <div className="border-t border-subtle pt-2 space-y-0.5">
          {activeScene.metadata.pointCount > 0 && (
            <InfoRow label="Points" value={formatNumber(activeScene.metadata.pointCount)} />
          )}
          {activeScene.metadata.vertexCount > 0 && (
            <InfoRow label="Vertices" value={formatNumber(activeScene.metadata.vertexCount)} />
          )}
          {activeScene.metadata.triangleCount > 0 && (
            <InfoRow label="Triangles" value={formatNumber(activeScene.metadata.triangleCount)} />
          )}
          {activeScene.metadata.fileSize > 0 && (
            <InfoRow label="File size" value={formatBytes(activeScene.metadata.fileSize)} />
          )}
        </div>
      )}
    </div>
  )
}

export function ToolsPanel() {
  const activeScene = useActiveScene()
  const viewMode = useViewerStore((s) => s.viewMode)
  const pointSize = useViewerStore((s) => s.pointSize)
  const setPointSize = useViewerStore((s) => s.setPointSize)

  if (!activeScene) return null

  return (
    <div className="space-y-3" data-testid="tools-panel">
      {(viewMode === 'pointcloud' || viewMode === 'both') && (
        <div>
          <div className="flex justify-between items-center mb-1">
              <span className="text-faint text-xs">Point size</span>
              <span className="text-soft text-xs font-mono">{pointSize.toFixed(3)}</span>
          </div>
          <input
            type="range"
            min="0.001"
            max="0.1"
            step="0.001"
            value={pointSize}
            onChange={(e) => setPointSize(parseFloat(e.target.value))}
            className="w-full accent-[var(--primary)]"
            data-testid="point-size-slider"
          />
        </div>
      )}

      <ClipControls />

      <div className="border-t border-subtle pt-2">
        <ColorMapControls />
      </div>
    </div>
  )
}
