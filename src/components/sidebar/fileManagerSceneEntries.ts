import type { ScanScene } from '@/types'

export type SceneSyncState = 'published' | 'bootstrap' | 'discovered' | 'session'

export interface SceneEntry {
  scene: ScanScene
  syncState: SceneSyncState
}

export function buildSceneEntries(
  scenes: ScanScene[],
  publishedScenes: ScanScene[],
  discoveredScenes: ScanScene[],
  uploadedScenes: ScanScene[]
) {
  const publishedScenesById = new Map(publishedScenes.map((scene) => [scene.id, scene]))
  const discoveredScenesById = new Map(discoveredScenes.map((scene) => [scene.id, scene]))
  const uploadedScenesById = new Map(uploadedScenes.map((scene) => [scene.id, scene]))
  const presetSceneIds = new Set(scenes.map((scene) => scene.id))

  const presetEntries: SceneEntry[] = scenes.map((presetScene) => {
    const publishedScene = publishedScenesById.get(presetScene.id)
    const discoveredScene = discoveredScenesById.get(presetScene.id)
    const sessionScene = uploadedScenesById.get(presetScene.id)

    if (publishedScene) {
      return { scene: publishedScene, syncState: 'published' }
    }

    if (discoveredScene) {
      return { scene: discoveredScene, syncState: 'discovered' }
    }

    if (sessionScene) {
      return { scene: sessionScene, syncState: 'session' }
    }

    return { scene: presetScene, syncState: 'bootstrap' }
  })

  const publishedOnlyEntries: SceneEntry[] = publishedScenes
    .filter((scene) => !presetSceneIds.has(scene.id))
    .map((scene) => ({ scene, syncState: 'published' }))

  const discoveredOnlyEntries: SceneEntry[] = discoveredScenes
    .filter((scene) => !presetSceneIds.has(scene.id) && !publishedScenesById.has(scene.id))
    .map((scene) => ({ scene, syncState: 'discovered' }))

  const sessionOnlyEntries: SceneEntry[] = uploadedScenes
    .filter(
      (scene) =>
        !presetSceneIds.has(scene.id) &&
        !publishedScenesById.has(scene.id) &&
        !discoveredScenesById.has(scene.id)
    )
    .map((scene) => ({ scene, syncState: 'session' }))

  const sceneEntries = [
    ...presetEntries,
    ...publishedOnlyEntries,
    ...discoveredOnlyEntries,
    ...sessionOnlyEntries,
  ]

  const unsyncedPresetCount = presetEntries.filter((entry) => entry.syncState !== 'published').length

  return {
    sceneEntries,
    unsyncedPresetCount,
  }
}
