import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { updatePointsThreshold } from '@/utils/raycasting'

describe('updatePointsThreshold', () => {
  it('sets threshold based on camera distance', () => {
    const raycaster = new THREE.Raycaster()
    const camera = new THREE.PerspectiveCamera()
    camera.position.set(0, 0, 10)

    updatePointsThreshold(raycaster, camera)

    const expected = 0.01 + 10 * 0.005
    expect(raycaster.params.Points?.threshold).toBeCloseTo(expected)
  })

  it('threshold scales with distance', () => {
    const raycaster = new THREE.Raycaster()
    const camera = new THREE.PerspectiveCamera()

    camera.position.set(0, 0, 100)
    updatePointsThreshold(raycaster, camera)
    const threshold100 = raycaster.params.Points?.threshold ?? 0

    camera.position.set(0, 0, 10)
    updatePointsThreshold(raycaster, camera)
    const threshold10 = raycaster.params.Points?.threshold ?? 0

    expect(threshold100).toBeGreaterThan(threshold10)
  })
})
