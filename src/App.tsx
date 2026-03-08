import './index.css'
import { useEffect, useRef } from 'react'
import { Layout } from '@/components/Layout'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { Toolbar } from '@/components/toolbar/Toolbar'
import { SceneCanvas } from '@/components/viewer/SceneCanvas'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { StatusBar } from '@/components/ui/StatusBar'
import { useViewerStore } from '@/store/viewerStore'

export default function App() {
  const activeSceneId = useViewerStore((state) => state.activeSceneId)
  const annotations = useViewerStore((state) => state.annotations)
  const draftDirtyByScene = useViewerStore((state) => state.draftDirtyByScene)
  const sceneMutationVersion = useViewerStore((state) => state.sceneMutationVersion)
  const loadDraft = useViewerStore((state) => state.loadDraft)
  const loadCloudScenes = useViewerStore((state) => state.loadCloudScenes)
  const loadDiscoveredScenes = useViewerStore((state) => state.loadDiscoveredScenes)
  const refreshAuthSession = useViewerStore((state) => state.refreshAuthSession)
  const isAuthenticated = useViewerStore((state) => state.isAuthenticated)
  const attemptedSceneLoadsRef = useRef<Set<string>>(new Set())
  const activeSceneMutationVersion = activeSceneId
    ? (sceneMutationVersion[activeSceneId] ?? 0)
    : 0

  useEffect(() => {
    void refreshAuthSession()
  }, [refreshAuthSession])

  useEffect(() => {
    void loadCloudScenes()
  }, [loadCloudScenes])

  useEffect(() => {
    void loadDiscoveredScenes()
  }, [loadDiscoveredScenes])

  useEffect(() => {
    if (!activeSceneId) return

    const isSceneDirty = draftDirtyByScene[activeSceneId] ?? false
    if (isSceneDirty) return

    const hasLocalSceneAnnotations = annotations.some((annotation) => annotation.sceneId === activeSceneId)
    if (hasLocalSceneAnnotations) return

    const authMode = isAuthenticated ? 'auth' : 'anon'
    const loadKey = `${activeSceneId}:${authMode}:${activeSceneMutationVersion}`
    if (attemptedSceneLoadsRef.current.has(loadKey)) return
    attemptedSceneLoadsRef.current.add(loadKey)

    void loadDraft(activeSceneId)
  }, [activeSceneId, activeSceneMutationVersion, annotations, draftDirtyByScene, isAuthenticated, loadDraft])

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
    </>
  )
}
