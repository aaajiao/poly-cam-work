import { upload } from '@vercel/blob/client'

import { normalizeImageMimeType } from '@/utils/imageProcessing'

// Generous ceiling: annotation media is small, but a hung connection must not
// wait forever. Uploads normally finish in seconds; this only bounds the stall.
const UPLOAD_TIMEOUT_MS = 15 * 60 * 1000

interface UploadMetadata {
  sceneId: string
  annotationId: string
  filename: string
}

interface UploadedImage {
  url: string
  filename: string
}

function extensionForContentType(contentType: string): string {
  switch (contentType) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    case 'image/gif':
      return 'gif'
    default:
      throw new Error('Unsupported image type. Use JPEG, PNG, WebP, or GIF.')
  }
}

function sanitizeFilename(filename: string, contentType: string) {
  const trimmed = filename.trim()
  const extension = extensionForContentType(contentType)
  if (trimmed.length === 0) return `image.${extension}`

  const lastDot = trimmed.lastIndexOf('.')
  const hasExt = lastDot > 0
  const base = hasExt ? trimmed.slice(0, lastDot) : trimmed

  const safeBase = base
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  const normalizedBase = safeBase.length > 0 ? safeBase : 'image'

  return `${normalizedBase}.${extension}`
}

function sanitizeSegment(value: string, fallback: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  return normalized.length > 0 ? normalized : fallback
}

class VercelBlobImageStorage {
  async upload(blob: Blob, metadata: UploadMetadata): Promise<UploadedImage> {
    const contentType = normalizeImageMimeType(blob.type)
    if (!contentType) {
      throw new Error('Unsupported image type. Use JPEG, PNG, WebP, or GIF.')
    }

    const sceneId = sanitizeSegment(metadata.sceneId, `scene-${Date.now()}`)
    const annotationId = sanitizeSegment(
      metadata.annotationId,
      `annotation-${Date.now()}`
    )
    const filename = sanitizeFilename(metadata.filename, contentType)
    const pathname = `scenes/${sceneId}/images/${annotationId}/${Date.now()}-${filename}`

    const result = await upload(pathname, blob, {
      access: 'public',
      contentType,
      handleUploadUrl: '/api/media/upload',
      abortSignal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
      clientPayload: JSON.stringify({
        sceneId,
        annotationId,
      }),
    })

    return {
      url: result.url,
      filename: metadata.filename,
    }
  }
}

export const vercelBlobImageStorage = new VercelBlobImageStorage()
