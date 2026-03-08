import type { ScanScene } from '../../src/types'

export function sanitizeSceneId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function isPlaceholderHost(hostname: string) {
  const normalized = hostname.trim().toLowerCase()
  return (
    normalized === 'example' ||
    normalized === 'example.com' ||
    normalized.endsWith('.example') ||
    normalized.endsWith('.example.com')
  )
}

export function isValidAssetUrl(value: string) {
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

export function dedupeModelsById(models: ScanScene[]) {
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

function toCloudIdBase(value: string) {
  const normalized = sanitizeSceneId(value)
  if (!normalized) return ''
  return normalized.startsWith('cloud-') ? normalized : `cloud-${normalized}`
}

export function generateUniqueId(base: string, existingIds: Set<string>) {
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

export function normalizeModel(model: ScanScene): ScanScene | null {
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
    createdAt: typeof model.createdAt === 'number' ? model.createdAt : Date.now(),
    updatedAt: typeof model.updatedAt === 'number' ? model.updatedAt : Date.now(),
  }
}
