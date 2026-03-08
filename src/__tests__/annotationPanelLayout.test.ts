import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  createTransitionProfile,
  getPanelLayout,
  getSceneEnvelope,
  screenToWorld,
  worldToScreen,
} from '@/utils/annotationPanelLayout'
import type { Annotation } from '@/types'

function makeAnnotation(id: string, position: [number, number, number]): Annotation {
  return {
    id,
    position,
    title: id,
    description: '',
    images: [],
    videoUrl: null,
    links: [],
    sceneId: 'scan-a',
    createdAt: 1700000000000,
  }
}

describe('annotationPanelLayout', () => {
  it('returns a default envelope when no annotations exist', () => {
    expect(getSceneEnvelope([])).toEqual({
      center: [0, 0, 0],
      radius: 12,
    })
  })

  it('creates deterministic transition profiles', () => {
    expect(createTransitionProfile('ann-1', 3, 5)).toEqual(
      createTransitionProfile('ann-1', 3, 5)
    )
    expect(createTransitionProfile('ann-1', 3, 5)).not.toEqual(
      createTransitionProfile('ann-2', 3, 5)
    )
  })

  it('round-trips screen coordinates back to the same world point', () => {
    const camera = new THREE.PerspectiveCamera(50, 800 / 600, 0.1, 100)
    camera.position.set(0, 0, 10)
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()

    const point = new THREE.Vector3(1.5, -0.75, 0)
    const screenPoint = worldToScreen(point, camera, 800, 600)
    const roundTripped = screenToWorld(screenPoint.x, screenPoint.y, screenPoint.z, camera, 800, 600)

    expect(roundTripped.x).toBeCloseTo(point.x, 5)
    expect(roundTripped.y).toBeCloseTo(point.y, 5)
    expect(roundTripped.z).toBeCloseTo(point.z, 5)
  })

  it('clamps panel layout inside the viewport safe area', () => {
    const camera = new THREE.PerspectiveCamera(50, 800 / 600, 0.1, 100)
    camera.position.set(0, 0, 8)
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()

    const envelope = getSceneEnvelope([
      makeAnnotation('edge', [4, 0, 0]),
      makeAnnotation('center', [0, 0, 0]),
    ])

    const layout = getPanelLayout(
      new THREE.Vector3(4, 0, 0),
      camera,
      800,
      600,
      envelope,
      { width: 320, height: 240 },
      0,
      0.3,
      { x: 0, y: 0 }
    )

    const panelScreen = worldToScreen(layout.panelPos, camera, 800, 600)
    const marginX = Math.min(120, Math.max(800 * 0.12, 24))
    const marginY = Math.min(96, Math.max(600 * 0.12, 24))
    const maxX = Math.max(800 - 320 - marginX, marginX)
    const maxY = Math.max(600 - 240 - marginY, marginY)

    expect(panelScreen.x).toBeGreaterThanOrEqual(marginX)
    expect(panelScreen.x).toBeLessThanOrEqual(maxX)
    expect(panelScreen.y).toBeGreaterThanOrEqual(marginY)
    expect(panelScreen.y).toBeLessThanOrEqual(maxY)
  })
})
