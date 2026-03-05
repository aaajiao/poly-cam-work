import { useCallback } from 'react'
import { useThree } from '@react-three/fiber'
import { captureScreenshot } from '@/utils/screenshot'
import { useViewerStore } from '@/store/viewerStore'

export function useScreenshot() {
  const { gl } = useThree()
  const activeSceneId = useViewerStore((s) => s.activeSceneId)

  const takeScreenshot = useCallback(() => {
    const sceneName = activeSceneId ?? 'scene'
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    captureScreenshot(gl, `polycam-${sceneName}-${timestamp}.png`)
  }, [gl, activeSceneId])

  return takeScreenshot
}
