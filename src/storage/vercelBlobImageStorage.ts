import { upload } from '@vercel/blob/client'

interface UploadMetadata {
  annotationId: string
  filename: string
}

interface UploadedImage {
  url: string
  filename: string
}

function sanitizeFilename(filename: string) {
  const trimmed = filename.trim()
  const fallback = 'image.jpg'
  if (trimmed.length === 0) return fallback

  const lastDot = trimmed.lastIndexOf('.')
  const hasExt = lastDot > 0 && lastDot < trimmed.length - 1
  const base = hasExt ? trimmed.slice(0, lastDot) : trimmed
  const ext = hasExt ? trimmed.slice(lastDot + 1) : 'jpg'

  const safeBase = base.replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  const safeExt = ext.replace(/[^a-zA-Z0-9]+/g, '').toLowerCase() || 'jpg'
  const normalizedBase = safeBase.length > 0 ? safeBase : 'image'

  return `${normalizedBase}.${safeExt}`
}

class VercelBlobImageStorage {
  async upload(blob: Blob, metadata: UploadMetadata): Promise<UploadedImage> {
    const pathname = `${Date.now()}-${sanitizeFilename(metadata.filename)}`

    const result = await upload(pathname, blob, {
      access: 'public',
      handleUploadUrl: '/api/media/upload',
      clientPayload: JSON.stringify({ annotationId: metadata.annotationId }),
    })

    return {
      url: result.url,
      filename: metadata.filename,
    }
  }
}

export const vercelBlobImageStorage = new VercelBlobImageStorage()
