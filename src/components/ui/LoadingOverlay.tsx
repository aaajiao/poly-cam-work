interface LoadingOverlayProps {
  progress: number
  message?: string
  visible: boolean
}

export function LoadingOverlay({ progress, message, visible }: LoadingOverlayProps) {
  if (!visible) return null

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-zinc-950/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4 w-64">
        <div className="text-zinc-300 text-sm font-medium">
          {message ?? 'Loading...'}
        </div>
        <div className="w-full bg-zinc-800 rounded-full h-2">
          <div
            className="bg-blue-500 h-2 rounded-full transition-all duration-200"
            style={{ width: `${Math.max(2, progress)}%` }}
          />
        </div>
        <div className="text-zinc-500 text-xs">{progress}%</div>
      </div>
    </div>
  )
}
