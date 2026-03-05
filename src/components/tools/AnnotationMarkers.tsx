import { useRef, useMemo } from 'react'
import * as THREE from 'three'
import { useThree, useFrame } from '@react-three/fiber'
import { useViewerStore } from '@/store/viewerStore'
import type { Annotation } from '@/types'
import { AnnotationMarker } from './AnnotationMarker'

const FAR_THRESHOLD = 10
const MAX_HTML_MARKERS = 15

export function AnnotationMarkers() {
  const annotations = useViewerStore((s) => s.annotations)
  const activeSceneId = useViewerStore((s) => s.activeSceneId)
  const selectedAnnotationId = useViewerStore((s) => s.selectedAnnotationId)
  const annotationsVisible = useViewerStore((s) => s.annotationsVisible)
  const selectAnnotation = useViewerStore((s) => s.selectAnnotation)
  const { camera } = useThree()

  const sceneAnnotations = useMemo(
    () => annotations.filter((a) => a.sceneId === activeSceneId),
    [annotations, activeSceneId]
  )

  const instancedMeshRef = useRef<THREE.InstancedMesh>(null)
  const farGeometry = useMemo(() => new THREE.SphereGeometry(0.12, 8, 8), [])
  const farMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#3b82f6', transparent: true, opacity: 0.85 }),
    []
  )

  const lodStateRef = useRef<Map<string, 'far' | 'close'>>(new Map())

  useFrame(({ clock }) => {
    if (!annotationsVisible || sceneAnnotations.length === 0) return

    const withDist = sceneAnnotations.map((a: Annotation) => {
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

    const mesh = instancedMeshRef.current
    if (!mesh) return

    const farAnnotations = withDist.filter((d) => newLod.get(d.annotation.id) === 'far')
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

  if (!annotationsVisible) return null

  const closeAnnotations = sceneAnnotations.filter(
    (a) => lodStateRef.current.get(a.id) === 'close'
  )

  return (
    <>
      <instancedMesh
        ref={instancedMeshRef}
        args={[farGeometry, farMaterial, sceneAnnotations.length]}
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
