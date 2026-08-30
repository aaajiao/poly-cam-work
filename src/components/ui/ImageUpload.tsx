import { useState, useCallback, useRef, useEffect } from 'react'
import { Upload, X, Loader2 } from 'lucide-react'

import { cn } from '@/lib/utils'
import { imageStorage } from '@/storage/imageStorage'
import type { AnnotationImage } from '@/types'
import {
  MAX_SOURCE_IMAGE_BYTES,
  prepareImageForStorage,
  resolveImageMimeType,
  SUPPORTED_IMAGE_MIME_TYPES,
} from '@/utils/imageProcessing'

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
  // Track the latest images/upload state so concurrent drops compute the final
  // list from current data instead of a stale render-time closure.
  const imagesRef = useRef(images)
  imagesRef.current = images
  const isUploadingRef = useRef(false)

  const atLimit = images.length >= maxImages

  useEffect(() => {
    let cancelled = false
    const objectUrls = new Set<string>()
    const revokeObjectUrls = () => {
      for (const objectUrl of objectUrls) {
        URL.revokeObjectURL(objectUrl)
      }
      objectUrls.clear()
    }

    const loadThumbs = async () => {
      const nextThumbnails: ThumbnailEntry[] = []

      for (const image of images) {
        if (cancelled) break
        let localUrl: string | null = null

        try {
          if (isRemoteImage(image)) {
            nextThumbnails.push({
              key: imageKey(image),
              url: image.url,
              filename: image.filename,
            })
            continue
          }

          if (!isLocalImage(image)) continue

          let sourceBlob: Blob | null
          if (isGifFilename(image.filename)) {
            sourceBlob = await imageStorage.get(image.localId)
          } else {
            sourceBlob = await imageStorage.getThumbnail(image.localId)
            if (!sourceBlob && !cancelled) {
              sourceBlob = await imageStorage.get(image.localId)
            }
          }
          if (!sourceBlob || cancelled) continue

          localUrl = URL.createObjectURL(sourceBlob)
          objectUrls.add(localUrl)
          nextThumbnails.push({
            key: imageKey(image),
            url: localUrl,
            filename: image.filename,
          })
        } catch (loadError) {
          if (localUrl) {
            URL.revokeObjectURL(localUrl)
            objectUrls.delete(localUrl)
          }
          if (!cancelled) {
            console.error(`Failed to load image thumbnail: ${image.filename}`, loadError)
          }
        }
      }

      if (!cancelled) {
        setThumbnails(nextThumbnails)
      } else {
        revokeObjectUrls()
      }
    }

    void loadThumbs()

    return () => {
      cancelled = true
      revokeObjectUrls()
    }
  }, [images])

  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      if (isUploadingRef.current) return

      const selectedFiles = Array.from(files)
      if (selectedFiles.length === 0) return

      const fileArray = selectedFiles.filter((file) => resolveImageMimeType(file))
      const unsupportedErrors = selectedFiles
        .filter((file) => !resolveImageMimeType(file))
        .map(
          (file) =>
            `${file.name}: unsupported image type; use JPEG, PNG, WebP, or GIF`
        )
      if (fileArray.length === 0) {
        setError(unsupportedErrors.join('; '))
        return
      }

      const available = maxImages - imagesRef.current.length
      if (available <= 0) return
      const toProcess = fileArray.slice(0, available)

      setError(null)
      isUploadingRef.current = true
      setIsUploading(true)

      const newImages: AnnotationImage[] = []
      const errors = [...unsupportedErrors]

      for (const file of toProcess) {
        if (file.size > MAX_SOURCE_IMAGE_BYTES) {
          errors.push(`${file.name}: exceeds 10MB limit`)
          continue
        }

        try {
          const imageBlob = await prepareImageForStorage(file)
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

      isUploadingRef.current = false
      setIsUploading(false)

      if (errors.length > 0) {
        setError(errors.join('; '))
      }

      if (newImages.length > 0) {
        onImagesChange([...imagesRef.current, ...newImages])
      }
    },
    [annotationId, maxImages, onImagesChange]
  )

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()
      setIsDragging(false)
      if (atLimit || isUploadingRef.current) return
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
        accept={SUPPORTED_IMAGE_MIME_TYPES.join(',')}
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
                {images.length}/{maxImages} · local first · max 10MB · large images optimized
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
