import * as THREE from 'three'

export function calculateDistance(p1: THREE.Vector3, p2: THREE.Vector3): number {
  return p1.distanceTo(p2)
}

export function formatDistance(meters: number): string {
  if (meters < 0.01) return `${(meters * 1000).toFixed(1)} mm`
  if (meters < 1) return `${(meters * 100).toFixed(1)} cm`
  return `${meters.toFixed(2)} m`
}

export function calculatePolygonArea(points: THREE.Vector3[]): number {
  if (points.length < 3) return 0
  // Newell's method for 3D polygon area
  let area = 0
  const n = points.length
  const normal = new THREE.Vector3()

  for (let i = 0; i < n; i++) {
    const curr = points[i]
    const next = points[(i + 1) % n]
    normal.x += (curr.y - next.y) * (curr.z + next.z)
    normal.y += (curr.z - next.z) * (curr.x + next.x)
    normal.z += (curr.x - next.x) * (curr.y + next.y)
  }

  area = normal.length() / 2
  return area
}

export function getMidpoint(p1: THREE.Vector3, p2: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5)
}
