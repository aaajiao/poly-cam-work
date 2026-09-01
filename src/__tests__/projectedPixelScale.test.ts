import type { Size } from '@react-three/fiber'
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'

import { getWorldScaleForProjectedPixelRadius } from '@/utils/projectedPixelScale'

const SIZE: Size = { width: 800, height: 600, top: 0, left: 0 }
const GEOMETRY_RADIUS = 0.12

function screenX(point: THREE.Vector3, camera: THREE.Camera) {
  return (point.clone().project(camera).x + 1) * (SIZE.width / 2)
}

function expectProjectedRadius(
  point: THREE.Vector3,
  camera: THREE.Camera,
  pixelRadius: number
) {
  camera.updateMatrixWorld(true)
  const worldScale = getWorldScaleForProjectedPixelRadius(
    point,
    pixelRadius,
    camera,
    SIZE,
    GEOMETRY_RADIUS
  )
  const cameraRight = new THREE.Vector3()
    .setFromMatrixColumn(camera.matrixWorld, 0)
    .normalize()
  const edge = point
    .clone()
    .addScaledVector(cameraRight, GEOMETRY_RADIUS * worldScale)

  expect(Math.abs(screenX(edge, camera) - screenX(point, camera))).toBeCloseTo(
    pixelRadius,
    5
  )
}

describe('getWorldScaleForProjectedPixelRadius', () => {
  it('keeps the requested perspective-camera radius at different depths', () => {
    const camera = new THREE.PerspectiveCamera(50, SIZE.width / SIZE.height, 0.1, 100)
    camera.position.set(0, 0, 10)
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()

    expectProjectedRadius(new THREE.Vector3(0, 0, 2), camera, 6)
    expectProjectedRadius(new THREE.Vector3(0, 0, -12), camera, 6)
  })

  it('supports orthographic projection and rejects invalid radii', () => {
    const camera = new THREE.OrthographicCamera(-4, 4, 3, -3, 0.1, 100)
    camera.position.set(0, 0, 10)
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()

    expectProjectedRadius(new THREE.Vector3(0, 0, 0), camera, 12)
    expect(
      getWorldScaleForProjectedPixelRadius(
        new THREE.Vector3(),
        0,
        camera,
        SIZE,
        GEOMETRY_RADIUS
      )
    ).toBe(0)
    expect(
      getWorldScaleForProjectedPixelRadius(
        new THREE.Vector3(),
        12,
        camera,
        SIZE,
        0
      )
    ).toBe(0)
  })
})
