import * as THREE from 'three'
import type { Annotation } from '@/types'

const DEFAULT_SCENE_RADIUS = 12
const MODEL_SCREEN_LARGE_THRESHOLD = 260
const PANEL_SCREEN_OFFSET_FOR_LARGE_MODEL = 96
const PANEL_SCREEN_OFFSET_FOR_SMALL_MODEL = 150
const PANEL_SCREEN_SAFE_MARGIN_X = 120
const PANEL_SCREEN_SAFE_MARGIN_Y = 96

export interface SceneEnvelope {
  center: [number, number, number]
  radius: number
}

export interface PanelLayout {
  panelPos: THREE.Vector3
  midPos: THREE.Vector3
}

export interface PanelSize {
  width: number
  height: number
}

export interface ScreenOffset {
  x: number
  y: number
}

export interface TransitionProfile {
  durationScale: number
  delay: number
  lateralPixels: number
  verticalFactor: number
  lateralSign: -1 | 1
  verticalSign: -1 | 1
  phase: number
}

export function hashString(value: string) {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}

export function easeInOutQuart(t: number) {
  return t < 0.5
    ? 8 * t * t * t * t
    : 1 - Math.pow(-2 * t + 2, 4) / 2
}

export function getSceneEnvelope(annotations: Annotation[]): SceneEnvelope {
  if (annotations.length === 0) {
    return {
      center: [0, 0, 0],
      radius: DEFAULT_SCENE_RADIUS,
    }
  }

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY

  for (const annotation of annotations) {
    const [x, y, z] = annotation.position
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (z < minZ) minZ = z
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
    if (z > maxZ) maxZ = z
  }

  const center: [number, number, number] = [
    (minX + maxX) * 0.5,
    (minY + maxY) * 0.5,
    (minZ + maxZ) * 0.5,
  ]

  const centerVector = new THREE.Vector3(...center)
  let radius = 0
  for (const annotation of annotations) {
    const dist = centerVector.distanceTo(new THREE.Vector3(...annotation.position))
    if (dist > radius) radius = dist
  }

  return {
    center,
    radius: Math.max(radius, DEFAULT_SCENE_RADIUS),
  }
}

export function createTransitionProfile(
  annotationId: string,
  transitionIndex: number,
  panelCount: number
): TransitionProfile {
  let seed = hashString(`${annotationId}:${transitionIndex}`)
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 0xffffffff
  }

  const crowdFactor = panelCount > 8 ? 0.55 : panelCount > 4 ? 0.72 : 1
  const speedVariance = panelCount > 8 ? 0.24 : 0.4

  return {
    durationScale: 0.9 + (next() - 0.5) * speedVariance,
    delay: next() * 0.11 * crowdFactor,
    lateralPixels: (12 + next() * 28) * crowdFactor,
    verticalFactor: (0.2 + next() * 0.3) * crowdFactor,
    lateralSign: next() > 0.5 ? 1 : -1,
    verticalSign: next() > 0.5 ? 1 : -1,
    phase: next() * Math.PI * 2,
  }
}

export function worldToScreen(
  point: THREE.Vector3,
  camera: THREE.Camera,
  viewportWidth: number,
  viewportHeight: number
) {
  const projected = point.clone().project(camera)
  return {
    x: (projected.x * 0.5 + 0.5) * viewportWidth,
    y: (-projected.y * 0.5 + 0.5) * viewportHeight,
    z: projected.z,
  }
}

export function screenToWorld(
  x: number,
  y: number,
  ndcZ: number,
  camera: THREE.Camera,
  viewportWidth: number,
  viewportHeight: number
) {
  return new THREE.Vector3(
    (x / Math.max(viewportWidth, 1)) * 2 - 1,
    -(y / Math.max(viewportHeight, 1)) * 2 + 1,
    ndcZ
  ).unproject(camera)
}

