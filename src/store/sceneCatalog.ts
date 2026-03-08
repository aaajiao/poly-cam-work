import type { OfficialSceneSyncDiffEntry, OfficialSceneSyncStatus, ScanScene } from '@/types'

function isPlaceholderHost(hostname: string) {
  const normalized = hostname.trim().toLowerCase()
  return (
    normalized === 'example' ||
    normalized === 'example.com' ||
    normalized.endsWith('.example') ||
    normalized.endsWith('.example.com')
  )
}

export function hasValidSceneAssetUrls(scene: ScanScene) {
  try {
    const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
    const glb = new URL(scene.glbUrl, base)
    const ply = new URL(scene.plyUrl, base)

    if (
      (glb.protocol !== 'https:' && glb.protocol !== 'http:') ||
      (ply.protocol !== 'https:' && ply.protocol !== 'http:')
    ) {
      return false
    }

    return !isPlaceholderHost(glb.hostname) && !isPlaceholderHost(ply.hostname)
  } catch {
    return false
  }
}

export function applyOfficialSceneStatus(
  scene: ScanScene,
  catalogSource: 'bootstrap' | 'discovered' | 'published',
  pairCompleteness: 'complete' | 'missing-glb' | 'missing-ply' = 'complete',
  syncStatus: OfficialSceneSyncStatus = catalogSource === 'published' ? 'synced' : 'unsynced'
): ScanScene {
  return {
    ...scene,
    catalogSource,
    officialStatus: {
      sceneId: scene.id,
      catalogSource,
      pairCompleteness,
      syncStatus,
    },
  }
}

export function asBootstrapScene(scene: ScanScene) {
  return applyOfficialSceneStatus(scene, 'bootstrap', 'complete', 'synced')
}

export function asPublishedScene(scene: ScanScene) {
  return applyOfficialSceneStatus(scene, 'published', 'complete', 'synced')
}

export function deriveOfficialSceneSyncStatus(
  sceneId: string,
  publishedIds: Set<string>,
  syncOverridesByScene: Record<string, OfficialSceneSyncStatus>
): OfficialSceneSyncStatus {
  const override = syncOverridesByScene[sceneId]
  if (override === 'syncing' || override === 'error') {
    return override
  }

  return publishedIds.has(sceneId) ? 'synced' : 'unsynced'
}

export function applyDiscoveredSceneSyncDiff(
  discoveredScenes: ScanScene[],
  publishedScenes: ScanScene[],
  syncOverridesByScene: Record<string, OfficialSceneSyncStatus>
): ScanScene[] {
  const publishedIds = new Set(publishedScenes.map((scene) => scene.id))

  return discoveredScenes.map((scene) =>
    applyOfficialSceneStatus(
      scene,
      'discovered',
      'complete',
      deriveOfficialSceneSyncStatus(scene.id, publishedIds, syncOverridesByScene)
    )
  )
}

export function clearSceneSyncOverride(
  syncOverridesByScene: Record<string, OfficialSceneSyncStatus>,
  sceneId: string
) {
  if (!(sceneId in syncOverridesByScene)) {
    return syncOverridesByScene
  }

  const next = { ...syncOverridesByScene }
  delete next[sceneId]
  return next
}

export function dedupeScenesById(scenes: ScanScene[]) {
  const seen = new Set<string>()
  const deduped: ScanScene[] = []

  for (const scene of scenes) {
    if (seen.has(scene.id)) {
      continue
    }

    seen.add(scene.id)
    deduped.push(scene)
  }

  return deduped
}

export function normalizeRecoverableSyncOverrides(
  syncOverridesByScene: Record<string, OfficialSceneSyncStatus>
): Record<string, OfficialSceneSyncStatus> {
  const normalized: Record<string, OfficialSceneSyncStatus> = {}

  for (const [sceneId, status] of Object.entries(syncOverridesByScene)) {
    normalized[sceneId] = status === 'syncing' ? 'error' : status
  }

  return normalized
}

export type ActiveSceneCatalogState = Pick<
  {
    activeSceneId: string | null
    discoveredScenes: ScanScene[]
    publishedScenes: ScanScene[]
    scenes: ScanScene[]
    uploadedScenes: ScanScene[]
  },
  'activeSceneId' | 'discoveredScenes' | 'publishedScenes' | 'scenes' | 'uploadedScenes'
>

export type OfficialSceneCatalogState = Pick<
  {
    discoveredScenes: ScanScene[]
    publishedScenes: ScanScene[]
    officialSceneSyncOverridesByScene: Record<string, OfficialSceneSyncStatus>
  },
  'discoveredScenes' | 'publishedScenes' | 'officialSceneSyncOverridesByScene'
>

export function resolveOfficialSceneSyncDiff(
  state: OfficialSceneCatalogState
): OfficialSceneSyncDiffEntry[] {
  const discoveredById = new Map(state.discoveredScenes.map((scene) => [scene.id, scene]))
  const publishedById = new Map(state.publishedScenes.map((scene) => [scene.id, scene]))
  const sceneIds = Array.from(new Set([...discoveredById.keys(), ...publishedById.keys()])).sort()
  const publishedIds = new Set(publishedById.keys())

  return sceneIds.map((sceneId) => ({
    sceneId,
    discovered: discoveredById.has(sceneId),
    published: publishedById.has(sceneId),
    syncStatus: deriveOfficialSceneSyncStatus(
      sceneId,
      publishedIds,
      state.officialSceneSyncOverridesByScene
    ),
  }))
}

export function resolveOfficialSceneSyncStatusBySceneId(
  state: OfficialSceneCatalogState
): Record<string, OfficialSceneSyncStatus> {
  return Object.fromEntries(
    resolveOfficialSceneSyncDiff(state).map((entry) => [entry.sceneId, entry.syncStatus])
  )
}

export function resolveActiveSceneFromCatalog(state: ActiveSceneCatalogState): ScanScene | null {
  if (!state.activeSceneId) {
    return null
  }

  const discoveredScene = state.discoveredScenes.find((scene) => scene.id === state.activeSceneId)
  if (discoveredScene) {
    return discoveredScene
  }

  const publishedScene = state.publishedScenes.find((scene) => scene.id === state.activeSceneId)
  if (publishedScene && hasValidSceneAssetUrls(publishedScene)) {
    return publishedScene
  }

  const bootstrapScene = state.scenes.find((scene) => scene.id === state.activeSceneId)
  if (bootstrapScene) {
    return bootstrapScene
  }

  return state.uploadedScenes.find((scene) => scene.id === state.activeSceneId) ?? null
}
