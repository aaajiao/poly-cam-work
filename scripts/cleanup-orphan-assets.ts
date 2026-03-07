import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import type { ScanScene, SceneDraft } from '../src/types'
import {
  deleteBlobByPathname,
  listBlobsByPrefix,
  readJsonBlob,
  writeJsonBlob,
} from '../api/_lib/blobStore'
import { collectImagePathnamesFromDraft } from '../api/_lib/sceneAssetCleanup'

interface ModelRegistryDocument {
  version: number
  models: ScanScene[]
}

interface CleanupSummary {
  dryRun: boolean
  scannedBlobCount: number
  sceneCount: number
  modelRegistryCountBefore: number
  modelRegistryCountAfter: number
  modelRegistryUpdated: boolean
  staleModelBlobsFound: number
  staleImageBlobsFound: number
  deletedModelBlobs: number
  deletedImageBlobs: number
  failedDeletes: number
  missingDuringDelete: number
}

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return

  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const splitIndex = trimmed.indexOf('=')
    if (splitIndex <= 0) continue

    const key = trimmed.slice(0, splitIndex).trim()
    if (!key || process.env[key] !== undefined) continue

    const rawValue = trimmed.slice(splitIndex + 1).trim()
    const quotedDouble = rawValue.startsWith('"') && rawValue.endsWith('"')
    const quotedSingle = rawValue.startsWith("'") && rawValue.endsWith("'")
    const value = quotedDouble || quotedSingle ? rawValue.slice(1, -1) : rawValue
    process.env[key] = value
  }
}

function loadLocalEnvFiles() {
  loadEnvFile(path.resolve(process.cwd(), '.env'))
  loadEnvFile(path.resolve(process.cwd(), '.env.local'))
}

function blobPathnameFromUrl(value: string): string | null {
  try {
    const parsed = new URL(value)
    return decodeURIComponent(parsed.pathname).replace(/^\/+/, '')
  } catch {
    return null
  }
}

function isManagedModelPathname(pathname: string) {
  if (pathname.startsWith('models/')) return true
  return /^scenes\/[^/]+\/models\//.test(pathname)
}

function isManagedModelAssetPathname(pathname: string) {
  if (!isManagedModelPathname(pathname)) return false
  return /\.(glb|ply)$/i.test(pathname)
}

function isSceneImagePathname(pathname: string) {
  return /^scenes\/[^/]+\/images\//.test(pathname)
}

function isLegacyRootImagePathname(pathname: string) {
  if (pathname.includes('/')) return false
  return /\.(jpe?g|png|webp)$/i.test(pathname)
}

