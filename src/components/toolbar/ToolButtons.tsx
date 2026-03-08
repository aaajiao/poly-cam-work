import { MousePointer2, Ruler, Tag, Eye, EyeOff } from 'lucide-react'
import { useViewerStore } from '@/store/viewerStore'
import type { ToolMode } from '@/types'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

const TOOLS: { value: ToolMode; label: string; icon: React.ReactNode }[] = [
  { value: 'orbit', label: 'Orbit', icon: <MousePointer2 size={14} /> },
  { value: 'measure', label: 'Measure', icon: <Ruler size={14} /> },
  { value: 'annotate', label: 'Annotate', icon: <Tag size={14} /> },
]

export function ToolButtons() {
  const toolMode = useViewerStore((s) => s.toolMode)
  const setToolMode = useViewerStore((s) => s.setToolMode)
  const annotationsVisible = useViewerStore((s) => s.annotationsVisible)
  const toggleAnnotationsVisible = useViewerStore((s) => s.toggleAnnotationsVisible)
  const presentationMode = useViewerStore((s) => s.presentationMode)

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-2">
        <div
          className="flex items-center bg-panel border border-subtle rounded-md overflow-hidden"
          data-testid="tool-buttons"
        >
          {TOOLS.map((tool) => (
            <Tooltip key={tool.value}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  data-testid={`tool-${tool.value}`}
                  disabled={presentationMode}
                  onClick={() => setToolMode(tool.value)}
                  className={cn(
                    'ui-hover-emphasis flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors',
                    presentationMode && 'cursor-not-allowed text-faint hover:bg-transparent hover:text-faint',
                    toolMode === tool.value
                      ? 'border-r border-accent-soft bg-accent-soft text-accent'
                      : 'text-dim hover:text-soft hover:bg-elevated'
                  )}
                >
                  {tool.icon}
                  <span className="hidden md:inline">{tool.label}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {tool.label}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              data-testid="toggle-annotations-btn"
              disabled={presentationMode}
              onClick={toggleAnnotationsVisible}
              className={cn(
                'ui-hover-emphasis flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border transition-colors',
                presentationMode && 'cursor-not-allowed border-subtle text-faint hover:bg-panel hover:text-faint',
                annotationsVisible
                  ? 'bg-accent-soft text-accent border-accent-soft hover:bg-accent-soft'
                  : 'bg-panel text-faint border-subtle hover:text-soft hover:bg-elevated'
              )}
            >
              {annotationsVisible ? <Eye size={14} /> : <EyeOff size={14} />}
              <span className="hidden md:inline">Labels</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Toggle annotations
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  )
}
