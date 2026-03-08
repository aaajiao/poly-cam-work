import type { ScanScene } from '../../src/types'
import { readJsonBlob, writeJsonBlob } from './blobStore'
import { cleanupStaleModelAssets } from './modelAssetCleanup'
import { dedupeModelsById, generateUniqueId, normalizeModel } from './modelValidation'

interface ModelRegistryDocument {
  version: number
  models: ScanScene[]
}

const MODEL_REGISTRY_PATH = 'models/index.json'

export async function readModelRegistry() {
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

export async function createModelWithRetry(input: {
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

export async function createModelCreateOnlyWithRetry(input: {
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

      if (existingIds.has(input.requestedId)) {
        throw new Error(`Scene ID "${input.requestedId}" already exists in registry`)
      }

      const now = Date.now()
      const model: ScanScene = {
        id: input.requestedId,
        name: input.name,
        glbUrl: input.glbUrl,
        plyUrl: input.plyUrl,
        createdAt: now,
        updatedAt: now,
      }

      const models = [model, ...registry.models]
      await writeModelRegistry(models)
      return model
    } catch (error) {
      if (error instanceof Error && error.message.includes('already exists in registry')) {
        throw error
      }

      lastError = error
    }
  }

  throw new Error(
    `Failed to persist model registration${
      lastError instanceof Error && lastError.message ? `: ${lastError.message}` : ''
    }`
  )
}

export async function upsertModelByIdWithRetry(input: {
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
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      }

      const models = [merged, ...registry.models.filter((model) => model.id !== input.id)]
      await writeModelRegistry(models)
      await cleanupStaleModelAssets(registry.models, models)
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

export async function replaceModelsWithRetry(
  inputModels: Array<{ id: string; name: string; glbUrl: string; plyUrl: string }>
) {
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
      await cleanupStaleModelAssets(registry.models, nextModels)
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
