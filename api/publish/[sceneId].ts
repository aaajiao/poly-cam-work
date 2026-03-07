import type { LivePointer, SceneDraft } from '../../src/types'
import { requireAuth } from '../_lib/auth'
import { readJsonBlob, writeImmutableJsonBlob, writeJsonBlob } from '../_lib/blobStore'
import { badRequest, jsonResponse, methodNotAllowed, unauthorized } from '../_lib/http'

interface PublishBody {
  message?: string
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

export default async function handler(request: Request) {
  if (request.method !== 'POST') {
    return methodNotAllowed(['POST'])
  }

  if (!requireAuth(request)) {
    return unauthorized()
  }

  const sceneId = extractSceneId(new URL(request.url).pathname)
  if (!sceneId) {
    return badRequest('Invalid scene id')
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

  return jsonResponse({ ok: true, version: nextVersion })
}
