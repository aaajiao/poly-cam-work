import { Suspense, useEffect, useRef } from 'react'
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

export function SceneCanvas() {
  const activeScene = useActiveScene()
  const viewMode = useViewerStore((s) => s.viewMode)
  const isLoading = useViewerStore((s) => s.isLoading)
  const loadingProgress = useViewerStore((s) => s.loadingProgress)
  const loadingMessage = useViewerStore((s) => s.loadingMessage)

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
          enableDamping
          dampingFactor={0.05}
          minDistance={0.5}
          maxDistance={200}
        />

        <CameraController />

        <MeasurementTool />
        <ClippingPlaneController />
        <AnnotationTool />

        <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
          <GizmoViewport
            axisColors={['#ef4444', '#22c55e', '#3b82f6']}
            labelColor="white"
          />
        </GizmoHelper>

        {import.meta.env.DEV && <Stats />}

        <ScreenshotCapture />
      </Canvas>

      <LoadingOverlay
        visible={isLoading}
        progress={loadingProgress}
        message={loadingMessage}
      />
    </div>
  )
}
