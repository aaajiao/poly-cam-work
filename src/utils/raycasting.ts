import * as THREE from 'three'

/**
 * Updates raycaster Points threshold based on camera distance.
 * Without this, point cloud clicks require pixel-perfect precision.
 * Pattern from MeasurementTool — matches its threshold calculation.
 */
export function updatePointsThreshold(
  raycaster: THREE.Raycaster,
  camera: THREE.Camera
): void {
  const dist = camera.position.length()
  raycaster.params.Points = { threshold: 0.01 + dist * 0.005 }
}

/**
 * Performs raycasting on scene, separating mesh (precise) and points (threshold-based).
 * Returns all intersections sorted by distance.
 */
export function raycastScene(
  raycaster: THREE.Raycaster,
  scene: THREE.Scene,
  camera: THREE.Camera
): THREE.Intersection[] {
  updatePointsThreshold(raycaster, camera)

  const targets: THREE.Object3D[] = []
  scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
      targets.push(obj)
    }
  })

  return raycaster.intersectObjects(targets, false)
}
