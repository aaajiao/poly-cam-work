import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface VimeoEmbedProps {
  videoId: string
  className?: string
}

interface VimeoOEmbedResponse {
  width?: number
  height?: number
}

const DEFAULT_ASPECT_RATIO = 16 / 9

export function VimeoEmbed({ videoId, className }: VimeoEmbedProps) {
  const [aspectRatio, setAspectRatio] = useState(DEFAULT_ASPECT_RATIO)

  useEffect(() => {
    const controller = new AbortController()

    const loadAspectRatio = async () => {
      try {
        const videoUrl = encodeURIComponent(`https://vimeo.com/${videoId}`)
        const response = await fetch(`https://vimeo.com/api/oembed.json?url=${videoUrl}`, {
          signal: controller.signal,
        })
        if (!response.ok) {
          setAspectRatio(DEFAULT_ASPECT_RATIO)
          return
        }

        const data = (await response.json()) as VimeoOEmbedResponse
        if (data.width && data.height && data.height > 0) {
          setAspectRatio(data.width / data.height)
          return
        }

        setAspectRatio(DEFAULT_ASPECT_RATIO)
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }

        setAspectRatio(DEFAULT_ASPECT_RATIO)
      }
    }

    void loadAspectRatio()
    return () => controller.abort()
  }, [videoId])

  const iframeSrc = `https://player.vimeo.com/video/${videoId}?title=0&byline=0&portrait=0&dnt=1`

  return (
    <div
      className={cn('relative w-full overflow-hidden rounded bg-black', className)}
      style={{ aspectRatio }}
    >
      <iframe
        src={iframeSrc}
        className="absolute inset-0 h-full w-full"
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
        title="Vimeo video player"
      />
    </div>
  )
}
