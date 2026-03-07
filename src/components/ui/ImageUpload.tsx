import { useState, useCallback, useRef } from 'react'
import { Upload, X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { vercelBlobImageStorage } from '@/storage/vercelBlobImageStorage'
import { useViewerStore } from '@/store/viewerStore'
import type { AnnotationImage } from '@/types'

interface ImageUploadProps {
  annotationId: string
  images: AnnotationImage[]
  onImagesChange: (images: AnnotationImage[]) => void
  maxImages?: number
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
  const isAuthenticated = useViewerStore((state) => state.isAuthenticated)
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const atLimit = images.length >= maxImages
  const uploadBlocked = !isAuthenticated

  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      if (uploadBlocked) {
        setError('Please login first to upload images')
        return
      }

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
          const uploaded = await vercelBlobImageStorage.upload(compressed, {
            annotationId,
            filename: file.name,
          })
          newImages.push(uploaded)
        } catch (err) {
          if (err instanceof Error) {
            errors.push(`${file.name}: ${err.message}`)
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
    [annotationId, images, maxImages, onImagesChange, uploadBlocked]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)
      if (atLimit || uploadBlocked) return
      processFiles(e.dataTransfer.files)
    },
    [atLimit, processFiles, uploadBlocked]
  )

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      if (!atLimit && !uploadBlocked) setIsDragging(true)
    },
    [atLimit, uploadBlocked]
  )

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false)
    }
  }, [])

  const handleClick = useCallback(() => {
    if (!atLimit && !uploadBlocked) fileInputRef.current?.click()
  }, [atLimit, uploadBlocked])

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
      onImagesChange(images.filter((img) => img.url !== imageId))
    },
    [images, onImagesChange]
  )

  return (
    <div className="space-y-2">
      <div
        data-testid="image-upload-zone"
        role="button"
        tabIndex={atLimit || uploadBlocked ? -1 : 0}
        aria-disabled={atLimit || uploadBlocked}
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
          uploadBlocked && 'opacity-50 cursor-not-allowed',
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
              {uploadBlocked
                ? 'Login required before image upload'
                : atLimit
                ? `Maximum ${maxImages} images reached`
                : 'Drop images here or click to browse'}
            </p>
            {!atLimit && !uploadBlocked && (
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

      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mt-2" data-testid="image-thumbnail-grid">
          {images.map((image) => {
            return (
              <div
                key={image.url}
                className="relative aspect-square rounded overflow-hidden bg-zinc-800"
              >
                <img
                  src={image.url}
                  alt={image.filename}
                  className="w-full h-full object-cover"
                />
                <button
                  data-testid={`delete-image-${image.url}`}
                  aria-label={`Delete ${image.filename}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDelete(image.url)
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
