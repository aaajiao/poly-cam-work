import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { Html, QuadraticBezierLine } from '@react-three/drei'
import { ExternalLink, GripVertical } from 'lucide-react'
import { useViewerStore } from '@/store/viewerStore'
import { imageStorage } from '@/storage/imageStorage'
import { extractVimeoId } from '@/utils/vimeo'
import { VimeoEmbed } from '@/components/ui/VimeoEmbed'
import { cn } from '@/lib/utils'
import type { Annotation, AnnotationImage } from '@/types'

const DEFAULT_SCENE_RADIUS = 12
const MODEL_SCREEN_LARGE_THRESHOLD = 260
const PANEL_SCREEN_OFFSET_FOR_LARGE_MODEL = 96
const PANEL_SCREEN_OFFSET_FOR_SMALL_MODEL = 150
const PANEL_SCREEN_SAFE_MARGIN_X = 120
const PANEL_SCREEN_SAFE_MARGIN_Y = 96
const CAMERA_POSITION_EPSILON_SQ = 0.04
const CAMERA_ROTATION_EPSILON = 0.0008
const CAMERA_FOV_EPSILON = 0.25
const CAMERA_SETTLE_DELAY = 0.26
const PANEL_REPOSITION_BASE_DURATION = 0.18
const PANEL_REPOSITION_MIN_DURATION = 0.42
const PANEL_REPOSITION_MAX_DURATION = 1.05
const PANEL_REPOSITION_PIXELS_PER_SECOND = 420

function easeInOutQuart(t: number) {
  return t < 0.5
    ? 8 * t * t * t * t
    : 1 - Math.pow(-2 * t + 2, 4) / 2
}

type LineMaterialMutable = THREE.Material & {
  lineWidth?: number
  linewidth?: number
  opacity?: number
  transparent?: boolean
}

interface BezierLineHandle {
  setPoints: (
    start: THREE.Vector3 | [number, number, number],
    end: THREE.Vector3 | [number, number, number],
    mid: THREE.Vector3 | [number, number, number]
  ) => void
  material?: THREE.Material | THREE.Material[]
}

function withLineMaterials(line: BezierLineHandle | null, mutate: (material: LineMaterialMutable) => void) {
  if (!line || !line.material) return

  const materials = Array.isArray(line.material) ? line.material : [line.material]
  for (const material of materials) {
    mutate(material as LineMaterialMutable)
  }
}

function setLineWidth(line: BezierLineHandle | null, width: number) {
  withLineMaterials(line, (material) => {
    if (typeof material.lineWidth === 'number') {
      material.lineWidth = width
    }
    if (typeof material.linewidth === 'number') {
      material.linewidth = width
    }
  })
}

function setLineOpacity(line: BezierLineHandle | null, opacity: number) {
  withLineMaterials(line, (material) => {
    if (typeof material.opacity === 'number') {
      material.opacity = opacity
      material.transparent = opacity < 1
    }
  })
}

interface SceneEnvelope {
  center: [number, number, number]
  radius: number
}

