import { MousePointer2, Ruler, Tag, Eye, EyeOff } from 'lucide-react'
import { useViewerStore } from '@/store/viewerStore'
import type { ToolMode } from '@/types'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

const TOOLS: { value: ToolMode; label: string; icon: React.ReactNode; shortcut: string }[] = [
  { value: 'orbit', label: 'Orbit', icon: <MousePointer2 size={14} />, shortcut: 'O' },
  { value: 'measure', label: 'Measure', icon: <Ruler size={14} />, shortcut: 'M' },
  { value: 'annotate', label: 'Annotate', icon: <Tag size={14} />, shortcut: 'A' },
]

export function ToolButtons() {
  const toolMode = useViewerStore((s) => s.toolMode)
  const setToolMode = useViewerStore((s) => s.setToolMode)
  const annotationsVisible = useViewerStore((s) => s.annotationsVisible)
  const toggleAnnotationsVisible = useViewerStore((s) => s.toggleAnnotationsVisible)

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-2">
        <div
          className="flex items-center bg-zinc-900 border border-zinc-700 rounded-md overflow-hidden"
          data-testid="tool-buttons"
        >
          {TOOLS.map((tool) => (
            <Tooltip key={tool.value}>
              <TooltipTrigger asChild>
                <button
                  data-testid={`tool-${tool.value}`}
                  onClick={() => setToolMode(tool.value)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors',
                    toolMode === tool.value
                      ? 'bg-blue-600 text-white'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                  )}
                >
                  {tool.icon}
                  <span className="hidden md:inline">{tool.label}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {tool.label} <kbd className="ml-1 px-1 bg-zinc-700 rounded text-zinc-300">{tool.shortcut}</kbd>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              data-testid="toggle-annotations-btn"
              onClick={toggleAnnotationsVisible}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border transition-colors',
                annotationsVisible
                  ? 'bg-zinc-800 text-zinc-200 border-zinc-600 hover:bg-zinc-700'
                  : 'bg-zinc-900 text-zinc-500 border-zinc-700 hover:text-zinc-300 hover:bg-zinc-800'
              )}
            >
              {annotationsVisible ? <Eye size={14} /> : <EyeOff size={14} />}
              <span className="hidden md:inline">Labels</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Toggle annotations <kbd className="ml-1 px-1 bg-zinc-700 rounded text-zinc-300">V</kbd>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  )
}
