import { useState } from 'react'
import { Play } from 'lucide-react'
import { cn } from '@/lib/utils'

interface VimeoEmbedProps {
  videoId: string
  className?: string
}

export function VimeoEmbed({ videoId, className }: VimeoEmbedProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [thumbError, setThumbError] = useState(false)

  const thumbnailUrl = `https://vumbnail.com/${videoId}.jpg`
  const iframeSrc = `https://player.vimeo.com/video/${videoId}?title=0&byline=0&portrait=0&dnt=1&autoplay=1`

  return (
    <div
      className={cn('relative w-full overflow-hidden rounded', className)}
      style={{ paddingBottom: '56.25%' }}
    >
      {isPlaying ? (
        <iframe
          src={iframeSrc}
          className="absolute inset-0 w-full h-full"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          title="Vimeo video player"
        />
      ) : (
        <div
          className="absolute inset-0 w-full h-full cursor-pointer group"
          onClick={() => setIsPlaying(true)}
        >
          {/* Cover image or fallback */}
          {!thumbError ? (
            <img
              src={thumbnailUrl}
              alt="Video thumbnail"
              className="w-full h-full object-cover"
              onError={() => setThumbError(true)}
            />
          ) : (
            <div className="w-full h-full bg-zinc-800 flex items-center justify-center">
              <Play size={32} className="text-zinc-500" />
            </div>
          )}
          {/* Play button overlay */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-14 h-14 rounded-full bg-black/60 flex items-center justify-center group-hover:bg-black/80 transition-colors">
              <Play size={24} className="text-white ml-1" fill="white" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