function getSceneEnvelope(annotations: Annotation[]): SceneEnvelope {
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

interface PanelLayout {
  panelPos: THREE.Vector3
  midPos: THREE.Vector3
}

interface PanelSize {
  width: number
  height: number
}

interface ScreenOffset {
  x: number
  y: number
}

interface TransitionProfile {
  durationScale: number
  delay: number
  lateralPixels: number
  verticalFactor: number
  lateralSign: -1 | 1
  verticalSign: -1 | 1
  phase: number
}

function hashString(value: string) {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function createTransitionProfile(annotationId: string, transitionIndex: number, panelCount: number): TransitionProfile {
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

function worldToScreen(point: THREE.Vector3, camera: THREE.Camera, viewportWidth: number, viewportHeight: number) {
  const projected = point.clone().project(camera)
  return {
    x: (projected.x * 0.5 + 0.5) * viewportWidth,
    y: (-projected.y * 0.5 + 0.5) * viewportHeight,
    z: projected.z,
  }
}

function screenToWorld(
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

function getPanelLayout(
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
  const midY = THREE.MathUtils.clamp((markerScreen.y + clampedY) * 0.5 - arcLift, marginY, viewportHeight - marginY)
  const midPos = screenToWorld(midX, midY, clampedNdcZ, camera, viewportWidth, viewportHeight)

  return { panelPos, midPos }
}

interface ResizableMediaProps {
  children: ReactNode
  defaultWidth?: number
  defaultHeight?: number
  minWidth?: number
  maxWidth?: number
  minHeight?: number
  maxHeight?: number
  maintainAspectRatio?: boolean
  showHandleAlways?: boolean
}

function ResizableMedia({
  children,
  defaultWidth,
  defaultHeight,
  minWidth = 100,
  maxWidth = 600,
  minHeight = 60,
  maxHeight = 400,
  maintainAspectRatio = false,
  showHandleAlways = false,
}: ResizableMediaProps) {
  const setCameraControlsEnabled = useViewerStore((s) => s.setCameraControlsEnabled)
  const [size, setSize] = useState({
    width: defaultWidth,
    height: defaultHeight,
  })
  const hasUserResizedRef = useRef(false)
  const isDragging = useRef(false)
  const startPos = useRef({ x: 0, y: 0 })
  const startSize = useRef({ width: defaultWidth ?? 0, height: defaultHeight ?? 0 })
  const detachListenersRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (hasUserResizedRef.current) return
    setSize({
      width: defaultWidth,
      height: maintainAspectRatio ? undefined : defaultHeight,
    })
  }, [defaultWidth, defaultHeight, maintainAspectRatio])

  useEffect(() => {
    return () => {
      detachListenersRef.current?.()
      detachListenersRef.current = null
      setCameraControlsEnabled(true)
    }
  }, [setCameraControlsEnabled])

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    detachListenersRef.current?.()
    detachListenersRef.current = null
    hasUserResizedRef.current = true
    isDragging.current = true
    setCameraControlsEnabled(false)
    startPos.current = { x: e.clientX, y: e.clientY }
    startSize.current = {
      width: size.width ?? defaultWidth ?? 200,
      height: size.height ?? defaultHeight ?? 100,
    }

    const handleMouseMove = (event: MouseEvent) => {
      if (!isDragging.current) return

      const dx = event.clientX - startPos.current.x
      const dy = event.clientY - startPos.current.y

      if (maintainAspectRatio) {
        const newWidth = Math.min(maxWidth, Math.max(minWidth, startSize.current.width + dx))
        setSize({ width: newWidth, height: undefined })
        return
      }

      const newWidth = defaultWidth !== undefined
        ? Math.min(maxWidth, Math.max(minWidth, startSize.current.width + dx))
        : undefined
      const newHeight = defaultHeight !== undefined
        ? Math.min(maxHeight, Math.max(minHeight, startSize.current.height + dy))
        : undefined

      setSize({ width: newWidth, height: newHeight })
    }

    const handleMouseUp = () => {
      isDragging.current = false
      setCameraControlsEnabled(true)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('blur', handleMouseUp)
      detachListenersRef.current = null
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('blur', handleMouseUp)
    detachListenersRef.current = () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('blur', handleMouseUp)
    }
  }

  return (
    <div
      className="group relative"
      style={{
        width: size.width !== undefined ? `${size.width}px` : undefined,
        height: size.height !== undefined ? `${size.height}px` : undefined,
      }}
    >
      {children}
      <div
        className={cn(
          'absolute bottom-1 right-1 z-20 flex h-5 w-5 items-center justify-center rounded-sm border border-zinc-600 bg-zinc-900/90 text-zinc-100 transition-opacity',
          showHandleAlways ? 'opacity-90 hover:opacity-100' : 'opacity-0 group-hover:opacity-100 hover:opacity-100'
        )}
        style={{ cursor: 'nwse-resize', pointerEvents: 'auto' }}
        onMouseDown={handleMouseDown}
        aria-label="Resize media"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M9 3L3 9M9 6L6 9M9 9H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  )
}

function readImageAspectRatio(url: string): Promise<number> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        resolve(img.naturalWidth / img.naturalHeight)
        return
      }
      resolve(4 / 3)
    }
    img.onerror = () => resolve(4 / 3)
    img.src = url
  })
}

interface ImageThumbnailsProps {
  images: AnnotationImage[]
  onPrimaryAspectRatioChange: (aspectRatio: number) => void
}

interface LoadedThumb {
  sourceUrl: string
  aspectRatio: number
}

function isRemoteImage(image: AnnotationImage): image is Extract<AnnotationImage, { url: string }> {
  return 'url' in image && typeof image.url === 'string' && image.url.length > 0
}

function isLocalImage(image: AnnotationImage): image is Extract<AnnotationImage, { localId: string }> {
  return 'localId' in image && typeof image.localId === 'string' && image.localId.length > 0
}

function imageKey(image: AnnotationImage): string {
  return isRemoteImage(image) ? `remote:${image.url}` : `local:${image.localId}`
}

function isGifFilename(filename: string): boolean {
  return /\.gif$/i.test(filename.trim())
}

