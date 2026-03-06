import { Camera, Scissors } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { ViewModeToggle } from './ViewModeToggle'
import { ToolButtons } from './ToolButtons'
import { useViewerStore } from '@/store/viewerStore'
import { cn } from '@/lib/utils'

export function Toolbar() {
  const clipEnabled = useViewerStore((s) => s.clipPlane.enabled)
  const setClipPlane = useViewerStore((s) => s.setClipPlane)

  const toggleClip = () => setClipPlane({ enabled: !clipEnabled })

  const handleScreenshot = () => {
    const fn = (window as Window & { __takeScreenshot?: () => void }).__takeScreenshot
    if (fn) fn()
  }

  return (
    <div className="flex items-center gap-2 w-full">
      <ViewModeToggle />

      <div className="w-px h-6 bg-zinc-700" />

      <ToolButtons />

      <div className="w-px h-6 bg-zinc-700" />

      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              data-testid="clip-toggle"
              onClick={toggleClip}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border transition-colors',
                clipEnabled
                  ? 'bg-blue-600 text-white border-blue-500'
                  : 'bg-zinc-900 text-zinc-400 border-zinc-700 hover:text-zinc-200 hover:bg-zinc-800'
              )}
            >
              <Scissors size={14} />
              <span className="hidden md:inline">Clip</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Toggle clipping plane
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <div className="flex-1" />

      <Button
        variant="ghost"
        size="icon"
        data-testid="screenshot-btn"
        onClick={handleScreenshot}
        className="h-8 w-8 text-zinc-400 hover:text-zinc-100"
        title="Screenshot"
      >
        <Camera size={16} />
      </Button>
    </div>
  )
}
