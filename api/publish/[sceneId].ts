import type { LivePointer, SceneDraft } from '../../src/types'
import { requireAuth } from '../_lib/auth'
import {
  deleteBlobByPathname,
  listBlobsByPrefix,
  readJsonBlob,
  writeImmutableJsonBlob,
  writeJsonBlob,
} from '../_lib/blobStore'
import { badRequest, jsonResponse, methodNotAllowed, notFound, unauthorized } from '../_lib/http'
import { collectImagePathnamesFromDraft, reconcileSceneImageAssets } from '../_lib/sceneAssetCleanup'

interface PublishBody {
  message?: string
}

interface DeleteBody {
  version?: number
}

function extractSceneId(pathname: string) {
  const prefix = '/api/publish/'
  if (!pathname.startsWith(prefix)) return null
  const value = pathname.slice(prefix.length)
  return decodeURIComponent(value)
}

function draftPath(sceneId: string) {
  return `scenes/${sceneId}/draft.json`
}

function livePath(sceneId: string) {
  return `scenes/${sceneId}/live.json`
}

function releasePath(sceneId: string, version: number) {
  return `scenes/${sceneId}/releases/${version}.json`
}

function releasesPrefix(sceneId: string) {
  return `scenes/${sceneId}/releases/`
}

function validLiveVersion(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function releaseVersionFromPath(pathname: string): number | null {
  const match = pathname.match(/\/releases\/(\d+)\.json$/)
  if (!match) return null

  const version = Number.parseInt(match[1], 10)
  return Number.isFinite(version) && version > 0 ? version : null
}

async function listReleaseVersions(sceneId: string): Promise<number[]> {
  const blobs = await listBlobsByPrefix(releasesPrefix(sceneId))
  const versions = blobs
    .map((blob) => releaseVersionFromPath(blob.pathname))
    .filter((version): version is number => version !== null)

  return Array.from(new Set(versions)).sort((a, b) => b - a)
}

export default async function handler(request: Request) {
  if (request.method !== 'GET' && request.method !== 'POST' && request.method !== 'DELETE') {
    return methodNotAllowed(['GET', 'POST', 'DELETE'])
  }

  if (!requireAuth(request)) {
    return unauthorized()
  }

  const sceneId = extractSceneId(new URL(request.url).pathname)
  if (!sceneId) {
    return badRequest('Invalid scene id')
  }

  if (request.method === 'GET') {
    const versions = await listReleaseVersions(sceneId)
    const live = await readJsonBlob<LivePointer>(livePath(sceneId))
    const liveVersion = validLiveVersion(live?.version)

    return jsonResponse({
      versions,
      liveVersion: liveVersion && versions.includes(liveVersion) ? liveVersion : null,
    })
  }

  if (request.method === 'DELETE') {
    const body = (await request.json().catch(() => null)) as DeleteBody | null
    const version = body?.version
    if (!Number.isFinite(version) || !version || version <= 0) {
      return badRequest('version must be a positive number')
    }

    const targetReleasePath = releasePath(sceneId, version)
    const releaseToDelete = await readJsonBlob<SceneDraft>(targetReleasePath)
    if (!releaseToDelete) {
      return notFound('Release not found')
    }
    const candidateImagePathnames = collectImagePathnamesFromDraft(releaseToDelete)

    const deleted = await deleteBlobByPathname(targetReleasePath)
    if (!deleted) {
      return notFound('Release not found')
    }

    const versions = await listReleaseVersions(sceneId)
    const live = await readJsonBlob<LivePointer>(livePath(sceneId))
    const currentLiveVersion = validLiveVersion(live?.version)

    let liveVersion = currentLiveVersion
    if (liveVersion === version || (liveVersion !== null && !versions.includes(liveVersion))) {
      liveVersion = versions[0] ?? null
    }

    await writeJsonBlob(livePath(sceneId), { version: liveVersion ?? 0 })

    try {
      await reconcileSceneImageAssets(sceneId, candidateImagePathnames)
    } catch (error) {
      console.error('Failed to reconcile scene images after release delete', error)
    }

    return jsonResponse({
      ok: true,
      versions,
      liveVersion,
    })
  }

  const draft = await readJsonBlob<SceneDraft>(draftPath(sceneId))
  if (!draft) {
    return badRequest('Draft not found')
  }

  const body = (await request.json().catch(() => null)) as PublishBody | null
  const live = await readJsonBlob<LivePointer>(livePath(sceneId))
  const nextVersion = (live?.version ?? 0) + 1

  const release: SceneDraft = {
    ...draft,
    publishedAt: Date.now(),
    publishedBy: 'admin',
    message: typeof body?.message === 'string' ? body.message : undefined,
  }

  await writeImmutableJsonBlob(releasePath(sceneId, nextVersion), release)
  await writeJsonBlob(livePath(sceneId), { version: nextVersion })

  try {
    await reconcileSceneImageAssets(sceneId)
  } catch (error) {
    console.error('Failed to reconcile scene images after publish', error)
  }

  return jsonResponse({ ok: true, version: nextVersion })
}
