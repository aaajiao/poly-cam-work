import type {
  Annotation,
  AnnotationImage,
  SceneDraft,
} from '@/types'

type LegacyAnnotationImage = {
  filename?: string
  url?: string
  id?: string
  localId?: string
}

export interface LocalDraftImageFileRecord {
  filename: string
  kind: 'remote' | 'embedded'
  url?: string
  dataUrl?: string
}

export interface LocalDraftAnnotationFileRecord {
  id: string
  position: [number, number, number]
  normal?: [number, number, number]
  title: string
  description: string
  images: LocalDraftImageFileRecord[]
  videoUrl: string | null
  links: { url: string; label: string }[]
  createdAt: number
  color?: string
}

export interface LocalDraftFileRecord {
  version: 1
  sceneId: string
  exportedAt: number
  annotations: LocalDraftAnnotationFileRecord[]
}

export function sceneAnnotations(annotations: Annotation[], sceneId: string) {
  return annotations.filter((annotation) => annotation.sceneId === sceneId)
}

export function replaceSceneAnnotations(
  currentAnnotations: Annotation[],
  sceneId: string,
  nextSceneAnnotations: Annotation[]
) {
  const nonScene = currentAnnotations.filter((annotation) => annotation.sceneId !== sceneId)
  return [...nonScene, ...nextSceneAnnotations]
}

export function normalizeDraft(sceneId: string, draft: SceneDraft): SceneDraft {
  return {
    sceneId,
    revision: draft.revision,
    annotations: draft.annotations,
    updatedAt: draft.updatedAt,
    publishedAt: draft.publishedAt,
    publishedBy: draft.publishedBy,
    message: draft.message,
  }
}

export function isLocalImage(image: AnnotationImage): image is Extract<AnnotationImage, { localId: string }> {
  return 'localId' in image && typeof image.localId === 'string' && image.localId.length > 0
}

export function isRemoteImage(image: AnnotationImage): image is Extract<AnnotationImage, { url: string }> {
  return 'url' in image && typeof image.url === 'string' && image.url.length > 0
}

export function collectLocalImageIds(images: AnnotationImage[]): string[] {
  return images.filter(isLocalImage).map((image) => image.localId)
}

export function hasPendingLocalImages(annotations: Annotation[]): boolean {
  return annotations.some((annotation) => annotation.images.some((image) => isLocalImage(image)))
}

function toRemoteImages(images: AnnotationImage[]): AnnotationImage[] {
  return images
    .filter(isRemoteImage)
    .map((image) => ({
      filename: image.filename,
      url: image.url,
    }))
}

export function buildSceneDraftPayload(
  annotations: Annotation[],
  sceneId: string,
  revision: number
): SceneDraft {
  return {
    sceneId,
    revision,
    annotations: sceneAnnotations(annotations, sceneId).map((annotation) => ({
      ...annotation,
      images: toRemoteImages(annotation.images),
    })),
    updatedAt: Date.now(),
  }
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }
      reject(new Error('Unsupported file content'))
    }
    reader.readAsText(file)
  })
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Failed to serialize image'))
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }
      reject(new Error('Unsupported image format'))
    }
    reader.readAsDataURL(blob)
  })
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl)
  if (!response.ok) {
    throw new Error('Invalid embedded image data')
  }
  return response.blob()
}

export function asVec3(value: unknown, fallback: [number, number, number]): [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) return fallback
  const [x, y, z] = value
  if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') return fallback
  return [x, y, z]
}

export function sanitizeLinks(value: unknown): { url: string; label: string }[] {
  if (!Array.isArray(value)) return []

  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const candidate = entry as Record<string, unknown>
      const url = typeof candidate.url === 'string' ? candidate.url : ''
      const label = typeof candidate.label === 'string' ? candidate.label : ''
      return { url, label }
    })
    .filter((entry): entry is { url: string; label: string } => entry !== null)
}

export type { LegacyAnnotationImage }
