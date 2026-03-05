import { useState } from 'react'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface LayoutProps {
  sidebar?: React.ReactNode
  toolbar?: React.ReactNode
  children?: React.ReactNode
  statusBar?: React.ReactNode
}

export function Layout({ sidebar, toolbar, children, statusBar }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true)

  return (
    <div className="flex h-screen w-screen bg-zinc-950 text-zinc-100 overflow-hidden">
      <aside
        data-testid="sidebar"
        style={{ width: sidebarOpen ? '288px' : '48px' }}
        className="flex flex-col border-r border-zinc-800 flex-shrink-0 transition-all duration-200"
      >
        <div className="flex items-center justify-end p-2 border-b border-zinc-800">
          <Button
            variant="ghost"
            size="icon"
            data-testid="sidebar-toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="h-8 w-8 text-zinc-400 hover:text-zinc-100"
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

      <div className="flex flex-col flex-1 min-w-0">
        <header
          data-testid="toolbar"
          className="h-12 border-b border-zinc-800 flex-shrink-0 flex items-center px-3 gap-2"
        >
          {toolbar}
        </header>

        <main
          data-testid="canvas-container"
          className="flex-1 relative overflow-hidden"
        >
          {children}
        </main>

        <footer
          data-testid="statusbar"
          className="h-8 border-t border-zinc-800 flex-shrink-0 text-xs px-3 flex items-center text-zinc-500 gap-4"
        >
          {statusBar ?? <span>Ready</span>}
        </footer>
      </div>
    </div>
  )
}