function ImageThumbnails({ images, onPrimaryAspectRatioChange }: ImageThumbnailsProps) {
  const [thumbs, setThumbs] = useState<Record<string, LoadedThumb>>({})

  useEffect(() => {
    let active = true
    const objectUrls: string[] = []

    const load = async () => {
      const nextThumbs: Record<string, LoadedThumb> = {}
      for (const img of images) {
        const key = imageKey(img)

        if (isRemoteImage(img)) {
          const aspectRatio = await readImageAspectRatio(img.url)
          nextThumbs[key] = {
            sourceUrl: img.url,
            aspectRatio: THREE.MathUtils.clamp(aspectRatio, 0.55, 2.4),
          }
          continue
        }

        if (!isLocalImage(img)) continue
        const sourceBlob = isGifFilename(img.filename)
          ? await imageStorage.get(img.localId)
          : (await imageStorage.getThumbnail(img.localId)) ?? (await imageStorage.get(img.localId))
        if (!sourceBlob) continue

        const objectUrl = URL.createObjectURL(sourceBlob)
        objectUrls.push(objectUrl)
        const aspectRatio = await readImageAspectRatio(objectUrl)
        nextThumbs[key] = {
          sourceUrl: objectUrl,
          aspectRatio: THREE.MathUtils.clamp(aspectRatio, 0.55, 2.4),
        }
      }

      if (!active) {
        for (const objectUrl of objectUrls) {
          URL.revokeObjectURL(objectUrl)
        }
        return
      }

      setThumbs(nextThumbs)
    }

    void load()

    return () => {
      active = false
      for (const objectUrl of objectUrls) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [images])

  useEffect(() => {
    const first = images[0]
    if (!first) return
    const firstThumb = thumbs[imageKey(first)]
    if (!firstThumb) return
    onPrimaryAspectRatioChange(firstThumb.aspectRatio)
  }, [images, thumbs, onPrimaryAspectRatioChange])

  if (images.length === 1) {
    const single = images[0]
    const singleThumb = thumbs[imageKey(single)]
    return (
      <div
        className="overflow-hidden rounded bg-zinc-800"
        style={{ aspectRatio: singleThumb?.aspectRatio ?? 4 / 3 }}
      >
        {singleThumb ? (
          <img
            src={singleThumb.sourceUrl}
            alt={single.filename}
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="h-full w-full animate-pulse bg-zinc-800" />
        )}
      </div>
    )
  }

  const gridCols = images.length === 2 ? 'grid-cols-2' : 'grid-cols-3'

  return (
    <div className={cn('grid gap-1', gridCols)}>
      {images.map((img) => {
        const thumb = thumbs[imageKey(img)]
        return (
          <div key={imageKey(img)} className="overflow-hidden rounded bg-zinc-800">
            {thumb ? (
              <img
                src={thumb.sourceUrl}
                alt={img.filename}
                className="block h-auto w-full object-contain"
              />
            ) : (
              <div className="h-full w-full animate-pulse bg-zinc-800" />
            )}
          </div>
        )
      })}
    </div>
  )
}

interface AnnotationFloatingPanelProps {
  annotation: Annotation
  envelope: SceneEnvelope
  panelIndex: number
  panelCount: number
  isLinkHighlighted: boolean
  zIndex: number
  onBringToFront: () => void
}

function AnnotationFloatingPanel({
  annotation,
  envelope,
  panelIndex,
  panelCount,
  isLinkHighlighted,
  zIndex,
  onBringToFront,
}: AnnotationFloatingPanelProps) {
  const { camera, size } = useThree()
  const setCameraControlsEnabled = useViewerStore((s) => s.setCameraControlsEnabled)
  const setHoveredAnnotation = useViewerStore((s) => s.setHoveredAnnotation)
  const [entered, setEntered] = useState(false)
  const [isPanelDragging, setIsPanelDragging] = useState(false)
  const [primaryImageAspectRatio, setPrimaryImageAspectRatio] = useState(4 / 3)
  const offsetSeed = useMemo(() => {
    let hash = 0
    for (let i = 0; i < annotation.id.length; i++) {
      hash = (hash * 31 + annotation.id.charCodeAt(i)) % 1000
    }
    return hash / 1000 - 0.5
  }, [annotation.id])
  const linkPulseProfile = useMemo(() => {
    const seed = hashString(`${annotation.id}:panel-pulse`) / 0xffffffff
    return {
      speed: 3.2 + seed * 2,
      phase: seed * Math.PI * 2,
      lineAmplitude: 0.12 + seed * 0.12,
      glowAmplitude: 0.2 + seed * 0.2,
      titleDuration: 1.05 + seed * 0.65,
      titleScale: 1.045 + seed * 0.045,
      titleBrightness: 1.18 + seed * 0.22,
    }
  }, [annotation.id])
  const panelStyleProfile = useMemo(() => {
    let seed = hashString(`${annotation.id}:panel-style`)
    const next = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed / 0xffffffff
    }

    return {
      initialOffsetX: (next() - 0.5) * 56,
      initialOffsetY: (next() - 0.5) * 40,
      tiltDeg: (next() - 0.5) * 3.2,
    }
  }, [annotation.id])

  const dragOffsetRef = useRef<ScreenOffset>({
    x: panelStyleProfile.initialOffsetX,
    y: panelStyleProfile.initialOffsetY,
  })
  const isPanelDraggingRef = useRef(false)
  const didDragRef = useRef(false)
  const dragPointerIdRef = useRef<number | null>(null)
  const dragHandleElementRef = useRef<HTMLButtonElement | null>(null)
  const suppressClickUntilRef = useRef(0)
  const dragStartRef = useRef<ScreenOffset>({ x: 0, y: 0 })
  const dragStartOffsetRef = useRef<ScreenOffset>({ x: 0, y: 0 })
  const detachPanelDragRef = useRef<(() => void) | null>(null)
  const markerPos = useMemo(
    () => new THREE.Vector3(...annotation.position),
    [annotation.position]
  )
  const initialLayout = getPanelLayout(
    markerPos,
    camera,
    size.width,
    size.height,
    envelope,
    { width: 320, height: 220 },
    panelIndex,
    offsetSeed,
    dragOffsetRef.current
  )
  const panelLayoutRef = useRef<PanelLayout>({
    panelPos: initialLayout.panelPos.clone(),
    midPos: initialLayout.midPos.clone(),
  })
  const panelLayoutStartRef = useRef<PanelLayout>({
    panelPos: initialLayout.panelPos.clone(),
    midPos: initialLayout.midPos.clone(),
  })
  const panelLayoutTargetRef = useRef<PanelLayout>({
    panelPos: initialLayout.panelPos.clone(),
    midPos: initialLayout.midPos.clone(),
  })
  const panelLayoutTransitionRef = useRef(1)
  const panelTransitionDurationRef = useRef(PANEL_REPOSITION_MIN_DURATION)
  const panelTransitionDelayRef = useRef(0)
  const transitionIndexRef = useRef(0)
  const transitionLateralOffsetRef = useRef(new THREE.Vector3())
  const transitionVerticalOffsetRef = useRef(new THREE.Vector3())
  const transitionPhaseRef = useRef(0)
  const pendingRelayoutRef = useRef(false)
  const cameraMovingRef = useRef(false)
  const cameraStillTimeRef = useRef(0)
  const panelGroupRef = useRef<THREE.Group>(null)
  const panelRootRef = useRef<HTMLDivElement | null>(null)
  const panelSizeRef = useRef<PanelSize>({ width: 320, height: 220 })
  const panelSizeVersionRef = useRef(0)
  const lastPanelSizeVersionRef = useRef(0)
  const lineRef = useRef<BezierLineHandle | null>(null)
  const glowRef = useRef<BezierLineHandle | null>(null)
  const lineProgressRef = useRef(0)
  const currentEndRef = useRef(new THREE.Vector3())
  const currentMidRef = useRef(new THREE.Vector3())
  const lastCameraPosRef = useRef(new THREE.Vector3().copy(camera.position))
  const lastCameraQuatRef = useRef(new THREE.Quaternion().copy(camera.quaternion))
  const lastCameraFovRef = useRef(camera instanceof THREE.PerspectiveCamera ? camera.fov : 50)
  const lineColor = isLinkHighlighted ? '#f8fafc' : 'white'
  const baseLineWidth = isLinkHighlighted ? 4.2 : 2
  const baseGlowWidth = isLinkHighlighted ? 12 : 6
  const baseGlowOpacity = isLinkHighlighted ? 0.38 : 0.15
  const titleStyle = useMemo(() => {
    const style: CSSProperties & Record<string, string> = {
      textShadow:
        '0 0 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.5), 1px 1px 2px rgba(0,0,0,0.9), -1px -1px 2px rgba(0,0,0,0.9), 1px -1px 2px rgba(0,0,0,0.9), -1px 1px 2px rgba(0,0,0,0.9)',
      WebkitTextStroke: '0.5px rgba(0,0,0,0.6)',
    }

    if (isLinkHighlighted) {
      style['--title-pulse-duration'] = `${linkPulseProfile.titleDuration.toFixed(2)}s`
      style['--title-pulse-scale'] = linkPulseProfile.titleScale.toFixed(3)
      style['--title-pulse-brightness'] = linkPulseProfile.titleBrightness.toFixed(3)
    }

    return style
  }, [isLinkHighlighted, linkPulseProfile])

  const computeLayout = useMemo(
    () => () => {
      return getPanelLayout(
        markerPos,
        camera,
        size.width,
        size.height,
        envelope,
        panelSizeRef.current,
        panelIndex,
        offsetSeed,
        dragOffsetRef.current
      )
    },
    [markerPos, camera, size.width, size.height, envelope, panelIndex, offsetSeed]
  )

  const applyLayoutImmediate = useMemo(
    () => () => {
      const nextLayout = computeLayout()
      panelLayoutRef.current.panelPos.copy(nextLayout.panelPos)
      panelLayoutRef.current.midPos.copy(nextLayout.midPos)
      panelLayoutStartRef.current.panelPos.copy(nextLayout.panelPos)
      panelLayoutStartRef.current.midPos.copy(nextLayout.midPos)
      panelLayoutTargetRef.current.panelPos.copy(nextLayout.panelPos)
      panelLayoutTargetRef.current.midPos.copy(nextLayout.midPos)
      panelLayoutTransitionRef.current = 1
      panelTransitionDurationRef.current = PANEL_REPOSITION_MIN_DURATION
      panelTransitionDelayRef.current = 0
      transitionLateralOffsetRef.current.set(0, 0, 0)
      transitionVerticalOffsetRef.current.set(0, 0, 0)
      transitionPhaseRef.current = 0
    },
    [computeLayout]
  )

  const startLayoutTransition = useMemo(
    () => () => {
      const nextLayout = computeLayout()
      const currentScreen = worldToScreen(panelLayoutRef.current.panelPos, camera, size.width, size.height)
      const nextScreen = worldToScreen(nextLayout.panelPos, camera, size.width, size.height)
      const screenDistance = Math.hypot(nextScreen.x - currentScreen.x, nextScreen.y - currentScreen.y)
      const pathLength = panelLayoutRef.current.panelPos.distanceTo(nextLayout.panelPos)

      transitionIndexRef.current += 1
      const profile = createTransitionProfile(annotation.id, transitionIndexRef.current, panelCount)

      panelLayoutStartRef.current.panelPos.copy(panelLayoutRef.current.panelPos)
      panelLayoutStartRef.current.midPos.copy(panelLayoutRef.current.midPos)
      panelLayoutTargetRef.current.panelPos.copy(nextLayout.panelPos)
      panelLayoutTargetRef.current.midPos.copy(nextLayout.midPos)
      panelLayoutTransitionRef.current = 0

      panelTransitionDurationRef.current = THREE.MathUtils.clamp(
        PANEL_REPOSITION_BASE_DURATION + screenDistance / PANEL_REPOSITION_PIXELS_PER_SECOND,
        PANEL_REPOSITION_MIN_DURATION,
        PANEL_REPOSITION_MAX_DURATION
      ) * profile.durationScale
      panelTransitionDurationRef.current = THREE.MathUtils.clamp(
        panelTransitionDurationRef.current,
        PANEL_REPOSITION_MIN_DURATION,
        PANEL_REPOSITION_MAX_DURATION
      )

      panelTransitionDelayRef.current = screenDistance > 8 ? profile.delay : 0
      transitionPhaseRef.current = profile.phase

      if (screenDistance < 10 || pathLength < 0.05) {
        transitionLateralOffsetRef.current.set(0, 0, 0)
        transitionVerticalOffsetRef.current.set(0, 0, 0)
        return
      }

      const midpoint = panelLayoutRef.current.panelPos.clone().lerp(nextLayout.panelPos, 0.5)
      const depth = camera.position.distanceTo(midpoint)
      const fovRadians = camera instanceof THREE.PerspectiveCamera
        ? THREE.MathUtils.degToRad(camera.fov)
        : THREE.MathUtils.degToRad(50)
      const worldPerPixel = (2 * depth * Math.tan(fovRadians * 0.5)) / Math.max(size.height, 1)

      const pathDir = nextLayout.panelPos.clone().sub(panelLayoutRef.current.panelPos)
      if (pathDir.lengthSq() < 0.0001) {
        transitionLateralOffsetRef.current.set(0, 0, 0)
        transitionVerticalOffsetRef.current.set(0, 0, 0)
        return
      }

      pathDir.normalize()
      const upAxis = camera.up.clone()
      if (upAxis.lengthSq() < 0.0001) {
        upAxis.set(0, 1, 0)
      }
      upAxis.normalize()

      const sideAxis = new THREE.Vector3().crossVectors(pathDir, upAxis)
      if (sideAxis.lengthSq() < 0.0001) {
        sideAxis.crossVectors(pathDir, camera.position.clone().sub(panelLayoutRef.current.panelPos))
      }
      if (sideAxis.lengthSq() < 0.0001) {
        sideAxis.set(1, 0, 0)
      }
      sideAxis.normalize()

      const lateralAmplitude = profile.lateralPixels * worldPerPixel * profile.lateralSign
      const verticalAmplitude = lateralAmplitude * profile.verticalFactor * profile.verticalSign

      transitionLateralOffsetRef.current.copy(sideAxis).multiplyScalar(lateralAmplitude)
      transitionVerticalOffsetRef.current.copy(upAxis).multiplyScalar(verticalAmplitude)
    },
    [computeLayout, camera, size.width, size.height, annotation.id, panelCount]
  )

  const syncPanelPositionAndLine = useMemo(
    () => () => {
      const { panelPos, midPos } = panelLayoutRef.current
      panelGroupRef.current?.position.copy(panelPos)
      lineRef.current?.setPoints(markerPos, panelPos, midPos)
      glowRef.current?.setPoints(markerPos, panelPos, midPos)
    },
    [markerPos]
  )

  const applyDraggedLayoutImmediately = useMemo(
    () => () => {
      applyLayoutImmediate()
      lineProgressRef.current = 1
      syncPanelPositionAndLine()
    },
    [applyLayoutImmediate, syncPanelPositionAndLine]
  )

  const handleDragStart = useMemo(
    () => (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault()
      e.stopPropagation()

      onBringToFront()
      setHoveredAnnotation(annotation.id)

      dragPointerIdRef.current = e.pointerId
      dragHandleElementRef.current = e.currentTarget
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.setPointerCapture(e.pointerId)
      }

      detachPanelDragRef.current?.()
      detachPanelDragRef.current = null

      isPanelDraggingRef.current = true
      didDragRef.current = false
      setIsPanelDragging(true)
      setCameraControlsEnabled(false)
      dragStartRef.current = { x: e.clientX, y: e.clientY }
      dragStartOffsetRef.current = { ...dragOffsetRef.current }

      const handlePointerMove = (event: PointerEvent) => {
        if (!isPanelDraggingRef.current) return

        const dx = event.clientX - dragStartRef.current.x
        const dy = event.clientY - dragStartRef.current.y

        if (!didDragRef.current && Math.hypot(dx, dy) >= 2) {
          didDragRef.current = true
        }

        dragOffsetRef.current = {
          x: dragStartOffsetRef.current.x + dx,
          y: dragStartOffsetRef.current.y + dy,
        }

        applyDraggedLayoutImmediately()
      }

      const stopDragging = () => {
        if (!isPanelDraggingRef.current) return
        isPanelDraggingRef.current = false
        setIsPanelDragging(false)
        setCameraControlsEnabled(true)
        setHoveredAnnotation(null)
        pendingRelayoutRef.current = true

        if (didDragRef.current) {
          suppressClickUntilRef.current = performance.now() + 180
        }

        const handleElement = dragHandleElementRef.current
        const pointerId = dragPointerIdRef.current
        if (handleElement && pointerId !== null && handleElement.hasPointerCapture(pointerId)) {
          handleElement.releasePointerCapture(pointerId)
        }
        dragHandleElementRef.current = null
        dragPointerIdRef.current = null

        window.removeEventListener('pointermove', handlePointerMove)
        window.removeEventListener('pointerup', stopDragging)
        window.removeEventListener('pointercancel', stopDragging)
        window.removeEventListener('blur', stopDragging)
        detachPanelDragRef.current = null
      }

      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('pointerup', stopDragging)
      window.addEventListener('pointercancel', stopDragging)
      window.addEventListener('blur', stopDragging)

      detachPanelDragRef.current = () => {
        window.removeEventListener('pointermove', handlePointerMove)
        window.removeEventListener('pointerup', stopDragging)
        window.removeEventListener('pointercancel', stopDragging)
        window.removeEventListener('blur', stopDragging)

        const handleElement = dragHandleElementRef.current
        const pointerId = dragPointerIdRef.current
        if (handleElement && pointerId !== null && handleElement.hasPointerCapture(pointerId)) {
          handleElement.releasePointerCapture(pointerId)
        }
        dragHandleElementRef.current = null
        dragPointerIdRef.current = null
      }
    },
    [
      annotation.id,
      applyDraggedLayoutImmediately,
      onBringToFront,
      setHoveredAnnotation,
      setCameraControlsEnabled,
    ]
  )

  useEffect(() => {
    const root = panelRootRef.current
    if (!root) return

    const updateSize = () => {
      const rect = root.getBoundingClientRect()
      const nextWidth = Math.max(Math.round(rect.width), 220)
      const nextHeight = Math.max(Math.round(rect.height), 120)
      if (nextWidth !== panelSizeRef.current.width || nextHeight !== panelSizeRef.current.height) {
        panelSizeRef.current = { width: nextWidth, height: nextHeight }
        panelSizeVersionRef.current += 1
      }
    }

    updateSize()
    if (typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(() => updateSize())
    observer.observe(root)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    applyLayoutImmediate()
    lastPanelSizeVersionRef.current = panelSizeVersionRef.current
    lastCameraPosRef.current.copy(camera.position)
    lastCameraQuatRef.current.copy(camera.quaternion)
    lastCameraFovRef.current = camera instanceof THREE.PerspectiveCamera ? camera.fov : 50
    pendingRelayoutRef.current = false
    cameraMovingRef.current = false
    cameraStillTimeRef.current = 0
  }, [applyLayoutImmediate, camera])

  useEffect(() => {
    pendingRelayoutRef.current = true
  }, [panelIndex])

  useEffect(() => {
    setPrimaryImageAspectRatio(4 / 3)
  }, [annotation.id])

  useEffect(() => {
    setEntered(false)
    lineProgressRef.current = 0
    const timeout = setTimeout(() => setEntered(true), 40)
    return () => clearTimeout(timeout)
  }, [annotation.id])

  useEffect(() => {
    return () => {
      detachPanelDragRef.current?.()
      detachPanelDragRef.current = null
      isPanelDraggingRef.current = false
      setIsPanelDragging(false)
      setCameraControlsEnabled(true)
      setHoveredAnnotation(null)
    }
  }, [setCameraControlsEnabled, setHoveredAnnotation])

  useFrame((state, delta) => {
    let layoutChanged = false

    if (isPanelDraggingRef.current) {
      const { panelPos, midPos } = panelLayoutRef.current
      const pulseWave = Math.sin(state.clock.elapsedTime * linkPulseProfile.speed + linkPulseProfile.phase)
      const pulseFactor = isLinkHighlighted ? 1 + pulseWave * linkPulseProfile.lineAmplitude : 1
      const glowWave = Math.sin(
        state.clock.elapsedTime * (linkPulseProfile.speed * 1.06) + linkPulseProfile.phase + 1.1
      )
      const glowPulseFactor = isLinkHighlighted ? 1 + glowWave * linkPulseProfile.glowAmplitude : 1

      setLineWidth(lineRef.current, baseLineWidth * pulseFactor)
      setLineWidth(glowRef.current, baseGlowWidth * pulseFactor)
      setLineOpacity(glowRef.current, baseGlowOpacity * glowPulseFactor)

      panelGroupRef.current?.position.copy(panelPos)
      lineRef.current?.setPoints(markerPos, panelPos, midPos)
      glowRef.current?.setPoints(markerPos, panelPos, midPos)
      return
    }

    const cameraMoved = lastCameraPosRef.current.distanceToSquared(camera.position) > CAMERA_POSITION_EPSILON_SQ
    const cameraRotated = 1 - Math.abs(lastCameraQuatRef.current.dot(camera.quaternion)) > CAMERA_ROTATION_EPSILON
    const currentFov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 50
    const fovChanged = Math.abs(currentFov - lastCameraFovRef.current) > CAMERA_FOV_EPSILON
    const panelMeasured = panelSizeVersionRef.current !== lastPanelSizeVersionRef.current

    if (cameraMoved || cameraRotated || fovChanged) {
      cameraMovingRef.current = true
      cameraStillTimeRef.current = 0
      pendingRelayoutRef.current = true
      lastCameraPosRef.current.copy(camera.position)
      lastCameraQuatRef.current.copy(camera.quaternion)
      lastCameraFovRef.current = currentFov
    } else if (cameraMovingRef.current) {
      cameraStillTimeRef.current += delta
      if (cameraStillTimeRef.current >= CAMERA_SETTLE_DELAY) {
        cameraMovingRef.current = false
      }
    }

    if (panelMeasured) {
      lastPanelSizeVersionRef.current = panelSizeVersionRef.current
      pendingRelayoutRef.current = true
    }

    if (pendingRelayoutRef.current && !cameraMovingRef.current) {
      startLayoutTransition()
      pendingRelayoutRef.current = false
      cameraStillTimeRef.current = 0
    }

    if (panelLayoutTransitionRef.current < 1) {
      if (panelTransitionDelayRef.current > 0) {
        panelTransitionDelayRef.current = Math.max(panelTransitionDelayRef.current - delta, 0)
      } else {
        const transitionDuration = Math.max(panelTransitionDurationRef.current, PANEL_REPOSITION_MIN_DURATION)
        const nextProgress = Math.min(
          panelLayoutTransitionRef.current + delta / transitionDuration,
          1
        )
        if (nextProgress !== panelLayoutTransitionRef.current) {
          layoutChanged = true
        }
        panelLayoutTransitionRef.current = nextProgress

        const t = panelLayoutTransitionRef.current
        const eased = easeInOutQuart(t)
        const arc = Math.sin(Math.PI * eased)
        const sway = Math.sin(Math.PI * 2 * eased + transitionPhaseRef.current)
        const lateralFactor = arc * (1 + sway * 0.22)
        const verticalFactor = arc * arc

        panelLayoutRef.current.panelPos
          .copy(panelLayoutStartRef.current.panelPos)
          .lerp(panelLayoutTargetRef.current.panelPos, eased)
          .addScaledVector(transitionLateralOffsetRef.current, lateralFactor)
          .addScaledVector(transitionVerticalOffsetRef.current, verticalFactor)

        panelLayoutRef.current.midPos
          .copy(panelLayoutStartRef.current.midPos)
          .lerp(panelLayoutTargetRef.current.midPos, eased)
          .addScaledVector(transitionLateralOffsetRef.current, lateralFactor * 0.7)
          .addScaledVector(transitionVerticalOffsetRef.current, verticalFactor * 1.25)
      }
    } else {
      const panelDiff = panelLayoutRef.current.panelPos.distanceToSquared(panelLayoutTargetRef.current.panelPos)
      const midDiff = panelLayoutRef.current.midPos.distanceToSquared(panelLayoutTargetRef.current.midPos)
      if (panelDiff > 0.000001 || midDiff > 0.000001) {
        panelLayoutRef.current.panelPos.copy(panelLayoutTargetRef.current.panelPos)
        panelLayoutRef.current.midPos.copy(panelLayoutTargetRef.current.midPos)
        layoutChanged = true
      }
    }

    const { panelPos, midPos } = panelLayoutRef.current
    const hasLineEntryAnimation = lineProgressRef.current < 1
    const pulseWave = Math.sin(state.clock.elapsedTime * linkPulseProfile.speed + linkPulseProfile.phase)
    const pulseFactor = isLinkHighlighted ? 1 + pulseWave * linkPulseProfile.lineAmplitude : 1
    const glowWave = Math.sin(
      state.clock.elapsedTime * (linkPulseProfile.speed * 1.06) + linkPulseProfile.phase + 1.1
    )
    const glowPulseFactor = isLinkHighlighted ? 1 + glowWave * linkPulseProfile.glowAmplitude : 1

    setLineWidth(lineRef.current, baseLineWidth * pulseFactor)
    setLineWidth(glowRef.current, baseGlowWidth * pulseFactor)
    setLineOpacity(glowRef.current, baseGlowOpacity * glowPulseFactor)

    if (layoutChanged || hasLineEntryAnimation) {
      panelGroupRef.current?.position.copy(panelPos)
    }

    if (!layoutChanged && !hasLineEntryAnimation) {
      return
    }

    if (!hasLineEntryAnimation) {
      lineRef.current?.setPoints(markerPos, panelPos, midPos)
      glowRef.current?.setPoints(markerPos, panelPos, midPos)
      return
    }

    lineProgressRef.current = Math.min(lineProgressRef.current + delta / 0.3, 1)

    const t = lineProgressRef.current
    const currentEnd = currentEndRef.current.copy(markerPos).lerp(panelPos, t)
    const currentMid = currentMidRef.current.copy(markerPos).lerp(midPos, t)

    lineRef.current?.setPoints(markerPos, currentEnd, currentMid)
    glowRef.current?.setPoints(markerPos, currentEnd, currentMid)
  })

  const { panelPos, midPos } = panelLayoutRef.current
  const vimeoId = annotation.videoUrl ? extractVimeoId(annotation.videoUrl) : null
  const singleImage = annotation.images.length === 1
  const defaultImageWidth = THREE.MathUtils.clamp(Math.round(190 * primaryImageAspectRatio), 240, 420)
  const minImageWidth = THREE.MathUtils.clamp(Math.round(defaultImageWidth * 0.7), 180, 280)

  return (
    <>
      <QuadraticBezierLine
        ref={lineRef}
        start={markerPos}
        end={panelPos}
        mid={midPos}
        color={lineColor}
        lineWidth={baseLineWidth}
      />
      <QuadraticBezierLine
        ref={glowRef}
        start={markerPos}
        end={panelPos}
        mid={midPos}
        color={lineColor}
        lineWidth={baseGlowWidth}
        transparent
        opacity={baseGlowOpacity}
      />
      <group ref={panelGroupRef}>
      <Html
        position={[0, 0, 0]}
        occlude={false}
      >
        <div
          ref={panelRootRef}
          data-testid={`annotation-panel-${annotation.id}`}
          className={cn(vimeoId ? 'w-fit max-w-[42rem]' : 'max-w-xs')}
          style={{
            pointerEvents: 'auto',
            transform: entered
              ? `scale(1) rotate(${isPanelDragging ? panelStyleProfile.tiltDeg * 0.35 : panelStyleProfile.tiltDeg}deg)`
              : `scale(0.85) rotate(${panelStyleProfile.tiltDeg * 0.8}deg)`,
            opacity: entered ? 1 : 0,
            transition: 'transform 300ms cubic-bezier(0.16, 1, 0.3, 1), opacity 300ms cubic-bezier(0.16, 1, 0.3, 1)',
            transformOrigin: 'bottom left',
            zIndex,
          }}
          onClick={(e) => e.stopPropagation()}
          onClickCapture={(e) => {
            if (performance.now() < suppressClickUntilRef.current) {
              e.preventDefault()
              e.stopPropagation()
            }
          }}
          onPointerDownCapture={() => onBringToFront()}
        >
          <div className="flex items-start gap-1.5 pb-1">
            <button
              type="button"
              data-testid={`annotation-panel-drag-${annotation.id}`}
              className={cn(
                'mt-[1px] inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border border-zinc-700/80 bg-zinc-900/85 text-zinc-300 transition-colors',
                isPanelDragging
                  ? 'cursor-grabbing border-blue-400/80 text-blue-200'
                  : 'cursor-grab hover:border-zinc-500 hover:text-zinc-100'
              )}
              onPointerDown={handleDragStart}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
              }}
              aria-label="Drag annotation panel"
              title="Drag panel"
            >
              <GripVertical size={11} />
            </button>
            <h3
              className={cn(
                'text-sm font-semibold leading-tight text-white',
                isLinkHighlighted && 'annotation-title-pulse'
              )}
              style={titleStyle}
            >
              {annotation.title}
            </h3>
          </div>

          <div className="space-y-2 pt-1">
            {annotation.description && (
              <p
                className="line-clamp-3 text-xs leading-relaxed text-zinc-300"
                style={{
                  textShadow: '0 0 4px rgba(0,0,0,0.9), 1px 1px 2px rgba(0,0,0,0.9), -1px -1px 2px rgba(0,0,0,0.9)',
                }}
              >
                {annotation.description}
              </p>
            )}

            {annotation.images.length > 0 && (
              <ResizableMedia
                defaultWidth={singleImage ? defaultImageWidth : 320}
                defaultHeight={singleImage ? undefined : 180}
                minWidth={singleImage ? minImageWidth : 220}
                maxWidth={560}
                minHeight={120}
                maxHeight={400}
                maintainAspectRatio={singleImage}
                showHandleAlways
              >
                <ImageThumbnails
                  images={annotation.images}
                  onPrimaryAspectRatioChange={setPrimaryImageAspectRatio}
                />
              </ResizableMedia>
            )}

            {vimeoId && (
              <ResizableMedia
                defaultWidth={280}
                minWidth={180}
                maxWidth={520}
                maintainAspectRatio
                showHandleAlways
              >
                <VimeoEmbed videoId={vimeoId} sourceUrl={annotation.videoUrl} className="w-full" />
              </ResizableMedia>
            )}

            {annotation.links.length > 0 && (
              <div className="space-y-1">
                {annotation.links.map((link, i) => (
                  <a
                    key={i}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-blue-300 hover:text-blue-200"
                    style={{
                      textShadow: '0 0 4px rgba(0,0,0,0.9), 1px 1px 2px rgba(0,0,0,0.9), -1px -1px 2px rgba(0,0,0,0.9)',
                    }}
                  >
                    <ExternalLink size={10} />
                    <span className="truncate">{link.label || link.url}</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </Html>
      </group>
    </>
  )
}

export function AnnotationPanel() {
  const annotations = useViewerStore((s) => s.annotations)
  const activeSceneId = useViewerStore((s) => s.activeSceneId)
  const openAnnotationPanelIds = useViewerStore((s) => s.openAnnotationPanelIds)
  const hoveredAnnotationId = useViewerStore((s) => s.hoveredAnnotationId)
  const clearAnnotationPanels = useViewerStore((s) => s.clearAnnotationPanels)
  const selectAnnotation = useViewerStore((s) => s.selectAnnotation)
  const zCounterRef = useRef(20)
  const [panelZIndexById, setPanelZIndexById] = useState<Record<string, number>>({})

  const sceneAnnotations = useMemo(
    () => annotations.filter((annotation) => annotation.sceneId === activeSceneId),
    [annotations, activeSceneId]
  )

  const annotationMap = useMemo(() => {
    const map = new Map<string, Annotation>()
    for (const annotation of sceneAnnotations) {
      map.set(annotation.id, annotation)
    }
    return map
  }, [sceneAnnotations])

  const openAnnotations = useMemo(
    () => openAnnotationPanelIds
      .map((id) => annotationMap.get(id))
      .filter((annotation): annotation is Annotation => annotation !== undefined),
    [openAnnotationPanelIds, annotationMap]
  )

  useEffect(() => {
    setPanelZIndexById((prev) => {
      const next: Record<string, number> = {}
      let changed = false

      for (const annotation of openAnnotations) {
        if (prev[annotation.id] !== undefined) {
          next[annotation.id] = prev[annotation.id]
          continue
        }

        zCounterRef.current += 1
        next[annotation.id] = zCounterRef.current
        changed = true
      }

      if (Object.keys(prev).length !== Object.keys(next).length) {
        changed = true
      }

      return changed ? next : prev
    })
  }, [openAnnotations])

  const bringPanelToFront = (id: string) => {
    setPanelZIndexById((prev) => {
      zCounterRef.current += 1
      const nextZ = zCounterRef.current
      if (prev[id] === nextZ) return prev
      return { ...prev, [id]: nextZ }
    })
  }

  const envelope = useMemo(() => getSceneEnvelope(sceneAnnotations), [sceneAnnotations])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      clearAnnotationPanels()
      selectAnnotation(null)
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [clearAnnotationPanels, selectAnnotation])

  if (openAnnotations.length === 0) return null

  return (
    <>
      {openAnnotations.map((annotation, index) => (
        <AnnotationFloatingPanel
          key={annotation.id}
          annotation={annotation}
          envelope={envelope}
          panelIndex={index}
          panelCount={openAnnotations.length}
          isLinkHighlighted={hoveredAnnotationId === annotation.id}
          zIndex={panelZIndexById[annotation.id] ?? index + 1}
          onBringToFront={() => bringPanelToFront(annotation.id)}
        />
      ))}
    </>
  )
}
