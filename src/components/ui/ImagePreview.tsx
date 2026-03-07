import { ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ImagePreviewProps {
  imageUrl: string
  className?: string
  alt?: string
}

export function ImagePreview({ imageUrl, className, alt = 'Image' }: ImagePreviewProps) {
  if (!imageUrl) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-zinc-800 rounded text-zinc-600',
          className
        )}
      >
        <ImageIcon size={24} />
      </div>
    )
  }

  return <img src={imageUrl} alt={alt} className={cn('rounded object-cover', className)} />
}
