import { beforeEach, describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { ViewModeToggle } from '@/components/toolbar/ViewModeToggle'
import { FileManager } from '@/components/sidebar/FileManager'
import { PropertyPanel } from '@/components/sidebar/PropertyPanel'
import { useViewerStore } from '@/store/viewerStore'
import * as modelApi from '@/lib/modelApi'
import { vercelBlobModelStorage } from '@/storage/vercelBlobModelStorage'
import * as publishApi from '@/lib/publishApi'

vi.mock('@/lib/publishApi', () => ({
  getSession: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  getDraft: vi.fn(),
  saveDraft: vi.fn(),
  publishDraft: vi.fn(),
  getPublishedVersions: vi.fn(),
  deletePublishedVersion: vi.fn(),
  getRelease: vi.fn(),
  rollbackRelease: vi.fn(),
}))

vi.mock('@/lib/modelApi', () => ({
  SceneConflictError: class SceneConflictError extends Error {
    constructor(sceneId: string) { super(`Scene ${sceneId} already exists`) }
  },
  getModels: vi.fn(),
  createModel: vi.fn(),
  syncModels: vi.fn(),
  registerOfficialScene: vi.fn(),
  discoverLocalScenes: vi.fn(),
}))

vi.mock('@/storage/vercelBlobModelStorage', () => ({
  vercelBlobModelStorage: {
    upload: vi.fn(),
    uploadFromUrl: vi.fn(),
  },
}))

function resetStore() {
  localStorage.removeItem('polycam-viewer-state')
  useViewerStore.setState({
    activeSceneId: 'scan-a',
    publishedScenes: [],
    discoveredScenes: [],
    isAuthenticated: false,
    viewMode: 'mesh',
    toolMode: 'orbit',
    uploadedScenes: [],
    officialSceneSyncOverridesByScene: {},
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

    await expect.element(screen.getByTestId('view-mode-mesh')).toHaveClass('bg-primary')

    await screen.getByTestId('view-mode-pointcloud').click()
    await expect.element(screen.getByTestId('view-mode-pointcloud')).toHaveClass('bg-primary')
    expect(useViewerStore.getState().viewMode).toBe('pointcloud')

    await screen.getByTestId('view-mode-both').click()
    await expect.element(screen.getByTestId('view-mode-both')).toHaveClass('bg-primary')
    expect(useViewerStore.getState().viewMode).toBe('both')
  })

  test('file manager lists preset scans and scene switching updates active scene', async () => {
    const screen = await render(<FileManager />)

    await expect.element(screen.getByTestId('scan-list')).toBeVisible()
    await expect.element(screen.getByTestId('scene-item-scan-a')).toBeVisible()
    await expect.element(screen.getByTestId('scene-item-scan-b')).toBeVisible()
    await expect.element(screen.getByTestId('scene-item-scan-c')).toBeVisible()

    await screen.getByTestId('scene-item-scan-b').click()
    await expect.element(screen.getByTestId('scene-item-scan-b')).toHaveClass('bg-accent-soft')
    expect(useViewerStore.getState().activeSceneId).toBe('scan-b')
  })

  test('file manager shows synced state when all presets already cloud-backed', async () => {
    useViewerStore.setState({
      isAuthenticated: true,
      publishedScenes: [
        {
          id: 'scan-a',
          name: 'Scan A (Corridor)',
          glbUrl: 'https://assets.poly.cam/scenes/scan-a/models/glb.glb',
          plyUrl: 'https://assets.poly.cam/scenes/scan-a/models/ply.ply',
        },
        {
          id: 'scan-b',
          name: 'Scan B (Large Room)',
          glbUrl: 'https://assets.poly.cam/scenes/scan-b/models/glb.glb',
          plyUrl: 'https://assets.poly.cam/scenes/scan-b/models/ply.ply',
        },
        {
          id: 'scan-c',
          name: 'Scan C (Multi-Room)',
          glbUrl: 'https://assets.poly.cam/scenes/scan-c/models/glb.glb',
          plyUrl: 'https://assets.poly.cam/scenes/scan-c/models/ply.ply',
        },
      ],
    })

    const screen = await render(<FileManager />)
    await expect.element(screen.getByTestId('sync-preset-models-button')).toHaveTextContent('Synced')
    await expect.element(screen.getByTestId('sync-preset-models-button')).toBeDisabled()
    await expect.element(screen.getByTestId('scene-sync-state-scan-a')).toBeVisible()
    await expect.element(screen.getByTestId('scene-sync-state-scan-a')).toHaveTextContent('Cloud')
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

describe('official scene maintainer workflow', () => {
  const mockDiscover = vi.mocked(modelApi.discoverLocalScenes)
  const mockUpload = vi.mocked(vercelBlobModelStorage.uploadFromUrl)
  const mockRegister = vi.mocked(modelApi.registerOfficialScene)
  const mockGetSession = vi.mocked(publishApi.getSession)

  beforeEach(() => {
    resetStore()
    mockDiscover.mockReset()
    mockUpload.mockReset()
    mockRegister.mockReset()
    mockGetSession.mockReset()
    mockGetSession.mockResolvedValue({ authenticated: true })
  })

  test('refresh surfaces a discovered scene row with Discovered badge and sync button', async () => {
    useViewerStore.setState({ isAuthenticated: true })
    mockDiscover.mockResolvedValue({
      scenes: [
        { id: 'scan-d', name: 'Scan D', glbUrl: '/models/scan-d.glb', plyUrl: '/models/scan-d.ply' },
      ],
      errors: [],
    })

    const screen = await render(<FileManager />)

    await screen.getByTestId('refresh-scenes-button').click()

    await expect.element(screen.getByTestId('scene-item-scan-d')).toBeVisible()
    await expect.element(screen.getByTestId('scene-sync-state-scan-d')).toHaveTextContent('Discovered')
    await expect.element(screen.getByTestId('sync-scene-button-scan-d')).toBeVisible()
  })

  test('successful sync transitions discovered scene to Cloud and removes sync button', async () => {
    useViewerStore.setState({
      isAuthenticated: true,
      discoveredScenes: [
        {
          id: 'scan-d',
          name: 'Scan D',
          glbUrl: '/models/scan-d.glb',
          plyUrl: '/models/scan-d.ply',
          officialStatus: {
            sceneId: 'scan-d',
            catalogSource: 'discovered',
            pairCompleteness: 'complete',
            syncStatus: 'unsynced',
          },
        },
      ],
    })
    mockUpload.mockResolvedValue('https://blob.example.com/models/scan-d.glb')
    mockRegister.mockResolvedValue({
      id: 'scan-d',
      name: 'Scan D',
      glbUrl: 'https://blob.example.com/models/scan-d.glb',
      plyUrl: 'https://blob.example.com/models/scan-d.ply',
    })

    const screen = await render(<FileManager />)

    await expect.element(screen.getByTestId('scene-sync-state-scan-d')).toHaveTextContent('Discovered')
    await expect.element(screen.getByTestId('sync-scene-button-scan-d')).toBeVisible()

    await screen.getByTestId('sync-scene-button-scan-d').click()

    await expect.element(screen.getByTestId('scene-sync-state-scan-d')).toHaveTextContent('Cloud')
    await expect.element(screen.getByTestId('sync-scene-button-scan-d')).not.toBeInTheDocument()
  })

  test('failed sync shows Sync Error with retry, and retry succeeds to Cloud', async () => {
    useViewerStore.setState({
      isAuthenticated: true,
      discoveredScenes: [
        {
          id: 'scan-d',
          name: 'Scan D',
          glbUrl: '/models/scan-d.glb',
          plyUrl: '/models/scan-d.ply',
          officialStatus: {
            sceneId: 'scan-d',
            catalogSource: 'discovered',
            pairCompleteness: 'complete',
            syncStatus: 'unsynced',
          },
        },
      ],
    })

    // First attempt: both uploads fail
    mockUpload
      .mockRejectedValueOnce(new Error('upload failed'))
      .mockRejectedValueOnce(new Error('upload failed'))

    const screen = await render(<FileManager />)

    await expect.element(screen.getByTestId('scene-sync-state-scan-d')).toHaveTextContent('Discovered')
    await screen.getByTestId('sync-scene-button-scan-d').click()

    await expect.element(screen.getByTestId('scene-sync-state-scan-d')).toHaveTextContent('Sync Error')
    await expect.element(screen.getByTestId('sync-scene-button-scan-d')).toBeVisible()

    // Retry: uploads succeed
    mockUpload.mockResolvedValueOnce('https://blob.example.com/models/scan-d.glb')
    mockUpload.mockResolvedValueOnce('https://blob.example.com/models/scan-d.ply')
    mockRegister.mockResolvedValueOnce({
      id: 'scan-d',
      name: 'Scan D',
      glbUrl: 'https://blob.example.com/models/scan-d.glb',
      plyUrl: 'https://blob.example.com/models/scan-d.ply',
    })

    await screen.getByTestId('sync-scene-button-scan-d').click()

    await expect.element(screen.getByTestId('scene-sync-state-scan-d')).toHaveTextContent('Cloud')
    await expect.element(screen.getByTestId('sync-scene-button-scan-d')).not.toBeInTheDocument()
  })

  test('refresh preserves already-published Cloud rows alongside newly discovered rows', async () => {
    useViewerStore.setState({
      isAuthenticated: true,
      publishedScenes: [
        {
          id: 'scan-x',
          name: 'Scan X',
          glbUrl: 'https://assets.poly.cam/scenes/scan-x/models/glb.glb',
          plyUrl: 'https://assets.poly.cam/scenes/scan-x/models/ply.ply',
          officialStatus: {
            sceneId: 'scan-x',
            catalogSource: 'published',
            pairCompleteness: 'complete',
            syncStatus: 'synced',
          },
        },
      ],
    })
    mockDiscover.mockResolvedValue({
      scenes: [
        { id: 'scan-d', name: 'Scan D', glbUrl: '/models/scan-d.glb', plyUrl: '/models/scan-d.ply' },
      ],
      errors: [],
    })

    const screen = await render(<FileManager />)

    await expect.element(screen.getByTestId('scene-sync-state-scan-x')).toHaveTextContent('Cloud')

    await screen.getByTestId('refresh-scenes-button').click()

    await expect.element(screen.getByTestId('scene-item-scan-d')).toBeVisible()
    await expect.element(screen.getByTestId('scene-sync-state-scan-d')).toHaveTextContent('Discovered')
    await expect.element(screen.getByTestId('scene-sync-state-scan-x')).toHaveTextContent('Cloud')
  })

  test('re-discovered scene already in publishedScenes stays Cloud after refresh', async () => {
    useViewerStore.setState({
      isAuthenticated: true,
      publishedScenes: [
        {
          id: 'scan-d',
          name: 'Scan D',
          glbUrl: 'https://assets.poly.cam/scenes/scan-d/models/glb.glb',
          plyUrl: 'https://assets.poly.cam/scenes/scan-d/models/ply.ply',
          officialStatus: {
            sceneId: 'scan-d',
            catalogSource: 'published',
            pairCompleteness: 'complete',
            syncStatus: 'synced',
          },
        },
      ],
    })
    // Discovery returns scan-d again, but it's already published
    mockDiscover.mockResolvedValue({
      scenes: [
        { id: 'scan-d', name: 'Scan D', glbUrl: '/models/scan-d.glb', plyUrl: '/models/scan-d.ply' },
      ],
      errors: [],
    })

    const screen = await render(<FileManager />)

    await expect.element(screen.getByTestId('scene-sync-state-scan-d')).toHaveTextContent('Cloud')

    await screen.getByTestId('refresh-scenes-button').click()

    // scan-d must stay Cloud since publishedScenes takes precedence
    await expect.element(screen.getByTestId('scene-sync-state-scan-d')).toHaveTextContent('Cloud')
    await expect.element(screen.getByTestId('sync-scene-button-scan-d')).not.toBeInTheDocument()
  })
})
