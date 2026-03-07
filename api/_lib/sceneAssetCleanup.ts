import type { AnnotationImage, SceneDraft } from '../../src/types'
import { deleteBlobByPathname, listBlobsByPrefix, readJsonBlob } from './blobStore'

function draftPath(sceneId: string) {
  return `scenes/${sceneId}/draft.json`
}

function releasesPrefix(sceneId: string) {
  return `scenes/${sceneId}/releases/`
}

function sceneImagesPrefix(sceneId: string) {
  return `scenes/${sceneId}/images/`
}

function isRemoteImage(image: AnnotationImage): image is Extract<AnnotationImage, { url: string }> {
  return 'url' in image && typeof image.url === 'string' && image.url.length > 0
}

function blobPathnameFromUrl(value: string): string | null {
  try {
    const parsed = new URL(value)
    return decodeURIComponent(parsed.pathname).replace(/^\/+/, '')
  } catch {
    return null
  }
}

function releaseVersionFromPath(pathname: string): number | null {
  const match = pathname.match(/\/releases\/(\d+)\.json$/)
  if (!match) return null

  const version = Number.parseInt(match[1], 10)
  return Number.isFinite(version) && version > 0 ? version : null
}

export function collectImagePathnamesFromDraft(draft: SceneDraft): string[] {
  const pathnames: string[] = []

  for (const annotation of draft.annotations) {
    for (const image of annotation.images) {
      if (!isRemoteImage(image)) continue
      const pathname = blobPathnameFromUrl(image.url)
      if (!pathname) continue
      pathnames.push(pathname)
    }
  }

  return pathnames
}

async function collectReferencedSceneImagePathnames(sceneId: string): Promise<Set<string>> {
  const referenced = new Set<string>()

  const draft = await readJsonBlob<SceneDraft>(draftPath(sceneId))
  if (draft) {
    for (const pathname of collectImagePathnamesFromDraft(draft)) {
      referenced.add(pathname)
    }
  }

  const releaseBlobs = await listBlobsByPrefix(releasesPrefix(sceneId))
  const releasePaths = releaseBlobs
    .map((blob) => blob.pathname)
    .filter((pathname) => releaseVersionFromPath(pathname) !== null)

  for (const releaseBlobPath of releasePaths) {
    const release = await readJsonBlob<SceneDraft>(releaseBlobPath)
    if (!release) continue

    for (const pathname of collectImagePathnamesFromDraft(release)) {
      referenced.add(pathname)
    }
  }

  return referenced
}

export async function reconcileSceneImageAssets(sceneId: string, candidatePathnames: string[] = []) {
  const referenced = await collectReferencedSceneImagePathnames(sceneId)
  const stale = new Set<string>()

  const sceneImages = await listBlobsByPrefix(sceneImagesPrefix(sceneId))
  for (const blob of sceneImages) {
    if (!referenced.has(blob.pathname)) {
      stale.add(blob.pathname)
    }
  }

  for (const pathname of candidatePathnames) {
    if (!pathname || referenced.has(pathname)) continue
    stale.add(pathname)
  }

  if (stale.size === 0) {
    return {
      deletedPathnames: [] as string[],
      failedPathnames: [] as string[],
    }
  }

  const staleList = Array.from(stale)
  const results = await Promise.allSettled(staleList.map((pathname) => deleteBlobByPathname(pathname)))

  const deletedPathnames: string[] = []
  const failedPathnames: string[] = []

  for (let index = 0; index < results.length; index += 1) {
    const result = results[index]
    const pathname = staleList[index]
    if (result.status === 'fulfilled' && result.value) {
      deletedPathnames.push(pathname)
    } else if (result.status === 'rejected') {
      failedPathnames.push(pathname)
    }
  }

  return {
    deletedPathnames,
    failedPathnames,
  }
}
