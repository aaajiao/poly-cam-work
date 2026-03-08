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
      className="flex items-center bg-panel border border-subtle rounded-md overflow-hidden"
      data-testid="view-mode-toggle"
    >
      {MODES.map((mode) => (
        <button
          key={mode.value}
          data-testid={`view-mode-${mode.value}`}
          onClick={() => setViewMode(mode.value)}
          title={mode.label}
          className={cn(
            'ui-hover-emphasis flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors',
            viewMode === mode.value
              ? 'bg-primary text-primary-foreground'
              : 'text-dim hover:text-soft hover:bg-elevated'
            )}
        >
          {mode.icon}
          <span className="hidden sm:inline">{mode.label}</span>
        </button>
      ))}
    </div>
  )
}
