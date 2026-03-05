import { describe, it, expect } from 'vitest'
import { PRESET_SCENES } from '@/store/presetScenes'

describe('PRESET_SCENES pairing', () => {
  it('has exactly 3 preset scenes', () => {
    expect(PRESET_SCENES).toHaveLength(3)
  })

  it('scan-a uses correct files', () => {
    const scanA = PRESET_SCENES.find((s) => s.id === 'scan-a')
    expect(scanA).toBeDefined()
    expect(scanA!.plyUrl).toBe('/models/scan-a.ply')
    expect(scanA!.glbUrl).toBe('/models/scan-a.glb')
  })

  it('scan-b uses correct files', () => {
    const scanB = PRESET_SCENES.find((s) => s.id === 'scan-b')
    expect(scanB).toBeDefined()
    expect(scanB!.plyUrl).toBe('/models/scan-b.ply')
    expect(scanB!.glbUrl).toBe('/models/scan-b.glb')
  })

  it('scan-c uses correct files', () => {
    const scanC = PRESET_SCENES.find((s) => s.id === 'scan-c')
    expect(scanC).toBeDefined()
    expect(scanC!.plyUrl).toBe('/models/scan-c.ply')
    expect(scanC!.glbUrl).toBe('/models/scan-c.glb')
  })

  it('all scenes have required fields', () => {
    PRESET_SCENES.forEach((scene) => {
      expect(scene.id).toBeTruthy()
      expect(scene.name).toBeTruthy()
      expect(scene.glbUrl).toMatch(/^\/models\//)
      expect(scene.plyUrl).toMatch(/^\/models\//)
    })
  })

  it('all scene ids are unique', () => {
    const ids = PRESET_SCENES.map((s) => s.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  it('all scene names are non-empty strings', () => {
    PRESET_SCENES.forEach((scene) => {
      expect(typeof scene.name).toBe('string')
      expect(scene.name.length).toBeGreaterThan(0)
    })
  })
})
