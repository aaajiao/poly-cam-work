import type { ScanScene } from '../../src/types'
import { requireAuth } from '../_lib/auth'
import { readJsonBlob, writeJsonBlob } from '../_lib/blobStore'
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
    const models = raw
      .map((model) => normalizeModel(model))
      .filter((model): model is ScanScene => model !== null)

    return {
      version: 1,
      models,
    }
  }

  const models = Array.isArray(raw.models)
    ? raw.models
        .map((model) => normalizeModel(model))
        .filter((model): model is ScanScene => model !== null)
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
  for (let attempt = 0; attempt < 4; attempt += 1) {
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

    const confirmed = await readModelRegistry()
    if (confirmed.models.some((existing) => existing.id === model.id)) {
      return model
    }
  }

  throw new Error('Failed to persist model registration due to concurrent updates')
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

  const body = (await request.json().catch(() => null)) as CreateModelBody | null
  if (!body || typeof body.name !== 'string' || typeof body.glbUrl !== 'string' || typeof body.plyUrl !== 'string') {
    return badRequest('name, glbUrl, and plyUrl are required')
  }

  const name = body.name.trim()
  const glbUrl = body.glbUrl.trim()
  const plyUrl = body.plyUrl.trim()
  if (!name || !glbUrl || !plyUrl) {
    return badRequest('name, glbUrl, and plyUrl must be non-empty')
  }

  const requestedId = typeof body.id === 'string' ? sanitizeSceneId(body.id) : ''
  const model = await createModelWithRetry({
    requestedId,
    name,
    glbUrl,
    plyUrl,
  })

  return jsonResponse({ ok: true, model })
}
