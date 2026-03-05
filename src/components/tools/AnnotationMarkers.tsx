import { useRef, useMemo, useState, useCallback } from 'react'
import * as THREE from 'three'
import { useThree, useFrame, ThreeEvent } from '@react-three/fiber'
import { useViewerStore } from '@/store/viewerStore'
import type { Annotation } from '@/types'
import { AnnotationMarker } from './AnnotationMarker'

const FAR_THRESHOLD = 10
const MAX_HTML_MARKERS = 15
// Must match ClippingPlane.tsx SCENE_HALF — both must agree on the world-space mapping
const CLIP_SCENE_HALF = 15

export function AnnotationMarkers() {
  const annotations = useViewerStore((s) => s.annotations)
  const activeSceneId = useViewerStore((s) => s.activeSceneId)
  const selectedAnnotationId = useViewerStore((s) => s.selectedAnnotationId)
  const annotationsVisible = useViewerStore((s) => s.annotationsVisible)
  const clipPlane = useViewerStore((s) => s.clipPlane)
  const selectAnnotation = useViewerStore((s) => s.selectAnnotation)
  const { camera } = useThree()

  // Triggers a single re-render after the first useFrame populates LOD state,
  // so that close-LOD Html markers appear correctly after page refresh.
  const [lodReady, setLodReady] = useState(false)

  const sceneAnnotations = useMemo(
    () => annotations.filter((a) => a.sceneId === activeSceneId),
    [annotations, activeSceneId]
  )

  const visibleAnnotations = useMemo(() => {
    if (!clipPlane.enabled) return sceneAnnotations
    const worldPos = (clipPlane.position - 0.5) * 2 * CLIP_SCENE_HALF
    const axisIndex = clipPlane.axis === 'x' ? 0 : clipPlane.axis === 'y' ? 1 : 2
    return sceneAnnotations.filter((a) => {
      const axisValue = a.position[axisIndex]
      return clipPlane.flipped ? axisValue <= worldPos : axisValue >= worldPos
    })
  }, [sceneAnnotations, clipPlane])

  const instancedMeshRef = useRef<THREE.InstancedMesh>(null)
  const farGeometry = useMemo(() => new THREE.SphereGeometry(0.12, 8, 8), [])
  const farMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#3b82f6', transparent: true, opacity: 0.85 }),
    []
  )

  const lodStateRef = useRef<Map<string, 'far' | 'close'>>(new Map())
  // Maps instancedMesh instance index → annotation, kept in sync each frame.
  const farAnnotationsRef = useRef<Annotation[]>([])

  useFrame(({ clock }) => {
    if (!annotationsVisible) return

    const mesh = instancedMeshRef.current

    if (visibleAnnotations.length === 0) {
      if (mesh && mesh.count > 0) {
        mesh.count = 0
        mesh.instanceMatrix.needsUpdate = true
      }
      lodStateRef.current = new Map()
      farAnnotationsRef.current = []
      return
    }

    const withDist = visibleAnnotations.map((a: Annotation) => {
      const pos = new THREE.Vector3(...a.position)
      const dist = camera.position.distanceTo(pos)
      return { annotation: a, dist }
    })

    withDist.sort((a, b) => a.dist - b.dist)

    const newLod = new Map<string, 'far' | 'close'>()
    let htmlCount = 0
    for (const { annotation, dist } of withDist) {
      if (dist <= FAR_THRESHOLD && htmlCount < MAX_HTML_MARKERS) {
        newLod.set(annotation.id, 'close')
        htmlCount++
      } else {
        newLod.set(annotation.id, 'far')
      }
    }
    lodStateRef.current = newLod

    // One-shot: trigger re-render so React picks up LOD state for close markers.
    if (!lodReady) setLodReady(true)

    if (!mesh) return

    const farAnnotations = withDist.filter((d) => newLod.get(d.annotation.id) === 'far')
    farAnnotationsRef.current = farAnnotations.map((d) => d.annotation)
    mesh.count = farAnnotations.length

    const matrix = new THREE.Matrix4()
    const pulse = 1 + Math.sin(clock.elapsedTime * 2) * 0.15

    farAnnotations.forEach(({ annotation }, i) => {
      const pos = new THREE.Vector3(...annotation.position)
      matrix.makeScale(pulse, pulse, pulse)
      matrix.setPosition(pos)
      mesh.setMatrixAt(i, matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  })

  const handleInstanceClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation()
      const idx = e.instanceId
      if (idx !== undefined && farAnnotationsRef.current[idx]) {
        selectAnnotation(farAnnotationsRef.current[idx].id)
      }
    },
    [selectAnnotation]
  )

  if (!annotationsVisible) return null

  const closeAnnotations = visibleAnnotations.filter(
    (a) => lodStateRef.current.get(a.id) === 'close'
  )

  return (
    <>
      <instancedMesh
        ref={instancedMeshRef}
        args={[farGeometry, farMaterial, sceneAnnotations.length]}
        onClick={handleInstanceClick}
      />

      {closeAnnotations.slice(0, MAX_HTML_MARKERS).map((annotation) => (
        <AnnotationMarker
          key={annotation.id}
          annotation={annotation}
          isSelected={selectedAnnotationId === annotation.id}
          onSelect={() => selectAnnotation(annotation.id)}
        />
      ))}
    </>
  )
}
