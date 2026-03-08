import { beforeEach, describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { Toolbar } from '@/components/toolbar/Toolbar'
import { useViewerStore } from '@/store/viewerStore'
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

function resetStore() {
  localStorage.removeItem('polycam-viewer-state')
  useViewerStore.setState({
    activeSceneId: 'scan-a',
    isAuthenticated: false,
    draftStatus: 'idle',
    draftError: null,
    draftDirtyByScene: {},
    publishedVersionByScene: {},
    publishedVersionsByScene: {},
    toolMode: 'orbit',
    viewMode: 'mesh',
    clipPlane: { enabled: false, axis: 'y', position: 0.5, flipped: false },
  })
}

describe('browser lazy-loaded toolbar UI', () => {
  const mockGetPublishedVersions = vi.mocked(publishApi.getPublishedVersions)

  beforeEach(() => {
    vi.restoreAllMocks()
    resetStore()
    mockGetPublishedVersions.mockResolvedValue({ versions: [], liveVersion: null })
  })

  test('unauthenticated toolbar resolves LoginDialog and keeps publish controls hidden', async () => {
    const screen = await render(<Toolbar />)

    await expect.element(screen.getByTestId('login-button')).toBeVisible()
    expect(document.querySelector('[data-testid="publish-button"]')).toBeNull()
  })

  test('authenticated toolbar resolves PublishButton and still loads published versions', async () => {
    useViewerStore.setState({
      isAuthenticated: true,
      publishedVersionsByScene: { 'scan-a': [2, 1] },
      publishedVersionByScene: { 'scan-a': 2 },
    })
    mockGetPublishedVersions.mockResolvedValue({ versions: [2, 1], liveVersion: 2 })

    const screen = await render(<Toolbar />)

    await expect.element(screen.getByTestId('publish-button')).toBeVisible()
    expect(mockGetPublishedVersions).toHaveBeenCalledWith('scan-a')
  })
})
