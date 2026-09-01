import { calculateScaleFactor } from '@react-three/drei'
import type { Size } from '@react-three/fiber'
import type * as THREE from 'three'

/** Converts a desired CSS-pixel radius into an object scale for a geometry. */
export function getWorldScaleForProjectedPixelRadius(
  position: THREE.Vector3,
  pixelRadius: number,
  camera: THREE.Camera,
  size: Size,
  geometryRadius: number
): number {
  if (pixelRadius <= 0 || geometryRadius <= 0) return 0

  return calculateScaleFactor(position, pixelRadius, camera, size) / geometryRadius
}
