import { FileManager } from './FileManager'
import { PropertyPanel } from './PropertyPanel'

export function Sidebar() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 p-3 overflow-y-auto">
        <FileManager />
      </div>
      <div className="border-t border-zinc-800 p-3">
        <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Properties</p>
        <PropertyPanel />
      </div>
    </div>
  )
}
