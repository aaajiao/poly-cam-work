import { upload } from '@vercel/blob/client'

type ModelFileKind = 'glb' | 'ply'

function sanitizeSegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function extensionFromFilename(filename: string, fallback: string) {
  const dotIndex = filename.lastIndexOf('.')
  if (dotIndex <= 0 || dotIndex === filename.length - 1) {
    return fallback
  }

  const ext = filename.slice(dotIndex + 1).toLowerCase().replace(/[^a-z0-9]+/g, '')
  return ext.length > 0 ? ext : fallback
}

class VercelBlobModelStorage {
  async upload(file: File, params: { sceneKey: string; kind: ModelFileKind }): Promise<string> {
    const sceneKey = sanitizeSegment(params.sceneKey) || `scene-${Date.now()}`
    const ext = extensionFromFilename(file.name, params.kind)
    const pathname = `models/${sceneKey}/${params.kind}-${Date.now()}.${ext}`

    const result = await upload(pathname, file, {
      access: 'public',
      handleUploadUrl: '/api/models/upload',
      clientPayload: JSON.stringify({
        kind: params.kind,
        sceneKey,
      }),
    })

    return result.url
  }
}

export const vercelBlobModelStorage = new VercelBlobModelStorage()
