import { useEffect } from 'react'
import { Camera } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ViewModeToggle } from './ViewModeToggle'
import { ToolButtons } from './ToolButtons'
import { useViewerStore } from '@/store/viewerStore'

export function Toolbar() {
  const setToolMode = useViewerStore((s) => s.setToolMode)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      switch (e.key.toLowerCase()) {
        case 'o': setToolMode('orbit'); break
        case 'm': setToolMode('measure'); break
        case 'c': setToolMode('clip'); break
        case 'a': setToolMode('annotate'); break
        case 'escape': setToolMode('orbit'); break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setToolMode])

  const handleScreenshot = () => {
    const fn = (window as Window & { __takeScreenshot?: () => void }).__takeScreenshot
    if (fn) fn()
  }

  return (
    <div className="flex items-center gap-2 w-full">
      <ViewModeToggle />

      <div className="w-px h-6 bg-zinc-700" />

      <ToolButtons />

      <div className="flex-1" />

      <Button
        variant="ghost"
        size="icon"
        data-testid="screenshot-btn"
        onClick={handleScreenshot}
        className="h-8 w-8 text-zinc-400 hover:text-zinc-100"
        title="Screenshot (Ctrl+S)"
      >
        <Camera size={16} />
      </Button>
    </div>
  )
}
