import type { WebGLRenderer } from 'three'

export function captureScreenshot(
  gl: WebGLRenderer,
  filename?: string
): void {
  // preserveDrawingBuffer must be true on Canvas (set in SceneCanvas)
  const dataUrl = gl.domElement.toDataURL('image/png')
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = filename ?? `polycam-${Date.now()}.png`
  link.click()
}
