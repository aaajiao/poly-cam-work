import type { ScanScene } from '../../src/types'
import { requireAuth } from '../_lib/auth'
import { deleteBlobByPathname, readJsonBlob, writeJsonBlob } from '../_lib/blobStore'
import { badRequest, jsonResponse, methodNotAllowed, unauthorized } from '../_lib/http'

interface ModelRegistryDocument {
  version: number
  models: ScanScene[]
}

interface CreateModelBody {
  id?: string
  name?: string
  glbUrl?: string
  plyUrl?: string
  mergeById?: boolean
}

interface ReplaceModelInput {
  id: string
  name: string
  glbUrl: string
  plyUrl: string
}

interface ReplaceModelsBody {
  replace: true
  models: ReplaceModelInput[]
}

const MODEL_REGISTRY_PATH = 'models/index.json'

function sanitizeSceneId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function isPlaceholderHost(hostname: string) {
  const normalized = hostname.trim().toLowerCase()
  return (
    normalized === 'example' ||
    normalized === 'example.com' ||
    normalized.endsWith('.example') ||
    normalized.endsWith('.example.com')
  )
}

function isValidAssetUrl(value: string) {
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return false
    }
    return !isPlaceholderHost(parsed.hostname)
  } catch {
    return false
  }
}

function dedupeModelsById(models: ScanScene[]) {
  const byId = new Map<string, ScanScene>()

  for (const model of models) {
    const existing = byId.get(model.id)
    if (!existing) {
      byId.set(model.id, model)
      continue
    }

    const existingUpdatedAt = typeof existing.updatedAt === 'number' ? existing.updatedAt : 0
    const nextUpdatedAt = typeof model.updatedAt === 'number' ? model.updatedAt : 0
    if (nextUpdatedAt >= existingUpdatedAt) {
      byId.set(model.id, model)
    }
  }

  return Array.from(byId.values()).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
}

function blobPathnameFromUrl(value: string): string | null {
  try {
    const parsed = new URL(value)
    return decodeURIComponent(parsed.pathname).replace(/^\/+/g, '')
  } catch {
    return null
  }
}

async function cleanupStaleModelAssets(previousModels: ScanScene[], nextModels: ScanScene[]) {
  const keepUrls = new Set(nextModels.flatMap((model) => [model.glbUrl, model.plyUrl]))
  const stalePathnames = previousModels
    .flatMap((model) => [model.glbUrl, model.plyUrl])
    .filter((url) => !keepUrls.has(url))
    .map((url) => blobPathnameFromUrl(url))
    .filter((pathname): pathname is string => pathname !== null)

  await Promise.allSettled(stalePathnames.map((pathname) => deleteBlobByPathname(pathname)))
}

function isReplaceModelsBody(value: unknown): value is ReplaceModelsBody {
  if (!value || typeof value !== 'object') return false

  const candidate = value as { replace?: unknown; models?: unknown }
  return candidate.replace === true && Array.isArray(candidate.models)
}

function toCloudIdBase(value: string) {
  const normalized = sanitizeSceneId(value)
  if (!normalized) return ''
  return normalized.startsWith('cloud-') ? normalized : `cloud-${normalized}`
}

function generateUniqueId(base: string, existingIds: Set<string>) {
  const normalizedBase = toCloudIdBase(base) || `cloud-model-${Date.now()}`
  if (!existingIds.has(normalizedBase)) return normalizedBase

  let attempt = 1
  while (attempt < 1000) {
    const candidate = `${normalizedBase}-${attempt}`
    if (!existingIds.has(candidate)) return candidate
    attempt += 1
  }

  return `${normalizedBase}-${Date.now()}`
}

function normalizeModel(model: ScanScene): ScanScene | null {
  if (
    !model ||
    typeof model !== 'object' ||
    typeof model.id !== 'string' ||
    typeof model.name !== 'string' ||
    typeof model.glbUrl !== 'string' ||
    typeof model.plyUrl !== 'string'
  ) {
    return null
  }

  if (!model.id || !model.name || !model.glbUrl || !model.plyUrl) {
    return null
  }

  if (!isValidAssetUrl(model.glbUrl) || !isValidAssetUrl(model.plyUrl)) {
    return null
  }

  return {
    id: model.id,
    name: model.name,
    glbUrl: model.glbUrl,
    plyUrl: model.plyUrl,
    source: 'cloud',
    createdAt: typeof model.createdAt === 'number' ? model.createdAt : Date.now(),
    updatedAt: typeof model.updatedAt === 'number' ? model.updatedAt : Date.now(),
  }
}

async function readModelRegistry() {
  const raw = await readJsonBlob<ModelRegistryDocument | ScanScene[]>(MODEL_REGISTRY_PATH)
  if (!raw) {
    return { version: 1, models: [] as ScanScene[] }
  }

  if (Array.isArray(raw)) {
    const models = dedupeModelsById(
      raw
      .map((model) => normalizeModel(model))
      .filter((model): model is ScanScene => model !== null)
    )

    return {
      version: 1,
      models,
    }
  }

  const models = Array.isArray(raw.models)
    ? dedupeModelsById(
        raw.models
          .map((model) => normalizeModel(model))
          .filter((model): model is ScanScene => model !== null)
      )
    : []

  return {
    version: 1,
    models,
  }
}

async function writeModelRegistry(models: ScanScene[]) {
  await writeJsonBlob(MODEL_REGISTRY_PATH, {
    version: 1,
    models,
  } satisfies ModelRegistryDocument)
}

