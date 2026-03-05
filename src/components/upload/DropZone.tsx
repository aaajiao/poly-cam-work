import { useState, useCallback, useEffect } from 'react'
import { Upload } from 'lucide-react'
import { useFileUpload } from '@/hooks/useFileUpload'

interface DropZoneProps {
  onError?: (errors: string[]) => void
}

export function DropZone({ onError }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const { processFiles } = useFileUpload()

  const handleDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = e.dataTransfer?.files
    if (!files || files.length === 0) return

    const errors = await processFiles(files)
    if (errors.length > 0 && onError) {
      onError(errors)
    }
  }, [processFiles, onError])

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    if (e.relatedTarget === null) {
      setIsDragging(false)
    }
  }, [])

  useEffect(() => {
    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('dragleave', handleDragLeave)
    window.addEventListener('drop', handleDrop)
    return () => {
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('dragleave', handleDragLeave)
      window.removeEventListener('drop', handleDrop)
    }
  }, [handleDragOver, handleDragLeave, handleDrop])

  if (!isDragging) return null

  return (
    <div
      data-testid="drop-overlay"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/90 backdrop-blur-sm pointer-events-none"
    >
      <div className="flex flex-col items-center gap-3 p-8 border-2 border-dashed border-blue-500 rounded-xl">
        <Upload size={48} className="text-blue-400" />
        <p className="text-blue-300 text-lg font-medium">Drop 3D files here</p>
        <p className="text-zinc-500 text-sm">Supports .glb and .ply files</p>
      </div>
    </div>
  )
}
