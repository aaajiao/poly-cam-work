import { beforeEach, describe, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { ViewModeToggle } from '@/components/toolbar/ViewModeToggle'
import { FileManager } from '@/components/sidebar/FileManager'
import { PropertyPanel } from '@/components/sidebar/PropertyPanel'
import { useViewerStore } from '@/store/viewerStore'

function resetStore() {
  localStorage.removeItem('polycam-viewer-state')
  useViewerStore.setState({
    activeSceneId: 'scan-a',
    cloudScenes: [],
    isAuthenticated: false,
    viewMode: 'mesh',
    toolMode: 'orbit',
    uploadedScenes: [],
    clipPlane: { enabled: false, axis: 'y', position: 0.5, flipped: false },
    annotations: [],
    measurements: [],
    selectedAnnotationId: null,
    openAnnotationPanelIds: [],
    annotationsPanelOpen: false,
    sidebarOpen: false,
    cameraControlsEnabled: true,
  })
}

describe('browser viewer sidebar controls', () => {
  beforeEach(() => {
    resetStore()
  })

  test('view mode toggle switches mesh, point cloud, and both', async () => {
    const screen = await render(<ViewModeToggle />)

    await expect.element(screen.getByTestId('view-mode-mesh')).toHaveClass('bg-blue-600')

    await screen.getByTestId('view-mode-pointcloud').click()
    await expect.element(screen.getByTestId('view-mode-pointcloud')).toHaveClass('bg-blue-600')
    expect(useViewerStore.getState().viewMode).toBe('pointcloud')

    await screen.getByTestId('view-mode-both').click()
    await expect.element(screen.getByTestId('view-mode-both')).toHaveClass('bg-blue-600')
    expect(useViewerStore.getState().viewMode).toBe('both')
  })

  test('file manager lists preset scans and scene switching updates active scene', async () => {
    const screen = await render(<FileManager />)

    await expect.element(screen.getByTestId('scan-list')).toBeVisible()
    await expect.element(screen.getByTestId('scene-item-scan-a')).toBeVisible()
    await expect.element(screen.getByTestId('scene-item-scan-b')).toBeVisible()
    await expect.element(screen.getByTestId('scene-item-scan-c')).toBeVisible()

    await screen.getByTestId('scene-item-scan-b').click()
    await expect.element(screen.getByTestId('scene-item-scan-b')).toHaveClass('bg-blue-600/20')
    expect(useViewerStore.getState().activeSceneId).toBe('scan-b')
  })

  test('file manager shows synced state when all presets already cloud-backed', async () => {
    useViewerStore.setState({
      isAuthenticated: true,
      cloudScenes: [
        {
          id: 'scan-a',
          name: 'Scan A (Corridor)',
          glbUrl: 'https://assets.poly.cam/scenes/scan-a/models/glb.glb',
          plyUrl: 'https://assets.poly.cam/scenes/scan-a/models/ply.ply',
          source: 'cloud',
        },
        {
          id: 'scan-b',
          name: 'Scan B (Large Room)',
          glbUrl: 'https://assets.poly.cam/scenes/scan-b/models/glb.glb',
          plyUrl: 'https://assets.poly.cam/scenes/scan-b/models/ply.ply',
          source: 'cloud',
        },
        {
          id: 'scan-c',
          name: 'Scan C (Multi-Room)',
          glbUrl: 'https://assets.poly.cam/scenes/scan-c/models/glb.glb',
          plyUrl: 'https://assets.poly.cam/scenes/scan-c/models/ply.ply',
          source: 'cloud',
        },
      ],
    })

    const screen = await render(<FileManager />)
    await expect.element(screen.getByTestId('sync-preset-models-button')).toHaveTextContent('Synced')
    await expect.element(screen.getByTestId('sync-preset-models-button')).toBeDisabled()
    await expect.element(screen.getByTestId('scene-sync-state-scan-a')).toBeVisible()
    await expect.element(screen.getByTestId('scene-sync-state-scan-a')).not.toHaveTextContent('Cloud')
  })

  test('property panel reflects active scene and selected view mode', async () => {
    const screen = await render(
      <>
        <ViewModeToggle />
        <PropertyPanel />
      </>
    )

    await expect.element(screen.getByText('Scan A (Corridor)')).toBeVisible()
    await expect.element(screen.getByText('Mesh view')).toBeVisible()

    await screen.getByTestId('view-mode-pointcloud').click()
    await expect.element(screen.getByText('Point cloud view')).toBeVisible()
  })
})
