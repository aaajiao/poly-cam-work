import { beforeEach, describe, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { useViewerStore } from '@/store/viewerStore'

function resetStore() {
  localStorage.removeItem('polycam-viewer-state')
  useViewerStore.setState({
    activeSceneId: 'scan-a',
    isAuthenticated: false,
    toolMode: 'orbit',
    viewMode: 'mesh',
    clipPlane: { enabled: false, axis: 'y', position: 0.5, flipped: false },
    publishedScenes: [],
    discoveredScenes: [],
    uploadedScenes: [],
    annotations: [],
    openAnnotationPanelIds: [],
    annotationsVisible: true,
    annotationsPanelOpen: true,
    sidebarOpen: true,
    measurements: [],
    selectedAnnotationId: null,
  })
}

describe('browser lazy-loaded sidebar UI', () => {
  beforeEach(() => {
    resetStore()
  })

  test('sidebar resolves FileManager and AnnotationManager after lazy loading', async () => {
    const screen = await render(<Sidebar />)

    await expect.element(screen.getByTestId('scan-list')).toBeVisible()
    await expect.element(screen.getByTestId('annotation-manager')).toBeVisible()
    await expect.element(screen.getByTestId('scene-item-scan-a')).toBeVisible()
  })
})
