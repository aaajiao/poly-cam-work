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
  key: string
  url: string
  filename: string
}

function isRemoteImage(image: AnnotationImage): image is Extract<AnnotationImage, { url: string }> {
  return 'url' in image && typeof image.url === 'string' && image.url.length > 0
}

function isLocalImage(image: AnnotationImage): image is Extract<AnnotationImage, { localId: string }> {
  return 'localId' in image && typeof image.localId === 'string' && image.localId.length > 0
}

function imageKey(image: AnnotationImage): string {
  return isRemoteImage(image) ? `remote:${image.url}` : `local:${image.localId}`
}

function isGifFilename(filename: string): boolean {
  return /\.gif$/i.test(filename.trim())
}

function isGifFile(file: File): boolean {
  return file.type === 'image/gif' || isGifFilename(file.name)
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
    const objectUrls: string[] = []

    const loadThumbs = async () => {
      const nextThumbnails: ThumbnailEntry[] = []

      for (const image of images) {
        if (cancelled) break

        if (isRemoteImage(image)) {
          nextThumbnails.push({
            key: imageKey(image),
            url: image.url,
            filename: image.filename,
          })
          continue
        }

        if (!isLocalImage(image)) continue

        const sourceBlob = isGifFilename(image.filename)
          ? await imageStorage.get(image.localId)
          : (await imageStorage.getThumbnail(image.localId)) ?? (await imageStorage.get(image.localId))
        if (!sourceBlob || cancelled) continue

        const localUrl = URL.createObjectURL(sourceBlob)
        objectUrls.push(localUrl)
        nextThumbnails.push({
          key: imageKey(image),
          url: localUrl,
          filename: image.filename,
        })
      }

      if (!cancelled) {
        setThumbnails(nextThumbnails)
      } else {
        for (const objectUrl of objectUrls) {
          URL.revokeObjectURL(objectUrl)
        }
      }
    }

    void loadThumbs()

    return () => {
      cancelled = true
      for (const objectUrl of objectUrls) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [images])

  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files).filter((file) => file.type.startsWith('image/'))
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
          const imageBlob = isGifFile(file)
            ? file
            : await compressImage(file, 1 * 1024 * 1024)
          const localId = `img-${Date.now()}-${Math.random().toString(36).slice(2)}`
          await imageStorage.save(localId, imageBlob, {
            annotationId,
            filename: file.name,
          })
          newImages.push({
            filename: file.name,
            localId,
          })
        } catch (uploadError) {
          if (uploadError instanceof Error) {
            errors.push(`${file.name}: ${uploadError.message}`)
          } else {
            errors.push(`${file.name}: save failed`)
          }
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
    (event: React.DragEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()
      setIsDragging(false)
      if (atLimit) return
      void processFiles(event.dataTransfer.files)
    },
    [atLimit, processFiles]
  )

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()
      if (!atLimit) setIsDragging(true)
    },
    [atLimit]
  )

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault()
    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
      setIsDragging(false)
    }
  }, [])

  const handleClick = useCallback(() => {
    if (!atLimit) fileInputRef.current?.click()
  }, [atLimit])

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files
      if (files && files.length > 0) {
        void processFiles(files)
        event.target.value = ''
      }
    },
    [processFiles]
  )

  const handleDelete = useCallback(
    async (targetKey: string) => {
      const targetImage = images.find((image) => imageKey(image) === targetKey)
      if (!targetImage) return

      if (isLocalImage(targetImage)) {
        await imageStorage.delete(targetImage.localId).catch(console.error)
      }

      onImagesChange(images.filter((image) => imageKey(image) !== targetKey))
    },
    [images, onImagesChange]
  )

  return (
    <div className="space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        data-testid="image-file-input"
        onChange={handleFileChange}
      />
      <button
        type="button"
        data-testid="image-upload-zone"
        aria-label={atLimit ? `Maximum ${maxImages} images reached` : 'Upload annotation images'}
        disabled={atLimit || isUploading}
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          'border-2 border-dashed border-subtle rounded-lg bg-panel p-4 text-center transition-colors',
          isDragging && 'border-accent-soft bg-accent-soft',
          (atLimit || isUploading) && 'cursor-not-allowed opacity-50',
          !atLimit && !isDragging && !isUploading && 'cursor-pointer hover:border-strong'
        )}
      >
        {isUploading ? (
          <div className="flex items-center justify-center gap-2 text-dim">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-xs">Saving locally…</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <Upload size={16} className="text-faint" />
            <p className="text-xs text-dim">
              {atLimit
                ? `Maximum ${maxImages} images reached`
                : 'Drop images here or click to browse'}
            </p>
            {!atLimit && (
               <p className="text-[11px] text-faint">
                {images.length}/{maxImages} · local save first · max 10MB each
              </p>
            )}
          </div>
        )}
      </button>

      {error && (
        <p className="text-xs text-danger" data-testid="image-upload-error">
          {error}
        </p>
      )}

      {thumbnails.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mt-2" data-testid="image-thumbnail-grid">
          {thumbnails.map((thumbnail) => (
            <div
              key={thumbnail.key}
              className="relative aspect-square rounded overflow-hidden bg-field"
            >
              <img
                src={thumbnail.url}
                alt={thumbnail.filename}
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                data-testid={`delete-image-${thumbnail.key}`}
                aria-label={`Delete ${thumbnail.filename}`}
                onClick={(event) => {
                  event.stopPropagation()
                  void handleDelete(thumbnail.key)
                }}
                className="absolute top-1 right-1 rounded bg-elevated p-0.5 text-dim hover:text-danger transition-colors"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
