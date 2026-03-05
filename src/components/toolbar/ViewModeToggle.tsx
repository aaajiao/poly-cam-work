import { Layers, Cloud, Layers3 } from 'lucide-react'
import { useViewerStore } from '@/store/viewerStore'
import type { ViewMode } from '@/types'
import { cn } from '@/lib/utils'

const MODES: { value: ViewMode; label: string; icon: React.ReactNode }[] = [
  { value: 'mesh', label: 'Mesh', icon: <Layers size={14} /> },
  { value: 'pointcloud', label: 'Point Cloud', icon: <Cloud size={14} /> },
  { value: 'both', label: 'Both', icon: <Layers3 size={14} /> },
]

export function ViewModeToggle() {
  const viewMode = useViewerStore((s) => s.viewMode)
  const setViewMode = useViewerStore((s) => s.setViewMode)

  return (
    <div
      className="flex items-center bg-zinc-900 border border-zinc-700 rounded-md overflow-hidden"
      data-testid="view-mode-toggle"
    >
      {MODES.map((mode) => (
        <button
          key={mode.value}
          data-testid={`view-mode-${mode.value}`}
          onClick={() => setViewMode(mode.value)}
          title={mode.label}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors',
            viewMode === mode.value
              ? 'bg-blue-600 text-white'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
          )}
        >
          {mode.icon}
          <span className="hidden sm:inline">{mode.label}</span>
        </button>
      ))}
    </div>
  )
}
