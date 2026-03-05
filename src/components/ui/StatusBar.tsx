import { useActiveScene, useViewerStore } from '@/store/viewerStore'

export function StatusBar() {
  const activeScene = useActiveScene()
  const viewMode = useViewerStore((s) => s.viewMode)
  const toolMode = useViewerStore((s) => s.toolMode)
  const isLoading = useViewerStore((s) => s.isLoading)
  const loadingProgress = useViewerStore((s) => s.loadingProgress)

  return (
    <div className="flex items-center gap-4 text-xs text-zinc-500 w-full" data-testid="status-bar">
      {isLoading ? (
        <span className="text-blue-400">Loading... {loadingProgress}%</span>
      ) : (
        <>
          <span className="text-zinc-400">{activeScene?.name ?? 'No scene'}</span>
          <span>|</span>
          <span className="capitalize">{viewMode}</span>
          <span>|</span>
          <span className="capitalize">{toolMode}</span>
        </>
      )}
    </div>
  )
}
