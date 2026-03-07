import type { SceneDraft } from '@/types'

interface SaveDraftResponse {
  ok: true
  revision: number
}

interface PublishResponse {
  ok: true
  version: number
}

interface RollbackResponse {
  ok: true
  version: number
}

interface PublishedVersionsResponse {
  versions: number[]
  liveVersion: number | null
}

interface DeleteVersionResponse extends PublishedVersionsResponse {
  ok: true
}

interface SessionResponse {
  authenticated: boolean
}

interface ApiErrorPayload {
  error?: string
}

function isApiRequest(input: RequestInfo): boolean {
  if (typeof input === 'string') {
    return input.startsWith('/api/')
  }

  if (input instanceof URL) {
    return input.pathname.startsWith('/api/')
  }

  try {
    const pathname = new URL(input.url).pathname
    return pathname.startsWith('/api/')
  } catch {
    return false
  }
}

async function requestJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    credentials: 'include',
    ...init,
  })

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`
    const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null
    if (payload && typeof payload.error === 'string' && payload.error.length > 0) {
      message = payload.error
    } else if (response.status >= 500 && isApiRequest(input)) {
      message = 'API server unavailable. Start `bun run dev:api` or `vercel dev`.'
    }

    const error = new Error(message)
    ;(error as Error & { status?: number }).status = response.status
    throw error
  }

  return (await response.json()) as T
}

export async function login(password: string): Promise<void> {
  await requestJson<{ ok: true }>('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
}

export async function logout(): Promise<void> {
  await requestJson<{ ok: true }>('/api/auth/logout', {
    method: 'POST',
  })
}

export async function getSession(): Promise<SessionResponse> {
  return requestJson<SessionResponse>('/api/auth/session')
}

export async function getDraft(sceneId: string): Promise<SceneDraft> {
  return requestJson<SceneDraft>(`/api/draft/${encodeURIComponent(sceneId)}`)
}

export async function saveDraft(
  sceneId: string,
  draft: SceneDraft,
  expectedRevision: number
): Promise<SaveDraftResponse> {
  return requestJson<SaveDraftResponse>(`/api/draft/${encodeURIComponent(sceneId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ draft, expectedRevision }),
  })
}

export async function publishDraft(sceneId: string, message?: string): Promise<PublishResponse> {
  return requestJson<PublishResponse>(`/api/publish/${encodeURIComponent(sceneId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  })
}

export async function getPublishedVersions(sceneId: string): Promise<PublishedVersionsResponse> {
  return requestJson<PublishedVersionsResponse>(`/api/publish/${encodeURIComponent(sceneId)}`)
}

export async function deletePublishedVersion(
  sceneId: string,
  version: number
): Promise<DeleteVersionResponse> {
  return requestJson<DeleteVersionResponse>(`/api/publish/${encodeURIComponent(sceneId)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version }),
  })
}

export async function getRelease(sceneId: string, version?: number): Promise<SceneDraft> {
  const query = typeof version === 'number' ? `?version=${version}` : ''
  return requestJson<SceneDraft>(`/api/release/${encodeURIComponent(sceneId)}${query}`)
}

export async function rollbackRelease(sceneId: string, version: number): Promise<RollbackResponse> {
  return requestJson<RollbackResponse>(`/api/rollback/${encodeURIComponent(sceneId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version }),
  })
}
