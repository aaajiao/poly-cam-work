import { useEffect } from 'react'
import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useViewerStore } from '@/store/viewerStore'

interface LayoutProps {
  sidebar?: React.ReactNode
  toolbar?: React.ReactNode
  children?: React.ReactNode
  statusBar?: React.ReactNode
}

export function Layout({ sidebar, toolbar, children, statusBar }: LayoutProps) {
  const sidebarOpen = useViewerStore((s) => s.sidebarOpen)
  const setSidebarOpen = useViewerStore((s) => s.setSidebarOpen)
  const presentationMode = useViewerStore((s) => s.presentationMode)
  const setPresentationMode = useViewerStore((s) => s.setPresentationMode)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !presentationMode) return
      event.preventDefault()
      event.stopImmediatePropagation()
      setPresentationMode(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [presentationMode, setPresentationMode])

  return (
    <div className="flex h-screen w-screen bg-zinc-950 text-zinc-100 overflow-hidden">
      {!presentationMode && (
        <aside
          data-testid="sidebar"
          style={{ width: sidebarOpen ? '288px' : '48px' }}
          className="flex flex-col border-r border-zinc-800 flex-shrink-0 transition-all duration-200 z-10 relative"
        >
          <div className={`flex items-center p-2 border-b border-zinc-800 ${sidebarOpen ? 'justify-end' : 'justify-center'}`}>
            <Button
              variant="ghost"
              size="icon"
              data-testid="sidebar-toggle"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className={`h-8 w-8 ${sidebarOpen ? 'text-zinc-400 hover:text-zinc-100' : 'text-zinc-300 hover:text-zinc-100 bg-zinc-800 hover:bg-zinc-700'}`}
            >
              {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
            </Button>
          </div>
          {sidebarOpen && (
            <div className="flex-1 overflow-y-auto">
              {sidebar}
            </div>
          )}
        </aside>
      )}

      <div className="flex flex-col flex-1 min-w-0">
        {!presentationMode && (
          <header
            data-testid="toolbar"
            className="h-12 border-b border-zinc-800 flex-shrink-0 flex items-center px-3 gap-2"
          >
            {toolbar}
          </header>
        )}

        <main
          data-testid="canvas-container"
          className="flex-1 relative overflow-hidden"
        >
          {children}
          {presentationMode && (
            <Button
              variant="ghost"
              size="sm"
              data-testid="presentation-exit-btn"
              aria-label="Exit presentation mode"
              onClick={() => setPresentationMode(false)}
              className="absolute right-3 top-3 z-20 h-9 w-9 rounded-full border border-zinc-700/80 bg-zinc-900/60 p-0 text-zinc-400 opacity-75 backdrop-blur-sm transition-all duration-200 hover:border-zinc-600 hover:bg-zinc-800 hover:text-zinc-100 hover:opacity-100"
              title="Exit presentation mode"
            >
              <X size={14} />
            </Button>
          )}
        </main>

        {!presentationMode && (
          <footer
            data-testid="statusbar"
            className="h-8 border-t border-zinc-800 flex-shrink-0 text-xs px-3 flex items-center text-zinc-500 gap-4"
          >
            {statusBar ?? <span>Ready</span>}
          </footer>
        )}
      </div>
    </div>
  )
}