export function getPanelLayout(
  markerPos: THREE.Vector3,
  camera: THREE.Camera,
  viewportWidth: number,
  viewportHeight: number,
  envelope: SceneEnvelope,
  panelSize: PanelSize,
  panelIndex: number,
  offsetSeed: number,
  manualOffset: ScreenOffset
): PanelLayout {
  const markerScreen = worldToScreen(markerPos, camera, viewportWidth, viewportHeight)
  const sceneCenter = new THREE.Vector3(...envelope.center)
  const centerScreen = worldToScreen(sceneCenter, camera, viewportWidth, viewportHeight)

  const depth = camera.position.distanceTo(markerPos)
  const fovRadians = camera instanceof THREE.PerspectiveCamera
    ? THREE.MathUtils.degToRad(camera.fov)
    : THREE.MathUtils.degToRad(50)
  const worldPerPixel = (2 * depth * Math.tan(fovRadians * 0.5)) / Math.max(viewportHeight, 1)
  const modelRadiusPixels = envelope.radius / Math.max(worldPerPixel, 0.0001)
  const baseOffset = modelRadiusPixels > MODEL_SCREEN_LARGE_THRESHOLD
    ? PANEL_SCREEN_OFFSET_FOR_LARGE_MODEL
    : PANEL_SCREEN_OFFSET_FOR_SMALL_MODEL

  const outwardX = markerScreen.x - centerScreen.x
  const outwardY = markerScreen.y - centerScreen.y
  const outwardLen = Math.hypot(outwardX, outwardY)

  const horizontalBias = markerScreen.x < viewportWidth * 0.5 ? 1 : -1
  const verticalBias = markerScreen.y < viewportHeight * 0.42 ? 0.45 : -0.45

  const dirXBase = outwardLen > 0.001 ? outwardX / outwardLen : horizontalBias
  const dirYBase = outwardLen > 0.001 ? outwardY / outwardLen : verticalBias

  let dirX = dirXBase * 0.72 + horizontalBias * 0.48 + offsetSeed * 0.25
  let dirY = dirYBase * 0.56 + verticalBias * 0.36
  const dirLen = Math.hypot(dirX, dirY)
  if (dirLen > 0.001) {
    dirX /= dirLen
    dirY /= dirLen
  } else {
    dirX = horizontalBias
    dirY = verticalBias
  }

  const row = Math.floor(panelIndex / 3)
  const col = panelIndex % 3
  const stackX = (col - 1) * 26
  const stackY = row * 22

  const targetX = markerScreen.x + dirX * baseOffset + stackX + manualOffset.x
  const targetY = markerScreen.y + dirY * baseOffset + stackY + manualOffset.y

  const marginX = Math.min(PANEL_SCREEN_SAFE_MARGIN_X, Math.max(viewportWidth * 0.12, 24))
  const marginY = Math.min(PANEL_SCREEN_SAFE_MARGIN_Y, Math.max(viewportHeight * 0.12, 24))

  const maxX = Math.max(viewportWidth - panelSize.width - marginX, marginX)
  const maxY = Math.max(viewportHeight - panelSize.height - marginY, marginY)

  const clampedX = THREE.MathUtils.clamp(targetX, marginX, maxX)
  const clampedY = THREE.MathUtils.clamp(targetY, marginY, maxY)

  const clampedNdcZ = THREE.MathUtils.clamp(markerScreen.z, -0.95, 0.95)
  const panelPos = screenToWorld(clampedX, clampedY, clampedNdcZ, camera, viewportWidth, viewportHeight)

  const arcLift = Math.min(82, Math.max(32, baseOffset * 0.42))
  const midX = (markerScreen.x + clampedX) * 0.5
  const midY = THREE.MathUtils.clamp(
    (markerScreen.y + clampedY) * 0.5 - arcLift,
    marginY,
    viewportHeight - marginY
  )
  const midPos = screenToWorld(midX, midY, clampedNdcZ, camera, viewportWidth, viewportHeight)

  return { panelPos, midPos }
}
