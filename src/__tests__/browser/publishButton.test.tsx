import { beforeEach, describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { PublishButton } from '@/components/sidebar/PublishButton'
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
    annotations: [],
    sceneMutationVersion: {},
    draftRevisionByScene: {},
    draftRevisionSourceByScene: {},
    loadRequestVersionByScene: {},
  })
}

describe('browser publish button', () => {
  const mockGetPublishedVersions = vi.mocked(publishApi.getPublishedVersions)
  const mockRollbackRelease = vi.mocked(publishApi.rollbackRelease)
  const mockDeletePublishedVersion = vi.mocked(publishApi.deletePublishedVersion)
  const mockGetDraft = vi.mocked(publishApi.getDraft)

  beforeEach(() => {
    vi.restoreAllMocks()
    resetStore()
    mockGetPublishedVersions.mockResolvedValue({ versions: [], liveVersion: null })
    mockGetDraft.mockResolvedValue({ sceneId: 'scan-a', revision: 0, annotations: [], updatedAt: Date.now() })
  })

  test('hides publish controls when unauthenticated', async () => {
    await render(<PublishButton />)

    expect(document.querySelector('[data-testid="publish-button"]')).toBeNull()
    expect(document.querySelector('[data-testid="import-local-data"]')).toBeNull()
  })

  test('shows import, export, publish, and dirty indicator when authenticated', async () => {
    useViewerStore.setState({
      isAuthenticated: true,
      draftDirtyByScene: { 'scan-a': true },
      publishedVersionsByScene: { 'scan-a': [3, 2, 1] },
      publishedVersionByScene: { 'scan-a': 3 },
    })
    mockGetPublishedVersions.mockResolvedValue({ versions: [3, 2, 1], liveVersion: 3 })

    const screen = await render(<PublishButton />)

    await expect.element(screen.getByTestId('import-local-data')).toBeVisible()
    await expect.element(screen.getByTestId('save-draft-button')).toBeVisible()
    await expect.element(screen.getByTestId('publish-button')).toBeVisible()
    await expect.element(screen.getByTestId('draft-dirty-indicator')).toHaveTextContent('unsaved')
  })

  test('import button triggers the hidden file input click path', async () => {
    useViewerStore.setState({ isAuthenticated: true })
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})

    const screen = await render(<PublishButton />)
    await screen.getByTestId('import-local-data').click()

    expect(clickSpy).toHaveBeenCalled()
  })

  test('version menu opens and renders published versions', async () => {
    useViewerStore.setState({
      isAuthenticated: true,
      publishedVersionsByScene: { 'scan-a': [7, 5, 4] },
      publishedVersionByScene: { 'scan-a': 5 },
    })
    mockGetPublishedVersions.mockResolvedValue({ versions: [7, 5, 4], liveVersion: 5 })

    const screen = await render(<PublishButton />)

    await screen.getByTestId('published-version-menu-trigger').click()

    await expect.element(screen.getByTestId('published-version-menu-content')).toBeVisible()
    await expect.element(screen.getByTestId('published-version-item-7')).toBeVisible()
    await expect.element(screen.getByTestId('published-version-item-5')).toBeVisible()
    await expect.element(screen.getByTestId('published-version-item-4')).toBeVisible()
  })

  test('rollback and delete actions keep their test ids and invoke publish APIs', async () => {
    useViewerStore.setState({
      isAuthenticated: true,
      publishedVersionsByScene: { 'scan-a': [5, 4] },
      publishedVersionByScene: { 'scan-a': 5 },
    })

    mockGetPublishedVersions.mockResolvedValue({ versions: [5, 4], liveVersion: 5 })
    mockRollbackRelease.mockResolvedValue({ ok: true, version: 4 })
    mockDeletePublishedVersion.mockResolvedValue({ ok: true, versions: [5], liveVersion: 5 })

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const screen = await render(<PublishButton />)

    await screen.getByTestId('published-version-menu-trigger').click()
    await expect.element(screen.getByTestId('rollback-version-4')).toBeVisible()
    await expect.element(screen.getByTestId('delete-version-4')).toBeVisible()

    await screen.getByTestId('rollback-version-4').click()
    expect(mockRollbackRelease).toHaveBeenCalledWith('scan-a', 4)

    await screen.getByTestId('published-version-menu-trigger').click()
    await screen.getByTestId('delete-version-4').click()
    expect(confirmSpy).toHaveBeenCalled()
    expect(mockDeletePublishedVersion).toHaveBeenCalledWith('scan-a', 4)
  })
})
