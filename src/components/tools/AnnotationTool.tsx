import { useRef, useCallback, useEffect } from 'react'
import * as THREE from 'three'
import { useThree, useFrame } from '@react-three/fiber'
import { useViewerStore } from '@/store/viewerStore'
import { AnnotationLabel } from './AnnotationLabel'
import { updatePointsThreshold } from '@/utils/raycasting'

export function AnnotationTool() {
  const toolMode = useViewerStore((s) => s.toolMode)
  const activeSceneId = useViewerStore((s) => s.activeSceneId)
  const annotations = useViewerStore((s) => s.annotations)
  const setPendingAnnotationInput = useViewerStore((s) => s.setPendingAnnotationInput)
  const pendingAnnotationInput = useViewerStore((s) => s.pendingAnnotationInput)
  const { camera, scene, gl } = useThree()
  const raycasterRef = useRef(new THREE.Raycaster())
  const mouseRef = useRef(new THREE.Vector2())

  const isActive = toolMode === 'annotate'

  useFrame(() => updatePointsThreshold(raycasterRef.current, camera))

  const handleClick = useCallback((e: MouseEvent) => {
    if (!isActive || pendingAnnotationInput) return

    const rect = gl.domElement.getBoundingClientRect()
    mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

    raycasterRef.current.setFromCamera(mouseRef.current, camera)

    const targets: THREE.Object3D[] = []
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
        targets.push(obj)
      }
    })

    const intersects = raycasterRef.current.intersectObjects(targets, false)
    if (intersects.length === 0) return

    const hitPoint = intersects[0].point.clone()
    setPendingAnnotationInput({
      screenPos: { x: e.clientX, y: e.clientY },
      worldPos: [hitPoint.x, hitPoint.y, hitPoint.z],
    })
  }, [isActive, pendingAnnotationInput, camera, scene, gl, setPendingAnnotationInput])

  useEffect(() => {
    if (!isActive) {
      setPendingAnnotationInput(null)
      return
    }
    gl.domElement.addEventListener('click', handleClick)
    return () => gl.domElement.removeEventListener('click', handleClick)
  }, [isActive, handleClick, setPendingAnnotationInput, gl])

  const sceneAnnotations = annotations.filter(
    (a) => a.sceneId === activeSceneId
  )

  return (
    <>
      {sceneAnnotations.map((annotation) => (
        <AnnotationLabel key={annotation.id} annotation={annotation} />
      ))}
    </>
  )
}
