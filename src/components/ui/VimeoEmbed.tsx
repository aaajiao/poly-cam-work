import { cn } from '@/lib/utils'

interface VimeoEmbedProps {
  videoId: string
  className?: string
}

export function VimeoEmbed({ videoId, className }: VimeoEmbedProps) {
  return (
    <div
      className={cn('relative w-full overflow-hidden rounded', className)}
      style={{ paddingBottom: '56.25%' }}
    >
      <iframe
        src={`https://player.vimeo.com/video/${videoId}`}
        className="absolute inset-0 w-full h-full"
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
        title="Vimeo video player"
      />
    </div>
  )
}
