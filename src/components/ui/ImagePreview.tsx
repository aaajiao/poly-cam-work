import { useState, useEffect } from 'react'
import { ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { imageStorage } from '@/storage/imageStorage'

interface ImagePreviewProps {
  imageId: string
  className?: string
  alt?: string
}

export function ImagePreview({ imageId, className, alt = 'Image' }: ImagePreviewProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    let createdUrl: string | null = null

    setLoading(true)
    setError(false)
    setObjectUrl(null)

    const run = async () => {
      try {
        const blob = await imageStorage.get(imageId)
        if (cancelled) return
        if (blob) {
          createdUrl = URL.createObjectURL(blob)
          setObjectUrl(createdUrl)
        } else {
          setError(true)
        }
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    run()

    return () => {
      cancelled = true
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [imageId])

  if (loading) {
    return <div className={cn('bg-zinc-800 animate-pulse rounded', className)} />
  }

  if (error || !objectUrl) {
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

  return <img src={objectUrl} alt={alt} className={cn('rounded object-cover', className)} />
}
