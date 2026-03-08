import type { ScanScene, DiscoveryValidationError } from '@/types'

interface ApiErrorPayload {
  error?: string
}

interface ModelsListResponse {
  models: ScanScene[]
}

interface DiscoverLocalModelsResponse {
  scenes: ScanScene[]
  errors: DiscoveryValidationError[]
}

interface CreateModelResponse {
  ok: true
  model: ScanScene
}

interface SyncModelsResponse {
  ok: true
  models: ScanScene[]
}

export class SceneConflictError extends Error {
  readonly status = 409

  constructor(sceneId: string) {
    super(`Scene "${sceneId}" already exists in registry`)
    this.name = 'SceneConflictError'
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
    }

    const error = new Error(message)
    ;(error as Error & { status?: number }).status = response.status
    throw error
  }

  return (await response.json()) as T
}

export async function getModels(): Promise<ScanScene[]> {
  const result = await requestJson<ModelsListResponse>('/api/models')
  return result.models
}

export async function createModel(input: {
  name: string
  glbUrl: string
  plyUrl: string
  id?: string
  mergeById?: boolean
  createOnly?: boolean
}): Promise<ScanScene> {
  const result = await requestJson<CreateModelResponse>('/api/models', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  return result.model
}

export async function syncModels(models: Array<{ id: string; name: string; glbUrl: string; plyUrl: string }>): Promise<ScanScene[]> {
  const result = await requestJson<SyncModelsResponse>('/api/models', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ replace: true, models }),
  })

  return result.models
}

export async function registerOfficialScene(input: {
  id: string
  name: string
  glbUrl: string
  plyUrl: string
}): Promise<ScanScene> {
  const response = await fetch('/api/models', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: input.id,
      name: input.name,
      glbUrl: input.glbUrl,
      plyUrl: input.plyUrl,
      createOnly: true,
    }),
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null
    const message = payload?.error ?? `Request failed with status ${response.status}`

    if (response.status === 409) {
      throw new SceneConflictError(input.id)
    }

    const error = new Error(message)
    ;(error as Error & { status?: number }).status = response.status
    throw error
  }

  const result = (await response.json()) as CreateModelResponse
  return result.model
}

export async function discoverLocalScenes(): Promise<DiscoverLocalModelsResponse> {
  return requestJson<DiscoverLocalModelsResponse>('/api/discover/local-models')
}
