import { FileManager } from './FileManager'
import { PropertyPanel, ToolsPanel } from './PropertyPanel'
import { AnnotationManager } from './AnnotationManager'

export function Sidebar() {
  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-3">
        <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Properties</p>
        <PropertyPanel />
      </div>
      <div className="border-t border-zinc-800 p-3">
        <FileManager />
      </div>
      <div className="border-t border-zinc-800 p-3">
        <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Tools</p>
        <ToolsPanel />
      </div>
      <div className="border-t border-zinc-800 p-3">
        <AnnotationManager />
      </div>
    </div>
  )
}
