import { useActiveScene, useViewerStore } from '@/store/viewerStore'

export function StatusBar() {
  const activeScene = useActiveScene()
  const viewMode = useViewerStore((s) => s.viewMode)
  const toolMode = useViewerStore((s) => s.toolMode)
  const isLoading = useViewerStore((s) => s.isLoading)
  const loadingProgress = useViewerStore((s) => s.loadingProgress)

  return (
    <div className="flex items-center gap-4 text-xs text-faint w-full" data-testid="status-bar">
      {isLoading ? (
        <span className="text-accent">Loading... {loadingProgress}%</span>
      ) : (
        <>
          <span className="text-dim">{activeScene?.name ?? 'No scene'}</span>
          <span>|</span>
          <span className="capitalize">{viewMode}</span>
          <span>|</span>
          <span className="capitalize">{toolMode}</span>
        </>
      )}
    </div>
  )
}
