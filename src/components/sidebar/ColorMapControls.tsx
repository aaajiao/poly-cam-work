import { useViewerStore } from '@/store/viewerStore'
import type { ColorMapMode } from '@/types'
import { cn } from '@/lib/utils'

const MODES: { value: ColorMapMode; label: string }[] = [
  { value: 'original', label: 'Original' },
  { value: 'height', label: 'Height' },
  { value: 'intensity', label: 'Intensity' },
]

export function ColorMapControls() {
  const colorMapMode = useViewerStore((s) => s.colorMapMode)
  const setColorMapMode = useViewerStore((s) => s.setColorMapMode)
  const viewMode = useViewerStore((s) => s.viewMode)

  if (viewMode === 'mesh') return null

  return (
    <div className="space-y-2" data-testid="color-map-controls">
      <p className="text-zinc-500 text-xs uppercase tracking-wider">Color Mapping</p>
      <div className="flex gap-1">
        {MODES.map((mode) => (
          <button
            key={mode.value}
            data-testid={`color-map-${mode.value}`}
            onClick={() => setColorMapMode(mode.value)}
            className={cn(
              'flex-1 py-1 text-xs rounded transition-colors',
              colorMapMode === mode.value
                ? 'bg-blue-600 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
            )}
          >
            {mode.label}
          </button>
        ))}
      </div>
      {colorMapMode !== 'original' && (
        <div
          className="h-3 rounded"
          style={{
            background: 'linear-gradient(to right, #0000ff, #00ffff, #00ff00, #ffff00, #ff0000)',
          }}
          title="Low → High"
        />
      )}
    </div>
  )
}