function releaseVersionFromPath(pathname: string): number | null {
  const match = pathname.match(/^scenes\/[^/]+\/releases\/(\d+)\.json$/)
  if (!match) return null

  const version = Number.parseInt(match[1], 10)
  return Number.isFinite(version) && version > 0 ? version : null
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

function normalizeRegistryModels(raw: ModelRegistryDocument | ScanScene[] | null): ScanScene[] {
  if (!raw) return []
  if (Array.isArray(raw)) return dedupeModelsById(raw)

  if (!Array.isArray(raw.models)) return []
  return dedupeModelsById(raw.models)
}

async function deletePathnames(pathnames: string[], dryRun: boolean) {
  let deleted = 0
  let missing = 0
  let failed = 0

  if (dryRun) {
    return { deleted, missing, failed }
  }

  for (const pathname of pathnames) {
    try {
      const result = await deleteBlobByPathname(pathname)
      if (result) {
        deleted += 1
      } else {
        missing += 1
      }
    } catch {
      failed += 1
    }
  }

  return { deleted, missing, failed }
}

function sceneIdFromPathname(pathname: string): string | null {
  const match = pathname.match(/^scenes\/([^/]+)\//)
  return match?.[1] ?? null
}

async function collectReferencedImagePathnames(sceneIds: string[], releasePaths: string[]) {
  const referenced = new Set<string>()
  const releasePathsByScene = new Map<string, string[]>()

  for (const releasePath of releasePaths) {
    const sceneId = sceneIdFromPathname(releasePath)
    if (!sceneId) continue

    const bucket = releasePathsByScene.get(sceneId)
    if (bucket) {
      bucket.push(releasePath)
    } else {
      releasePathsByScene.set(sceneId, [releasePath])
    }
  }

  for (const sceneId of sceneIds) {
    const draft = await readJsonBlob<SceneDraft>(`scenes/${sceneId}/draft.json`)
    if (draft) {
      for (const pathname of collectImagePathnamesFromDraft(draft)) {
        referenced.add(pathname)
      }
    }

    const sceneReleases = releasePathsByScene.get(sceneId) ?? []
    for (const releasePath of sceneReleases) {
      const release = await readJsonBlob<SceneDraft>(releasePath)
      if (!release) continue

      for (const pathname of collectImagePathnamesFromDraft(release)) {
        referenced.add(pathname)
      }
    }
  }

  return referenced
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  loadLocalEnvFiles()
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('BLOB_READ_WRITE_TOKEN is missing. Set it in environment or .env.local before running cleanup.')
  }

  const allBlobs = await listBlobsByPrefix('')
  const allPathnames = allBlobs.map((blob) => blob.pathname)

  const sceneIds = Array.from(new Set(allPathnames.map(sceneIdFromPathname).filter((id): id is string => id !== null))).sort()
  const releasePaths = allPathnames
    .filter((pathname) => releaseVersionFromPath(pathname) !== null)
    .sort((a, b) => a.localeCompare(b))

  const modelRegistryRaw = await readJsonBlob<ModelRegistryDocument | ScanScene[]>('models/index.json')
  const normalizedModels = normalizeRegistryModels(modelRegistryRaw)
  const modelRegistryCountBefore = Array.isArray(modelRegistryRaw)
    ? modelRegistryRaw.length
    : Array.isArray(modelRegistryRaw?.models)
      ? modelRegistryRaw.models.length
      : 0
  const modelRegistryUpdated =
    modelRegistryRaw !== null && JSON.stringify(normalizedModels) !== JSON.stringify(Array.isArray(modelRegistryRaw) ? modelRegistryRaw : modelRegistryRaw.models ?? [])

  if (!dryRun && modelRegistryRaw !== null && modelRegistryUpdated) {
    await writeJsonBlob('models/index.json', {
      version: 1,
      models: normalizedModels,
    } satisfies ModelRegistryDocument)
  }

  const staleModelPathnames = modelRegistryRaw === null
    ? []
    : (() => {
        const referencedModelPathnames = new Set(
          normalizedModels
            .flatMap((model) => [model.glbUrl, model.plyUrl])
            .map((url) => blobPathnameFromUrl(url))
            .filter((pathname): pathname is string => pathname !== null && isManagedModelAssetPathname(pathname))
        )

        const existingModelPathnames = allPathnames.filter((pathname) => isManagedModelAssetPathname(pathname))
        return existingModelPathnames
          .filter((pathname) => !referencedModelPathnames.has(pathname))
          .sort((a, b) => a.localeCompare(b))
      })()

  const referencedImagePathnames = await collectReferencedImagePathnames(sceneIds, releasePaths)
  const existingSceneImagePathnames = allPathnames.filter((pathname) => isSceneImagePathname(pathname))
  const staleSceneImagePathnames = existingSceneImagePathnames
    .filter((pathname) => !referencedImagePathnames.has(pathname))
    .sort((a, b) => a.localeCompare(b))
  const legacyRootImagePathnames = allPathnames.filter((pathname) => isLegacyRootImagePathname(pathname))
  const staleLegacyImagePathnames = legacyRootImagePathnames
    .filter((pathname) => !referencedImagePathnames.has(pathname))
    .sort((a, b) => a.localeCompare(b))
  const staleImagePathnames = Array.from(new Set([...staleSceneImagePathnames, ...staleLegacyImagePathnames]))

  const modelDeleteResult = await deletePathnames(staleModelPathnames, dryRun)
  const imageDeleteResult = await deletePathnames(staleImagePathnames, dryRun)

  const summary: CleanupSummary = {
    dryRun,
    scannedBlobCount: allBlobs.length,
    sceneCount: sceneIds.length,
    modelRegistryCountBefore,
    modelRegistryCountAfter: normalizedModels.length,
    modelRegistryUpdated,
    staleModelBlobsFound: staleModelPathnames.length,
    staleImageBlobsFound: staleImagePathnames.length,
    deletedModelBlobs: modelDeleteResult.deleted,
    deletedImageBlobs: imageDeleteResult.deleted,
    failedDeletes: modelDeleteResult.failed + imageDeleteResult.failed,
    missingDuringDelete: modelDeleteResult.missing + imageDeleteResult.missing,
  }

  const mode = dryRun ? 'DRY RUN' : 'APPLY'
  console.log(`[cleanup-orphan-assets] ${mode}`)
  console.log(JSON.stringify(summary, null, 2))
}

void main().catch((error) => {
  console.error('[cleanup-orphan-assets] failed', error)
  process.exitCode = 1
})
