import { upload } from '@vercel/blob/client'

interface UploadMetadata {
  annotationId: string
  filename: string
}

interface UploadedImage {
  url: string
  filename: string
}

class VercelBlobImageStorage {
  async upload(blob: Blob, metadata: UploadMetadata): Promise<UploadedImage> {
    const result = await upload(metadata.filename, blob, {
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
