import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface VimeoEmbedProps {
  videoId: string
  className?: string
  sourceUrl?: string | null
}

interface VimeoOEmbedResponse {
  width?: number
  height?: number
}

const DEFAULT_ASPECT_RATIO = 16 / 9

export function VimeoEmbed({ videoId, className, sourceUrl }: VimeoEmbedProps) {
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

  const publicUrl = sourceUrl?.trim() ? sourceUrl.trim() : `https://vimeo.com/${videoId}`
  const iframeSrc = `https://player.vimeo.com/video/${videoId}?title=0&byline=0&portrait=0&dnt=1&autoplay=0&muted=0&background=0&controls=1&vimeo_logo=0&badge=0`

  return (
    <div
      className={cn('relative w-full overflow-hidden rounded bg-stage', className)}
      style={{ aspectRatio }}
    >
      <iframe
        src={iframeSrc}
        className="absolute inset-0 h-full w-full"
        allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media"
        allowFullScreen
        title="Vimeo video player"
      />
      <div
        className="absolute right-0 top-0 z-10 h-10 w-20"
        onPointerDown={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
        aria-hidden="true"
      >
        <div className="absolute inset-0 rounded-bl-md bg-gradient-to-l from-[var(--stage)] via-[var(--shell)] to-transparent" />
      </div>
      <a
        href={publicUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute right-1 top-1 z-20 flex h-6 w-6 items-center justify-center rounded bg-elevated text-[10px] font-semibold text-strong transition-colors hover:bg-field"
        onClick={(e) => e.stopPropagation()}
        aria-label="Open on Vimeo"
        title="Open on Vimeo"
      >
        V
      </a>
    </div>
  )
}
