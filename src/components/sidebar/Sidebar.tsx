import { lazy, Suspense } from 'react'
import { PropertyPanel, ToolsPanel } from './PropertyPanel'

const FileManager = lazy(async () => {
  const module = await import('./FileManager')
  return { default: module.FileManager }
})

const AnnotationManager = lazy(async () => {
  const module = await import('./AnnotationManager')
  return { default: module.AnnotationManager }
})

export function Sidebar() {
  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-3">
        <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Properties</p>
        <PropertyPanel />
      </div>
      <div className="border-t border-zinc-800 p-3">
        <Suspense fallback={null}>
          <FileManager />
        </Suspense>
      </div>
      <div className="border-t border-zinc-800 p-3">
        <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Tools</p>
        <ToolsPanel />
      </div>
      <div className="border-t border-zinc-800 p-3">
        <Suspense fallback={null}>
          <AnnotationManager />
        </Suspense>
      </div>
    </div>
  )
}
