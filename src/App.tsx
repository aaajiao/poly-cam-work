import './index.css'
import { useEffect, useRef, useState } from 'react'
import { Layout } from '@/components/Layout'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { Toolbar } from '@/components/toolbar/Toolbar'
import { SceneCanvas } from '@/components/viewer/SceneCanvas'
import { DropZone } from '@/components/upload/DropZone'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { StatusBar } from '@/components/ui/StatusBar'
import { useViewerStore } from '@/store/viewerStore'

export default function App() {
  const [uploadErrors, setUploadErrors] = useState<string[]>([])
  const activeSceneId = useViewerStore((state) => state.activeSceneId)
  const annotations = useViewerStore((state) => state.annotations)
  const draftDirtyByScene = useViewerStore((state) => state.draftDirtyByScene)
  const loadDraft = useViewerStore((state) => state.loadDraft)
  const refreshAuthSession = useViewerStore((state) => state.refreshAuthSession)
  const attemptedSceneLoadsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    void refreshAuthSession()
  }, [refreshAuthSession])

  useEffect(() => {
    if (!activeSceneId) return

    const isSceneDirty = draftDirtyByScene[activeSceneId] ?? false
    if (isSceneDirty) return

    const hasLocalSceneAnnotations = annotations.some((annotation) => annotation.sceneId === activeSceneId)
    if (hasLocalSceneAnnotations) return

    if (attemptedSceneLoadsRef.current.has(activeSceneId)) return
    attemptedSceneLoadsRef.current.add(activeSceneId)

    void loadDraft(activeSceneId)
  }, [activeSceneId, annotations, draftDirtyByScene, loadDraft])

  return (
    <>
      <Layout
        sidebar={<Sidebar />}
        toolbar={<Toolbar />}
        statusBar={<StatusBar />}
      >
        <ErrorBoundary>
          <SceneCanvas />
        </ErrorBoundary>
      </Layout>
      <DropZone onError={setUploadErrors} />
      {uploadErrors.length > 0 && (
        <div
          data-testid="upload-error"
          className="fixed bottom-4 right-4 z-50 bg-red-900/90 text-red-200 text-sm p-3 rounded-lg max-w-sm cursor-pointer"
          onClick={() => setUploadErrors([])}
        >
          {uploadErrors.map((e, i) => <div key={i}>{e}</div>)}
          <div className="text-red-400 text-xs mt-1">Click to dismiss</div>
        </div>
      )}
    </>
  )
}
