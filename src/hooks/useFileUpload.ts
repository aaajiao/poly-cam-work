import { useCallback } from 'react'
import { useViewerStore } from '@/store/viewerStore'
import type { ScanScene } from '@/types'

const SUPPORTED_EXTENSIONS = ['.glb', '.gltf', '.ply']
const MAX_FILE_SIZE = 500 * 1024 * 1024

function getFileExtension(filename: string): string {
  return filename.toLowerCase().slice(filename.lastIndexOf('.'))
}

export function useFileUpload() {
  const addUploadedScene = useViewerStore((s) => s.addUploadedScene)

  const processFile = useCallback(async (file: File): Promise<{ success: boolean; error?: string }> => {
    const ext = getFileExtension(file.name)

    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      return { success: false, error: `Unsupported format: ${ext}. Use .glb or .ply` }
    }

    if (file.size > MAX_FILE_SIZE) {
      return { success: false, error: `File too large: ${(file.size / 1024 / 1024).toFixed(0)}MB (max 500MB)` }
    }

    const objectUrl = URL.createObjectURL(file)
    const id = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const name = file.name.replace(/\.[^.]+$/, '')

    let scene: ScanScene

    if (ext === '.glb' || ext === '.gltf') {
      const buffer = await file.arrayBuffer()
      const magic = new Uint8Array(buffer, 0, 4)
      const isGLB = magic[0] === 0x67 && magic[1] === 0x6C && magic[2] === 0x54 && magic[3] === 0x46
      if (!isGLB && ext === '.glb') {
        URL.revokeObjectURL(objectUrl)
        return { success: false, error: 'Invalid GLB file (bad magic bytes)' }
      }
      scene = { id, name, glbUrl: objectUrl, plyUrl: '' }
    } else {
      const buffer = await file.arrayBuffer()
      const header = new TextDecoder('ascii').decode(new Uint8Array(buffer, 0, 20))
      if (!header.startsWith('ply')) {
        URL.revokeObjectURL(objectUrl)
        return { success: false, error: 'Invalid PLY file (missing ply header)' }
      }
      scene = { id, name, glbUrl: '', plyUrl: objectUrl }
    }

    addUploadedScene(scene)
    return { success: true }
  }, [addUploadedScene])

  const processFiles = useCallback(async (files: FileList | File[]): Promise<string[]> => {
    const errors: string[] = []
    for (const file of Array.from(files)) {
      const result = await processFile(file)
      if (!result.success && result.error) {
        errors.push(`${file.name}: ${result.error}`)
      }
    }
    return errors
  }, [processFile])

  return { processFiles }
}
