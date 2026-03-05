import { useState, useCallback, useRef, useEffect } from 'react'
import { Upload, X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { imageStorage } from '@/storage/imageStorage'
import type { AnnotationImage } from '@/types'

interface ImageUploadProps {
  annotationId: string
  images: AnnotationImage[]
  onImagesChange: (images: AnnotationImage[]) => void
  maxImages?: number
}

interface ThumbnailEntry {
  imageId: string
  url: string
}

async function compressImage(file: File, maxBytes: number): Promise<Blob> {
  if (file.size <= maxBytes) return file

  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      const ratio = Math.sqrt(maxBytes / file.size)
      canvas.width = Math.round(img.width * ratio)
      canvas.height = Math.round(img.height * ratio)
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Canvas unavailable'))
        return
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Compression failed'))),
        'image/jpeg',
        0.85
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Load failed'))
    }
    img.src = url
  })
}

export function ImageUpload({
  annotationId,
  images,
  onImagesChange,
  maxImages = 10,
}: ImageUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [thumbnails, setThumbnails] = useState<ThumbnailEntry[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const atLimit = images.length >= maxImages

  useEffect(() => {
    let cancelled = false
    const createdUrls: string[] = []

    const loadThumbs = async () => {
      const entries: ThumbnailEntry[] = []
      for (const img of images) {
        if (cancelled) break
        const blob = await imageStorage.getThumbnail(img.id)
        // Check again after await — cleanup may have run while we were waiting
        if (!cancelled && blob) {
          const url = URL.createObjectURL(blob)
          createdUrls.push(url)
          entries.push({ imageId: img.id, url })
        }
      }
      if (!cancelled) {
        setThumbnails(entries)
      } else {
        // Async was cancelled after creating some URLs — revoke them
        for (const url of createdUrls) URL.revokeObjectURL(url)
      }
    }

    loadThumbs().catch(console.error)

    return () => {
      cancelled = true
      // Revoke any URLs created before cancellation
      for (const url of createdUrls) URL.revokeObjectURL(url)
    }
  }, [images])

  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files).filter((f) => f.type.startsWith('image/'))
      if (fileArray.length === 0) return

      const available = maxImages - images.length
      const toProcess = fileArray.slice(0, available)

      setError(null)
      setIsUploading(true)

      const newImages: AnnotationImage[] = []
      const errors: string[] = []

      for (const file of toProcess) {
        if (file.size > 10 * 1024 * 1024) {
          errors.push(`${file.name}: exceeds 10MB limit`)
          continue
        }
        try {
          const compressed = await compressImage(file, 1 * 1024 * 1024)
          const id = `img-${Date.now()}-${Math.random().toString(36).slice(2)}`
          await imageStorage.save(id, compressed, { annotationId, filename: file.name })
          newImages.push({ id, filename: file.name, thumbnailId: `thumb-${id}` })
        } catch (err) {
          if (err instanceof DOMException && err.name === 'QuotaExceededError') {
            errors.push(`${file.name}: storage full — delete some images to free space`)
          } else {
            errors.push(`${file.name}: upload failed`)
          }
          console.error(err)
        }
      }

      setIsUploading(false)

      if (errors.length > 0) {
        setError(errors.join('; '))
      }

      if (newImages.length > 0) {
        onImagesChange([...images, ...newImages])
      }
    },
    [annotationId, images, maxImages, onImagesChange]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)
      if (atLimit) return
      processFiles(e.dataTransfer.files)
    },
    [atLimit, processFiles]
  )

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      if (!atLimit) setIsDragging(true)
    },
    [atLimit]
  )

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false)
    }
  }, [])

  const handleClick = useCallback(() => {
    if (!atLimit) fileInputRef.current?.click()
  }, [atLimit])

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (files && files.length > 0) {
        processFiles(files)
        e.target.value = ''
      }
    },
    [processFiles]
  )

  const handleDelete = useCallback(
    async (imageId: string) => {
      try {
        await imageStorage.delete(imageId)
        onImagesChange(images.filter((img) => img.id !== imageId))
      } catch (err) {
        console.error(err)
      }
    },
    [images, onImagesChange]
  )

  return (
    <div className="space-y-2">
      <div
        data-testid="image-upload-zone"
        role="button"
        tabIndex={atLimit ? -1 : 0}
        aria-disabled={atLimit}
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') handleClick()
        }}
        className={cn(
          'border-2 border-dashed border-zinc-600 rounded-lg p-4 text-center cursor-pointer transition-colors',
          isDragging && 'border-blue-500 bg-blue-500/10',
          atLimit && 'opacity-50 cursor-not-allowed',
          !atLimit && !isDragging && 'hover:border-zinc-400',
          isUploading && 'opacity-70 pointer-events-none'
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          data-testid="image-file-input"
          onChange={handleFileChange}
        />
        {isUploading ? (
          <div className="flex items-center justify-center gap-2 text-zinc-400">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-xs">Uploading…</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <Upload size={16} className="text-zinc-500" />
            <p className="text-xs text-zinc-400">
              {atLimit
                ? `Maximum ${maxImages} images reached`
                : 'Drop images here or click to browse'}
            </p>
            {!atLimit && (
              <p className="text-[11px] text-zinc-600">
                {images.length}/{maxImages} · max 10MB each
              </p>
            )}
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-400" data-testid="image-upload-error">
          {error}
        </p>
      )}

      {thumbnails.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mt-2" data-testid="image-thumbnail-grid">
          {thumbnails.map(({ imageId, url }) => {
            const imageData = images.find((img) => img.id === imageId)
            return (
              <div
                key={imageId}
                className="relative aspect-square rounded overflow-hidden bg-zinc-800"
              >
                <img
                  src={url}
                  alt={imageData?.filename ?? 'Uploaded image'}
                  className="w-full h-full object-cover"
                />
                <button
                  data-testid={`delete-image-${imageId}`}
                  aria-label={`Delete ${imageData?.filename ?? 'image'}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDelete(imageId)
                  }}
                  className="absolute top-1 right-1 bg-zinc-900/80 rounded p-0.5 text-zinc-400 hover:text-red-400 transition-colors"
                >
                  <X size={12} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
