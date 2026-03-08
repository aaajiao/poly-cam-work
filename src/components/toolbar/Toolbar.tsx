import { lazy, Suspense } from 'react'
import { Eye, Scissors } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { ViewModeToggle } from './ViewModeToggle'
import { ToolButtons } from './ToolButtons'
import { useViewerStore } from '@/store/viewerStore'
import { cn } from '@/lib/utils'

const LoginDialog = lazy(async () => {
  const module = await import('@/components/sidebar/LoginDialog')
  return { default: module.LoginDialog }
})

const PublishButton = lazy(async () => {
  const module = await import('@/components/sidebar/PublishButton')
  return { default: module.PublishButton }
})

export function Toolbar() {
  const clipEnabled = useViewerStore((s) => s.clipPlane.enabled)
  const setClipPlane = useViewerStore((s) => s.setClipPlane)
  const presentationMode = useViewerStore((s) => s.presentationMode)
  const setPresentationMode = useViewerStore((s) => s.setPresentationMode)

  const toggleClip = () => setClipPlane({ enabled: !clipEnabled })

  return (
    <div className="flex items-center gap-2 w-full">
      <ViewModeToggle />

      <div className="w-px h-6 bg-border" />

      <ToolButtons />

      <div className="w-px h-6 bg-border" />

      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
             <button
               type="button"
               data-testid="clip-toggle"
               disabled={presentationMode}
               onClick={toggleClip}
                className={cn(
                   'ui-hover-emphasis flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border transition-colors',
                   presentationMode && 'cursor-not-allowed border-subtle text-faint hover:bg-panel hover:text-faint',
                   clipEnabled
                    ? 'bg-accent-soft text-accent border-accent-soft hover:bg-accent-soft'
                    : 'bg-panel text-dim border-subtle hover:text-soft hover:bg-elevated'
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

      {import.meta.env.DEV && (
        <div className="hidden md:flex items-center" data-testid="fps-toolbar-slot-wrapper">
          <div
            id="fps-toolbar-slot"
            className="h-8 w-14 overflow-hidden rounded border border-subtle bg-panel"
          />
        </div>
      )}

      <Suspense fallback={null}>
        <LoginDialog />
        <PublishButton />
      </Suspense>

      <Button
        variant="ghost"
        size="icon"
        data-testid="presentation-mode-btn"
        onClick={() => setPresentationMode(!presentationMode)}
        className="h-9 w-9 rounded-full border border-subtle bg-panel text-dim opacity-75 transition-all duration-200 hover:border-strong hover:bg-elevated hover:text-strong hover:opacity-100"
        title={presentationMode ? 'Exit presentation mode' : 'Enter presentation mode'}
      >
        <Eye size={16} />
      </Button>
    </div>
  )
}