async function createModelWithRetry(input: {
  requestedId: string
  name: string
  glbUrl: string
  plyUrl: string
}) {
  let lastError: unknown
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const registry = await readModelRegistry()
      const existingIds = new Set(registry.models.map((model) => model.id))
      const id = generateUniqueId(input.requestedId || input.name, existingIds)

      const now = Date.now()
      const model: ScanScene = {
        id,
        name: input.name,
        glbUrl: input.glbUrl,
        plyUrl: input.plyUrl,
        source: 'cloud',
        createdAt: now,
        updatedAt: now,
      }

      const models = [model, ...registry.models]
      await writeModelRegistry(models)
      return model
    } catch (error) {
      lastError = error
    }
  }

  throw new Error(
    `Failed to persist model registration${
      lastError instanceof Error && lastError.message ? `: ${lastError.message}` : ''
    }`
  )
}

async function upsertModelByIdWithRetry(input: {
  id: string
  name: string
  glbUrl: string
  plyUrl: string
}) {
  let lastError: unknown
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const registry = await readModelRegistry()
      const now = Date.now()
      const existing = registry.models.find((model) => model.id === input.id)

      const merged: ScanScene = {
        id: input.id,
        name: input.name,
        glbUrl: input.glbUrl,
        plyUrl: input.plyUrl,
        source: 'cloud',
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      }

      const models = [merged, ...registry.models.filter((model) => model.id !== input.id)]
      await writeModelRegistry(models)
      return merged
    } catch (error) {
      lastError = error
    }
  }

  throw new Error(
    `Failed to merge model registration${
      lastError instanceof Error && lastError.message ? `: ${lastError.message}` : ''
    }`
  )
}

async function replaceModelsWithRetry(inputModels: ReplaceModelInput[]) {
  let lastError: unknown

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const registry = await readModelRegistry()
      const existingById = new Map(registry.models.map((model) => [model.id, model] as const))
      const now = Date.now()

      const nextModels: ScanScene[] = inputModels.map((model) => {
        const existing = existingById.get(model.id)
        return {
          id: model.id,
          name: model.name,
          glbUrl: model.glbUrl,
          plyUrl: model.plyUrl,
          source: 'cloud',
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        }
      })

      await writeModelRegistry(nextModels)
      void cleanupStaleModelAssets(registry.models, nextModels)
      return nextModels
    } catch (error) {
      lastError = error
    }
  }

  throw new Error(
    `Failed to replace model registry${
      lastError instanceof Error && lastError.message ? `: ${lastError.message}` : ''
    }`
  )
}

export default async function handler(request: Request) {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return methodNotAllowed(['GET', 'POST'])
  }

  if (request.method === 'GET') {
    const registry = await readModelRegistry()
    return jsonResponse({ models: registry.models })
  }

  if (!requireAuth(request)) {
    return unauthorized()
  }

  const body = (await request.json().catch(() => null)) as unknown

  if (isReplaceModelsBody(body)) {
    if (body.models.length === 0) {
      return badRequest('models must contain at least one item')
    }

    const normalizedModels: ReplaceModelInput[] = []
    const seenIds = new Set<string>()

    for (const model of body.models) {
      if (!model || typeof model !== 'object') {
        return badRequest('models must contain valid objects')
      }

      const input = model as Partial<ReplaceModelInput>
      if (
        typeof input.id !== 'string' ||
        typeof input.name !== 'string' ||
        typeof input.glbUrl !== 'string' ||
        typeof input.plyUrl !== 'string'
      ) {
        return badRequest('each model requires id, name, glbUrl, and plyUrl')
      }

      const id = sanitizeSceneId(input.id)
      const name = input.name.trim()
      const glbUrl = input.glbUrl.trim()
      const plyUrl = input.plyUrl.trim()
      if (!id || !name || !glbUrl || !plyUrl) {
        return badRequest('model fields must be non-empty')
      }

      if (!isValidAssetUrl(glbUrl) || !isValidAssetUrl(plyUrl)) {
        return badRequest('glbUrl and plyUrl must be valid HTTP(S) asset URLs')
      }

      if (seenIds.has(id)) {
        return badRequest('models must contain unique ids')
      }

      seenIds.add(id)
      normalizedModels.push({
        id,
        name,
        glbUrl,
        plyUrl,
      })
    }

    const models = await replaceModelsWithRetry(normalizedModels)
    return jsonResponse({ ok: true, models })
  }

  const createBody = body as CreateModelBody | null
  if (
    !createBody ||
    typeof createBody.name !== 'string' ||
    typeof createBody.glbUrl !== 'string' ||
    typeof createBody.plyUrl !== 'string'
  ) {
    return badRequest('name, glbUrl, and plyUrl are required')
  }

  const name = createBody.name.trim()
  const glbUrl = createBody.glbUrl.trim()
  const plyUrl = createBody.plyUrl.trim()
  if (!name || !glbUrl || !plyUrl) {
    return badRequest('name, glbUrl, and plyUrl must be non-empty')
  }

  if (!isValidAssetUrl(glbUrl) || !isValidAssetUrl(plyUrl)) {
    return badRequest('glbUrl and plyUrl must be valid HTTP(S) asset URLs')
  }

  const requestedId = typeof createBody.id === 'string' ? sanitizeSceneId(createBody.id) : ''
  if (createBody.mergeById && !requestedId) {
    return badRequest('id is required when mergeById is true')
  }

  const model = createBody.mergeById
    ? await upsertModelByIdWithRetry({
        id: requestedId,
        name,
        glbUrl,
        plyUrl,
      })
    : await createModelWithRetry({
        requestedId,
        name,
        glbUrl,
        plyUrl,
      })

  return jsonResponse({ ok: true, model })
}
