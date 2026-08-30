import { beforeEach, describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { LoginDialog } from '@/components/sidebar/LoginDialog'
import { useViewerStore } from '@/store/viewerStore'
import * as publishApi from '@/lib/publishApi'
import { imageStorage } from '@/storage/imageStorage'
import { vercelBlobImageStorage } from '@/storage/vercelBlobImageStorage'

vi.mock('@/lib/publishApi', () => ({
  getSession: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  getDraft: vi.fn(),
  saveDraft: vi.fn(),
  saveAndPublishDraft: vi.fn(),
  publishDraft: vi.fn(),
  getPublishedVersions: vi.fn(),
  deletePublishedVersion: vi.fn(),
  getRelease: vi.fn(),
  rollbackRelease: vi.fn(),
}))

vi.mock('@/storage/imageStorage', () => ({
  imageStorage: {
    get: vi.fn(),
    delete: vi.fn(),
    save: vi.fn(),
  },
}))

vi.mock('@/storage/vercelBlobImageStorage', () => ({
  vercelBlobImageStorage: {
    upload: vi.fn(),
  },
}))

function resetStore() {
  localStorage.removeItem('polycam-viewer-state')
  useViewerStore.setState({
    activeSceneId: 'scan-a',
    isAuthenticated: true,
    presentationMode: false,
    draftStatus: 'idle',
    draftError: null,
    draftDirtyByScene: {},
    publishedVersionByScene: {},
    publishedVersionsByScene: {},
    annotations: [],
    openAnnotationPanelIds: [],
    selectedAnnotationId: null,
    sceneMutationVersion: {},
    draftRevisionByScene: {},
    draftEtagByScene: {},
    draftRevisionSourceByScene: {},
    loadRequestVersionByScene: {},
  })
}

describe('browser login dialog logout flow', () => {
  const mockLogout = vi.mocked(publishApi.logout)
  const mockSaveDraft = vi.mocked(publishApi.saveDraft)
  const mockImageGet = vi.mocked(imageStorage.get)
  const mockImageDelete = vi.mocked(imageStorage.delete)
  const mockUpload = vi.mocked(vercelBlobImageStorage.upload)

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    resetStore()
    mockLogout.mockResolvedValue(undefined)
  })

  test('logout with no dirty scenes logs out immediately without a dialog', async () => {
    const screen = await render(<LoginDialog />)

    await screen.getByTestId('logout-button').click()

    // No confirmation dialog is rendered when nothing is dirty.
    expect(document.querySelector('[data-testid="logout-confirm-dialog"]')).toBeNull()
    expect(useViewerStore.getState().isAuthenticated).toBe(false)
    expect(mockLogout).toHaveBeenCalledTimes(1)
  })

  test('logout with dirty scene opens the confirmation dialog', async () => {
    useViewerStore.setState({ draftDirtyByScene: { 'scan-a': true } })

    const screen = await render(<LoginDialog />)
    await screen.getByTestId('logout-button').click()

    await expect.element(screen.getByTestId('logout-confirm-dialog')).toBeVisible()
    // Still authenticated until the user picks an action.
    expect(useViewerStore.getState().isAuthenticated).toBe(true)
  })

  test('cancel closes the dialog and changes nothing', async () => {
    useViewerStore.setState({ draftDirtyByScene: { 'scan-a': true } })

    const screen = await render(<LoginDialog />)
    await screen.getByTestId('logout-button').click()
    await screen.getByTestId('logout-cancel-button').click()

    expect(useViewerStore.getState().isAuthenticated).toBe(true)
    expect(mockLogout).not.toHaveBeenCalled()
  })

  test('discard & log out reverts dirty draft scenes and logs out', async () => {
    useViewerStore.setState({
      draftDirtyByScene: { 'scan-a': true },
      draftRevisionByScene: { 'scan-a': 3 },
      draftRevisionSourceByScene: { 'scan-a': 'draft' },
      annotations: [
        {
          id: 'ann-dirty',
          position: [0, 0, 0],
          title: 'Dirty',
          description: '',
          images: [],
          videoUrl: null,
          links: [],
          sceneId: 'scan-a',
          createdAt: Date.now(),
        },
      ],
      sceneMutationVersion: { 'scan-a': 1 },
    })

    const screen = await render(<LoginDialog />)
    await screen.getByTestId('logout-button').click()
    await screen.getByTestId('logout-discard-button').click()

    await vi.waitFor(() => {
      expect(useViewerStore.getState().isAuthenticated).toBe(false)
    })
    const state = useViewerStore.getState()
    expect(state.annotations.some((a) => a.sceneId === 'scan-a')).toBe(false)
    expect(state.draftDirtyByScene['scan-a']).toBeUndefined()
    expect(mockSaveDraft).not.toHaveBeenCalled()
  })

  test('save & log out persists every dirty scene then logs out', async () => {
    useViewerStore.setState({
      draftDirtyByScene: { 'scan-a': true },
      draftRevisionByScene: { 'scan-a': 3 },
      draftRevisionSourceByScene: { 'scan-a': 'draft' },
    })
    mockSaveDraft.mockResolvedValue({ ok: true, revision: 4, etag: 'etag-4' })

    const screen = await render(<LoginDialog />)
    await screen.getByTestId('logout-button').click()
    await screen.getByTestId('logout-save-button').click()

    await vi.waitFor(() => {
      expect(useViewerStore.getState().isAuthenticated).toBe(false)
    })
    expect(mockSaveDraft).toHaveBeenCalledTimes(1)
    expect(mockSaveDraft.mock.calls[0]?.[0]).toBe('scan-a')
    expect(mockLogout).toHaveBeenCalledTimes(1)
  })

  test('save & log out uploads a pending local image, saves, then logs out with the dialog gone', async () => {
    useViewerStore.setState({
      draftDirtyByScene: { 'scan-a': true },
      draftRevisionByScene: { 'scan-a': 3 },
      draftRevisionSourceByScene: { 'scan-a': 'draft' },
      annotations: [
        {
          id: 'ann-local-image',
          position: [0, 0, 0],
          title: 'Has a pending local image',
          description: '',
          images: [{ filename: 'pending.jpg', localId: 'local-logout-1' }],
          videoUrl: null,
          links: [],
          sceneId: 'scan-a',
          createdAt: Date.now(),
        },
      ],
      sceneMutationVersion: { 'scan-a': 1 },
    })
    mockImageGet.mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }))
    mockImageDelete.mockResolvedValue(undefined)
    mockUpload.mockResolvedValue({
      filename: 'pending.jpg',
      url: 'https://blob.example/pending.jpg',
    })
    mockSaveDraft.mockResolvedValue({ ok: true, revision: 4, etag: 'etag-4' })

    const screen = await render(<LoginDialog />)
    await screen.getByTestId('logout-button').click()
    await screen.getByTestId('logout-save-button').click()

    await vi.waitFor(() => {
      expect(useViewerStore.getState().isAuthenticated).toBe(false)
    })

    // The pending local image is uploaded, the draft is saved with its remote
    // URL, the local copy is cleaned up, and logout completes.
    expect(mockUpload).toHaveBeenCalledTimes(1)
    expect(mockSaveDraft).toHaveBeenCalledTimes(1)
    expect(mockImageDelete).toHaveBeenCalledWith('local-logout-1')
    expect(mockLogout).toHaveBeenCalledTimes(1)
    // The confirmation dialog is gone after a clean logout.
    expect(document.querySelector('[data-testid="logout-confirm-dialog"]')).toBeNull()
  })

  test('save failure keeps the user authenticated and surfaces the error', async () => {
    useViewerStore.setState({
      draftDirtyByScene: { 'scan-a': true },
      draftRevisionByScene: { 'scan-a': 3 },
      draftRevisionSourceByScene: { 'scan-a': 'draft' },
    })
    mockSaveDraft.mockRejectedValue(new Error('Save exploded'))

    const screen = await render(<LoginDialog />)
    await screen.getByTestId('logout-button').click()
    await screen.getByTestId('logout-save-button').click()

    await expect.element(screen.getByTestId('logout-error-message')).toHaveTextContent(
      'Save exploded'
    )
    expect(useViewerStore.getState().isAuthenticated).toBe(true)
    expect(mockLogout).not.toHaveBeenCalled()
  })
})
