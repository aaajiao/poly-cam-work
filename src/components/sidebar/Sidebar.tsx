export function Sidebar() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 p-3">
        <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Scans</p>
        <div className="space-y-1" data-testid="scan-list" />
      </div>
      <div className="border-t border-zinc-800 p-3">
        <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Properties</p>
        <div data-testid="property-panel" />
      </div>
    </div>
  )
}
