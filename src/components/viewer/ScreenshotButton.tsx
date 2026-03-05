import { useEffect } from 'react'
import { useScreenshot } from '@/hooks/useScreenshot'

export function ScreenshotCapture() {
  const takeScreenshot = useScreenshot()

  useEffect(() => {
    ;(window as Window & { __takeScreenshot?: () => void }).__takeScreenshot = takeScreenshot
    return () => {
      delete (window as Window & { __takeScreenshot?: () => void }).__takeScreenshot
    }
  }, [takeScreenshot])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        takeScreenshot()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [takeScreenshot])

  return null
}
