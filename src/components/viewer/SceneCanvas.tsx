import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, GizmoHelper, GizmoViewport, Environment, Stats } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { GLBViewer } from './GLBViewer'
import { PointCloudViewer } from './PointCloudViewer'
import { ScreenshotCapture } from './ScreenshotButton'
import { LoadingOverlay } from '@/components/ui/LoadingOverlay'
import { useActiveScene, useViewerStore } from '@/store/viewerStore'
import { MeasurementTool } from '@/components/tools/MeasurementTool'
import { ClippingPlaneController } from '@/components/tools/ClippingPlane'
import { AnnotationTool } from '@/components/tools/AnnotationTool'
import { AnnotationMarkers } from '@/components/tools/AnnotationMarkers'
import { AnnotationPanel } from '@/components/tools/AnnotationPanel'

function LoadingFallback() {
  return (
    <mesh>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color="#27272a" wireframe />
    </mesh>
  )
}

function CameraController() {
  const { camera, controls } = useThree()
  const activeScene = useActiveScene()
  const prevSceneId = useRef<string | null>(null)

  useEffect(() => {
    if (!activeScene || activeScene.id === prevSceneId.current) return
    prevSceneId.current = activeScene.id

    camera.position.set(0, 5, 15)
    camera.lookAt(0, 0, 0)

    if (controls && 'target' in controls) {
      (controls as { target: THREE.Vector3 }).target.set(0, 0, 0)
    }
  }, [activeScene, camera, controls])

  return null
}

const DIALOG_WIDTH = 224   // w-56 = 14rem = 224px
const DIALOG_HEIGHT = 120  // approximate height

function AnnotationInputDialog() {
   const pendingAnnotationInput = useViewerStore((s) => s.pendingAnnotationInput)
   const setPendingAnnotationInput = useViewerStore((s) => s.setPendingAnnotationInput)
   const addAnnotation = useViewerStore((s) => s.addAnnotation)
   const openAnnotationPanel = useViewerStore((s) => s.openAnnotationPanel)
   const selectAnnotation = useViewerStore((s) => s.selectAnnotation)
   const activeSceneId = useViewerStore((s) => s.activeSceneId)
   const [inputText, setInputText] = useState('')

  const handleConfirm = useCallback(() => {
    if (!pendingAnnotationInput || !inputText.trim() || !activeSceneId) return
    const newId = `ann-${Date.now()}`
    addAnnotation({
      id: newId,
      position: pendingAnnotationInput.worldPos,
      normal: pendingAnnotationInput.normal,
      title: inputText.trim(),
      description: '',
      images: [],
      videoUrl: null,
      links: [],
      sceneId: activeSceneId,
      createdAt: Date.now(),
    })
    openAnnotationPanel(newId)
    selectAnnotation(newId)
    setPendingAnnotationInput(null)
    setInputText('')
  }, [pendingAnnotationInput, inputText, activeSceneId, addAnnotation, openAnnotationPanel, selectAnnotation, setPendingAnnotationInput])

  const handleCancel = useCallback(() => {
    setPendingAnnotationInput(null)
    setInputText('')
  }, [setPendingAnnotationInput])

  if (!pendingAnnotationInput) return null

  const clampedLeft = Math.min(
    Math.max(pendingAnnotationInput.screenPos.x + 10, 8),
    window.innerWidth - DIALOG_WIDTH - 8
  )
  const clampedTop = Math.min(
    Math.max(pendingAnnotationInput.screenPos.y - 20, 8),
    window.innerHeight - DIALOG_HEIGHT - 8
  )

  return (
    <div
      data-testid="annotation-input-dialog"
      className="fixed z-50 bg-zinc-900 border border-zinc-600 rounded-lg shadow-xl p-3 w-56"
      style={{ left: clampedLeft, top: clampedTop }}
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
  )
}

export function SceneCanvas() {
  const activeScene = useActiveScene()
  const viewMode = useViewerStore((s) => s.viewMode)
  const isLoading = useViewerStore((s) => s.isLoading)
  const loadingProgress = useViewerStore((s) => s.loadingProgress)
  const loadingMessage = useViewerStore((s) => s.loadingMessage)
  const toolMode = useViewerStore((s) => s.toolMode)
  const cameraControlsEnabled = useViewerStore((s) => s.cameraControlsEnabled)
  const selectedAnnotationId = useViewerStore((s) => s.selectedAnnotationId)
  const selectAnnotation = useViewerStore((s) => s.selectAnnotation)

  const handlePointerMissed = useCallback(() => {
    if (toolMode !== 'annotate' && selectedAnnotationId) {
      selectAnnotation(null)
    }
  }, [toolMode, selectedAnnotationId, selectAnnotation])

  return (
    <div className="w-full h-full relative" data-testid="scene-canvas">
      <Canvas
        camera={{ position: [0, 5, 15], fov: 50, near: 0.01, far: 1000 }}
        gl={{
          antialias: true,
          preserveDrawingBuffer: true,
          toneMapping: 3,
          toneMappingExposure: 1,
        }}
        shadows
        onPointerMissed={handlePointerMissed}
      >
        <ambientLight intensity={0.6} />
        <directionalLight
          position={[10, 20, 10]}
          intensity={1.2}
          castShadow
          shadow-mapSize={[2048, 2048]}
        />
        <directionalLight position={[-10, 10, -10]} intensity={0.4} />

        <Environment preset="city" />

        <Suspense fallback={<LoadingFallback />}>
          {activeScene && (viewMode === 'mesh' || viewMode === 'both') && (
            <GLBViewer url={activeScene.glbUrl} />
          )}
          {activeScene && (viewMode === 'pointcloud' || viewMode === 'both') && (
            <PointCloudViewer url={activeScene.plyUrl} />
          )}
        </Suspense>

        <OrbitControls
          makeDefault
          enabled={cameraControlsEnabled}
          enableDamping
          dampingFactor={0.05}
          minDistance={0.5}
          maxDistance={200}
        />

        <CameraController />

        <MeasurementTool />
        <ClippingPlaneController />
        <AnnotationTool />
        <AnnotationMarkers />
        <AnnotationPanel />

        <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
          <GizmoViewport
            axisColors={['#ef4444', '#22c55e', '#3b82f6']}
            labelColor="white"
          />
        </GizmoHelper>

        {import.meta.env.DEV && <Stats className="stats-panel" />}

        <ScreenshotCapture />
      </Canvas>

      <LoadingOverlay
        visible={isLoading}
        progress={loadingProgress}
        message={loadingMessage}
      />

      <AnnotationInputDialog />
    </div>
  )
}
