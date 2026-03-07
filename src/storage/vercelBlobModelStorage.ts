import { upload } from '@vercel/blob/client'

type ModelFileKind = 'glb' | 'ply'

function defaultFilename(kind: ModelFileKind) {
  return kind === 'glb' ? 'model.glb' : 'model.ply'
}

function contentTypeForKind(kind: ModelFileKind) {
  return kind === 'glb' ? 'model/gltf-binary' : 'application/octet-stream'
}

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
    const normalizedFile = new File([file], file.name, {
      type: contentTypeForKind(params.kind),
    })

    const result = await upload(pathname, normalizedFile, {
      access: 'public',
      handleUploadUrl: '/api/models/upload',
      clientPayload: JSON.stringify({
        kind: params.kind,
        sceneKey,
      }),
    })

    return result.url
  }

  async uploadFromUrl(url: string, params: { sceneKey: string; kind: ModelFileKind }): Promise<string> {
    const response = await fetch(url, {
      credentials: 'omit',
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch model asset: ${url}`)
    }

    const blob = await response.blob()
    const pathname = new URL(url, window.location.origin).pathname
    const nameSegment = pathname.split('/').filter(Boolean).pop() ?? defaultFilename(params.kind)
    const file = new File([blob], nameSegment, {
      type: contentTypeForKind(params.kind),
    })

    return this.upload(file, params)
  }
}

export const vercelBlobModelStorage = new VercelBlobModelStorage()
