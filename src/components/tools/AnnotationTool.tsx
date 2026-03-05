import { useRef, useState, useCallback, useEffect } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { useViewerStore } from '@/store/viewerStore'
import { AnnotationLabel } from './AnnotationLabel'

interface PendingAnnotation {
  position: THREE.Vector3
}

export function AnnotationTool() {
  const toolMode = useViewerStore((s) => s.toolMode)
  const activeSceneId = useViewerStore((s) => s.activeSceneId)
  const annotations = useViewerStore((s) => s.annotations)
  const addAnnotation = useViewerStore((s) => s.addAnnotation)
  const { camera, scene, gl } = useThree()
  const raycasterRef = useRef(new THREE.Raycaster())
  const mouseRef = useRef(new THREE.Vector2())

  const [pending, setPending] = useState<PendingAnnotation | null>(null)
  const [inputText, setInputText] = useState('')
  const [inputPos, setInputPos] = useState<{ x: number; y: number } | null>(null)

  const isActive = toolMode === 'annotate'

  const handleClick = useCallback((e: MouseEvent) => {
    if (!isActive || pending) return

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
    setPending({ position: hitPoint })
    setInputText('')
    setInputPos({ x: e.clientX, y: e.clientY })
  }, [isActive, pending, camera, scene, gl])

  const handleConfirm = useCallback(() => {
    if (!pending || !inputText.trim() || !activeSceneId) return

    addAnnotation({
      id: `ann-${Date.now()}`,
      position: [pending.position.x, pending.position.y, pending.position.z],
      text: inputText.trim(),
      sceneId: activeSceneId,
    })
    setPending(null)
    setInputPos(null)
    setInputText('')
  }, [pending, inputText, activeSceneId, addAnnotation])

  const handleCancel = useCallback(() => {
    setPending(null)
    setInputPos(null)
    setInputText('')
  }, [])

  useEffect(() => {
    if (!isActive) {
      handleCancel()
      return
    }
    gl.domElement.addEventListener('click', handleClick)
    return () => gl.domElement.removeEventListener('click', handleClick)
  }, [isActive, handleClick, handleCancel, gl])

  const sceneAnnotations = annotations.filter(
    (a) => a.sceneId === activeSceneId
  )

  return (
    <>
      {sceneAnnotations.map((annotation) => (
        <AnnotationLabel key={annotation.id} annotation={annotation} />
      ))}

      {inputPos && (
        <div
          data-testid="annotation-input-dialog"
          className="fixed z-50 bg-zinc-900 border border-zinc-600 rounded-lg shadow-xl p-3 w-56"
          style={{ left: inputPos.x + 10, top: inputPos.y - 20 }}
        >
          <p className="text-zinc-400 text-xs mb-2">Add annotation</p>
          <input
            autoFocus
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirm()
              if (e.key === 'Escape') handleCancel()
            }}
            placeholder="Enter label text..."
            className="w-full bg-zinc-800 text-white text-sm px-2 py-1.5 rounded border border-zinc-600 outline-none focus:border-blue-500 mb-2"
            data-testid="annotation-text-input"
          />
          <div className="flex gap-2">
            <button
              onClick={handleConfirm}
              disabled={!inputText.trim()}
              className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs py-1.5 rounded transition-colors"
              data-testid="annotation-confirm-btn"
            >
              Add
            </button>
            <button
              onClick={handleCancel}
              className="flex-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs py-1.5 rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  )
}
