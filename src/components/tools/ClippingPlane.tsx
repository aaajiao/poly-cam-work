import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { useViewerStore } from '@/store/viewerStore'

export function ClippingPlaneController() {
  const { gl, scene } = useThree()
  const clipPlane = useViewerStore((s) => s.clipPlane)
  const planeRef = useRef(new THREE.Plane())

  useEffect(() => {
    if (!clipPlane.enabled) {
      gl.localClippingEnabled = false
      gl.clippingPlanes = []
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
          mats.forEach((mat: THREE.Material & { _originalSide?: THREE.Side }) => {
            if (mat._originalSide !== undefined) {
              mat.side = mat._originalSide
              mat.needsUpdate = true
            }
          })
        }
      })
      return
    }

    // position (0–1) maps to world range [-SCENE_HALF, +SCENE_HALF]
    const SCENE_HALF = 15
    const worldPos = (clipPlane.position - 0.5) * 2 * SCENE_HALF

    let normal: THREE.Vector3
    switch (clipPlane.axis) {
      case 'x': normal = new THREE.Vector3(1, 0, 0); break
      case 'z': normal = new THREE.Vector3(0, 0, 1); break
      default:  normal = new THREE.Vector3(0, 1, 0); break
    }

    if (clipPlane.flipped) normal.negate()

    planeRef.current.setFromNormalAndCoplanarPoint(
      normal,
      new THREE.Vector3(
        clipPlane.axis === 'x' ? worldPos : 0,
        clipPlane.axis === 'y' ? worldPos : 0,
        clipPlane.axis === 'z' ? worldPos : 0,
      )
    )

    gl.localClippingEnabled = true
    gl.clippingPlanes = [planeRef.current]

    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
        mats.forEach((mat: THREE.Material & { _originalSide?: THREE.Side }) => {
          if (mat._originalSide === undefined) {
            mat._originalSide = mat.side
          }
          // DoubleSide required: clipped surface exposes interior back-faces
          mat.side = THREE.DoubleSide
          mat.clippingPlanes = [planeRef.current]
          mat.needsUpdate = true
        })
      }
      // THREE.Points clipping is handled in the GPU fragment shader
      if (obj instanceof THREE.Points && obj.material instanceof THREE.Material) {
        obj.material.clippingPlanes = [planeRef.current]
        obj.material.needsUpdate = true
      }
    })
  }, [clipPlane, gl, scene])

  return null
}
