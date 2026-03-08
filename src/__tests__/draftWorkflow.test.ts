import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useViewerStore } from '@/store/viewerStore'
import * as publishApi from '@/lib/publishApi'
import { imageStorage } from '@/storage/imageStorage'
import { vercelBlobImageStorage } from '@/storage/vercelBlobImageStorage'
import type { SceneDraft } from '@/types'

function resetStore() {
  localStorage.removeItem('polycam-viewer-state')
  useViewerStore.setState({
    activeSceneId: 'scan-a',
    publishedScenes: [],
    discoveredScenes: [],
    uploadedScenes: [],
    viewMode: 'mesh',
    toolMode: 'orbit',
    measurements: [],
    annotations: [],
    openAnnotationPanelIds: [],
    clipPlane: { enabled: false, axis: 'y', position: 0.5, flipped: false },
    colorMapMode: 'original',
    pointSize: 0.02,
    cameraControlsEnabled: true,
    isLoading: false,
    loadingProgress: 0,
    loadingMessage: '',
    sceneMutationVersion: {},
    draftRevisionByScene: {},
    draftRevisionSourceByScene: {},
    draftDirtyByScene: {},
    publishedVersionByScene: {},
    publishedVersionsByScene: {},
    loadRequestVersionByScene: {},
    officialSceneSyncOverridesByScene: {},
  })
}

describe('viewerStore draft workflow', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    resetStore()
  })

  it('loadPublishedVersions stores sorted versions and live version mapping', async () => {
    vi.spyOn(publishApi, 'getPublishedVersions').mockResolvedValue({
      versions: [7, 6, 4],
      liveVersion: 6,
    })

    const { loadPublishedVersions } = useViewerStore.getState()
    await loadPublishedVersions('scan-a')

    const state = useViewerStore.getState()
    expect(state.publishedVersionsByScene['scan-a']).toEqual([7, 6, 4])
    expect(state.publishedVersionByScene['scan-a']).toBe(6)
  })

  it('deletePublishedVersion removes live mapping when API reports no live version', async () => {
    useViewerStore.setState({
      publishedVersionByScene: { 'scan-a': 5 },
      publishedVersionsByScene: { 'scan-a': [5, 4, 3] },
    })

    vi.spyOn(publishApi, 'deletePublishedVersion').mockResolvedValue({
      ok: true,
      versions: [4, 3],
      liveVersion: null,
    })

    const { deletePublishedVersion } = useViewerStore.getState()
    await deletePublishedVersion('scan-a', 5)

    const state = useViewerStore.getState()
    expect(state.publishedVersionsByScene['scan-a']).toEqual([4, 3])
    expect(state.publishedVersionByScene['scan-a']).toBeUndefined()
  })

  it('saveDraft sends only remote images to API', async () => {
    useViewerStore.setState({
      annotations: [
        {
          id: 'ann-remote-only',
          position: [0, 0, 0],
          title: 'With mixed media',
          description: '',
          images: [
            { filename: 'local.jpg', localId: 'local-img-1' },
            { filename: 'remote.jpg', url: 'https://blob.example/remote.jpg' },
          ],
          videoUrl: null,
          links: [],
          sceneId: 'scan-a',
          createdAt: Date.now(),
        },
      ],
      draftRevisionByScene: { 'scan-a': 4 },
      draftRevisionSourceByScene: { 'scan-a': 'draft' },
      draftDirtyByScene: { 'scan-a': true },
    })

    const saveDraftSpy = vi.spyOn(publishApi, 'saveDraft').mockResolvedValue({
      ok: true,
      revision: 5,
    })

    const { saveDraft } = useViewerStore.getState()
    await saveDraft('scan-a')

    const draftPayload = saveDraftSpy.mock.calls[0]?.[1]
    expect(draftPayload).toBeTruthy()
    expect(draftPayload.annotations).toHaveLength(1)
    expect(draftPayload.annotations[0].images).toEqual([
      { filename: 'remote.jpg', url: 'https://blob.example/remote.jpg' },
    ])
    expect(useViewerStore.getState().draftDirtyByScene['scan-a']).toBe(true)
  })

  it('loadDraft for newly synced scene updates only that scene and preserves existing scene draft maps', async () => {
    useViewerStore.setState({
      annotations: [
        {
          id: 'ann-existing-scan-a',
          position: [0, 0, 0],
          title: 'Existing scan-a',
          description: '',
          images: [],
          videoUrl: null,
          links: [],
          sceneId: 'scan-a',
          createdAt: Date.now(),
        },
        {
          id: 'ann-pre-sync-new-scene',
          position: [1, 1, 1],
          title: 'Pre-sync local',
          description: '',
          images: [],
          videoUrl: null,
          links: [],
          sceneId: 'synced-scene',
          createdAt: Date.now(),
        },
      ],
      draftRevisionByScene: { 'scan-a': 7 },
      draftRevisionSourceByScene: { 'scan-a': 'draft' },
      draftDirtyByScene: { 'scan-a': true, 'synced-scene': false },
      sceneMutationVersion: { 'scan-a': 3 },
    })

    const { markOfficialSceneSyncSuccess, loadDraft } = useViewerStore.getState()
    markOfficialSceneSyncSuccess({
      id: 'synced-scene',
      name: 'Synced Scene',
      glbUrl: 'https://blob.test/synced-scene.glb',
      plyUrl: 'https://blob.test/synced-scene.ply',
    })

    vi.spyOn(publishApi, 'getDraft').mockResolvedValue({
      sceneId: 'synced-scene',
      revision: 4,
      annotations: [
        {
          id: 'ann-server-new-scene',
          position: [2, 2, 2],
          title: 'Server draft',
          description: '',
          images: [],
          videoUrl: null,
          links: [],
          sceneId: 'synced-scene',
          createdAt: Date.now(),
        },
      ],
      updatedAt: Date.now(),
    })

    await loadDraft('synced-scene')

    const state = useViewerStore.getState()
    expect(state.sceneMutationVersion['synced-scene']).toBe(1)
    expect(state.annotations.some((annotation) => annotation.id === 'ann-existing-scan-a')).toBe(true)
    expect(state.annotations.some((annotation) => annotation.id === 'ann-server-new-scene')).toBe(true)
    expect(state.annotations.some((annotation) => annotation.id === 'ann-pre-sync-new-scene')).toBe(false)
    expect(state.draftRevisionByScene['synced-scene']).toBe(4)
    expect(state.draftDirtyByScene['synced-scene']).toBe(false)
    expect(state.draftRevisionByScene['scan-a']).toBe(7)
    expect(state.draftDirtyByScene['scan-a']).toBe(true)
  })

  it('saveDraft on newly synced scene uses stable sceneId and leaves existing scene state unchanged', async () => {
    useViewerStore.setState({
      annotations: [
        {
          id: 'ann-existing-scan-a',
          position: [0, 0, 0],
          title: 'Existing scan-a',
          description: '',
          images: [],
          videoUrl: null,
          links: [],
          sceneId: 'scan-a',
          createdAt: Date.now(),
        },
        {
          id: 'ann-new-synced-scene',
          position: [3, 3, 3],
          title: 'New synced scene annotation',
          description: '',
          images: [],
          videoUrl: null,
          links: [],
          sceneId: 'synced-scene',
          createdAt: Date.now(),
        },
      ],
      draftRevisionByScene: { 'scan-a': 8, 'synced-scene': 0 },
      draftRevisionSourceByScene: { 'scan-a': 'draft', 'synced-scene': 'draft' },
      draftDirtyByScene: { 'scan-a': true, 'synced-scene': true },
    })

    const { markOfficialSceneSyncSuccess, saveDraft } = useViewerStore.getState()
    markOfficialSceneSyncSuccess({
      id: 'synced-scene',
      name: 'Synced Scene',
      glbUrl: 'https://blob.test/synced-scene.glb',
      plyUrl: 'https://blob.test/synced-scene.ply',
    })

    const saveDraftSpy = vi.spyOn(publishApi, 'saveDraft').mockResolvedValue({
      ok: true,
      revision: 1,
    })

    await saveDraft('synced-scene')

    const [calledSceneId, payload] = saveDraftSpy.mock.calls[0] ?? []
    expect(calledSceneId).toBe('synced-scene')
    expect(payload?.sceneId).toBe('synced-scene')
    expect(payload?.annotations).toHaveLength(1)
    expect(payload?.annotations[0]?.sceneId).toBe('synced-scene')

    const state = useViewerStore.getState()
    expect(state.draftRevisionByScene['synced-scene']).toBe(1)
    expect(state.draftDirtyByScene['synced-scene']).toBe(false)
    expect(state.draftRevisionByScene['scan-a']).toBe(8)
    expect(state.draftDirtyByScene['scan-a']).toBe(true)
  })

  it('publishDraft uploads local images before publish', async () => {
    useViewerStore.setState({
      annotations: [
        {
          id: 'ann-upload-1',
          position: [0, 0, 0],
          title: 'Upload on publish',
          description: '',
          images: [{ filename: 'pending.jpg', localId: 'local-img-2' }],
          videoUrl: null,
          links: [],
          sceneId: 'scan-a',
          createdAt: Date.now(),
        },
      ],
      draftRevisionByScene: { 'scan-a': 0 },
      draftRevisionSourceByScene: { 'scan-a': 'draft' },
      draftDirtyByScene: { 'scan-a': true },
    })

    vi.spyOn(imageStorage, 'get').mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }))
    const deleteSpy = vi.spyOn(imageStorage, 'delete').mockResolvedValue()
    const uploadSpy = vi.spyOn(vercelBlobImageStorage, 'upload').mockResolvedValue({
      filename: 'pending.jpg',
      url: 'https://blob.example/pending.jpg',
    })
    const saveDraftSpy = vi.spyOn(publishApi, 'saveDraft').mockResolvedValue({
      ok: true,
      revision: 1,
    })
    const publishSpy = vi.spyOn(publishApi, 'publishDraft').mockResolvedValue({
      ok: true,
      version: 2,
    })

    const { publishDraft } = useViewerStore.getState()
    await publishDraft('scan-a')

    expect(uploadSpy).toHaveBeenCalledTimes(1)
    expect(uploadSpy).toHaveBeenCalledWith(expect.any(Blob), {
      sceneId: 'scan-a',
      annotationId: 'ann-upload-1',
      filename: 'pending.jpg',
    })

    const savedDraft = saveDraftSpy.mock.calls[0]?.[1]
    expect(savedDraft.annotations[0].images).toEqual([
      { filename: 'pending.jpg', url: 'https://blob.example/pending.jpg' },
    ])

    expect(deleteSpy).toHaveBeenCalledWith('local-img-2')
    expect(publishSpy).toHaveBeenCalledTimes(1)
    const publishInput = publishSpy.mock.calls[0]?.[1]
    expect(publishInput).toBeTruthy()
    expect(publishInput?.expectedRevision).toBe(1)
    expect(publishInput?.message).toBeUndefined()
    expect(publishInput?.draft?.annotations[0]?.images).toEqual([
      { filename: 'pending.jpg', url: 'https://blob.example/pending.jpg' },
    ])
    expect(useViewerStore.getState().draftDirtyByScene['scan-a']).toBe(false)
  })

  it('publishDraft preserves GIF blob type for local GIF images', async () => {
    useViewerStore.setState({
      annotations: [
        {
          id: 'ann-upload-gif',
          position: [0, 0, 0],
          title: 'Upload gif on publish',
          description: '',
          images: [{ filename: 'animated.gif', localId: 'local-gif-1' }],
          videoUrl: null,
          links: [],
          sceneId: 'scan-a',
          createdAt: Date.now(),
        },
      ],
      draftRevisionByScene: { 'scan-a': 0 },
      draftRevisionSourceByScene: { 'scan-a': 'draft' },
      draftDirtyByScene: { 'scan-a': true },
    })

    vi.spyOn(imageStorage, 'get').mockResolvedValue(new Blob(['gif'], { type: 'image/gif' }))
    vi.spyOn(imageStorage, 'delete').mockResolvedValue()
    const uploadSpy = vi.spyOn(vercelBlobImageStorage, 'upload').mockImplementation(async (blob, metadata) => {
      expect(blob.type).toBe('image/gif')
      expect(metadata.filename).toBe('animated.gif')
      return {
        filename: 'animated.gif',
        url: 'https://blob.example/animated.gif',
      }
    })
    vi.spyOn(publishApi, 'saveDraft').mockResolvedValue({
      ok: true,
      revision: 1,
    })
    vi.spyOn(publishApi, 'publishDraft').mockResolvedValue({
      ok: true,
      version: 2,
    })

    const { publishDraft } = useViewerStore.getState()
    await publishDraft('scan-a')

    expect(uploadSpy).toHaveBeenCalledTimes(1)
  })

  it('saveDraft refreshes revision when local source is release', async () => {
    useViewerStore.setState({
      annotations: [
        {
          id: 'ann-stale-revision',
          position: [0, 0, 0],
          title: 'Revision sync',
          description: '',
          images: [],
          videoUrl: null,
          links: [],
          sceneId: 'scan-a',
          createdAt: Date.now(),
        },
      ],
      draftRevisionByScene: { 'scan-a': 1 },
      draftRevisionSourceByScene: { 'scan-a': 'release' },
    })

    vi.spyOn(publishApi, 'getDraft').mockResolvedValue({
      sceneId: 'scan-a',
      revision: 7,
      annotations: [],
      updatedAt: Date.now(),
    })
    const saveDraftSpy = vi.spyOn(publishApi, 'saveDraft').mockResolvedValue({
      ok: true,
      revision: 8,
    })

    const { saveDraft } = useViewerStore.getState()
    await saveDraft('scan-a')

    expect(saveDraftSpy).toHaveBeenCalledWith('scan-a', expect.any(Object), 7)
    expect(useViewerStore.getState().draftRevisionByScene['scan-a']).toBe(8)
    expect(useViewerStore.getState().draftRevisionSourceByScene['scan-a']).toBe('draft')
  })

  it('saveDraft retries once on revision conflict', async () => {
    useViewerStore.setState({
      annotations: [
        {
          id: 'ann-retry',
          position: [0, 0, 0],
          title: 'Retry conflict',
          description: '',
          images: [],
          videoUrl: null,
          links: [],
          sceneId: 'scan-a',
          createdAt: Date.now(),
        },
      ],
      draftRevisionByScene: { 'scan-a': 2 },
      draftRevisionSourceByScene: { 'scan-a': 'draft' },
    })

    const conflictError = Object.assign(new Error('Revision mismatch'), { status: 409 })

    vi.spyOn(publishApi, 'getDraft').mockResolvedValue({
      sceneId: 'scan-a',
      revision: 9,
      annotations: [],
      updatedAt: Date.now(),
    })

    const saveDraftSpy = vi
      .spyOn(publishApi, 'saveDraft')
      .mockRejectedValueOnce(conflictError)
      .mockResolvedValueOnce({ ok: true, revision: 10 })

    const { saveDraft } = useViewerStore.getState()
    const revision = await saveDraft('scan-a')

    expect(saveDraftSpy).toHaveBeenCalledTimes(2)
    expect(saveDraftSpy.mock.calls[0]?.[2]).toBe(2)
    expect(saveDraftSpy.mock.calls[1]?.[2]).toBe(9)
    expect(revision).toBe(10)
    expect(useViewerStore.getState().draftStatus).toBe('idle')
  })

  it('saveDraft fails after three revision conflicts', async () => {
    useViewerStore.setState({
      annotations: [
        {
          id: 'ann-retry-fail',
          position: [0, 0, 0],
          title: 'Retry conflict fail',
          description: '',
          images: [],
          videoUrl: null,
          links: [],
          sceneId: 'scan-a',
          createdAt: Date.now(),
        },
      ],
      draftRevisionByScene: { 'scan-a': 2 },
      draftRevisionSourceByScene: { 'scan-a': 'draft' },
    })

    const conflictError = Object.assign(new Error('Revision mismatch'), { status: 409 })

    const getDraftSpy = vi
      .spyOn(publishApi, 'getDraft')
      .mockResolvedValueOnce({ sceneId: 'scan-a', revision: 8, annotations: [], updatedAt: Date.now() })
      .mockResolvedValueOnce({ sceneId: 'scan-a', revision: 9, annotations: [], updatedAt: Date.now() })
      .mockResolvedValueOnce({ sceneId: 'scan-a', revision: 10, annotations: [], updatedAt: Date.now() })

    const saveDraftSpy = vi
      .spyOn(publishApi, 'saveDraft')
      .mockRejectedValueOnce(conflictError)
      .mockRejectedValueOnce(conflictError)
      .mockRejectedValueOnce(conflictError)

    const { saveDraft } = useViewerStore.getState()

    await expect(saveDraft('scan-a')).rejects.toThrow('Draft changed while saving. Please try Publish again.')

    expect(saveDraftSpy).toHaveBeenCalledTimes(3)
    expect(getDraftSpy).toHaveBeenCalledTimes(3)
    expect(useViewerStore.getState().draftStatus).toBe('conflict')
  })

  it('refreshAuthSession syncs authentication flag from API', async () => {
    useViewerStore.setState({ isAuthenticated: false })

    vi.spyOn(publishApi, 'getSession').mockResolvedValue({ authenticated: true })

    const { refreshAuthSession } = useViewerStore.getState()
    await refreshAuthSession()

    expect(useViewerStore.getState().isAuthenticated).toBe(true)
  })

  it('loadDraft keeps local annotation created while request is in flight', async () => {
    const resolver: { current: ((value: SceneDraft) => void) | null } = { current: null }
    const draftPromise = new Promise<SceneDraft>((resolve) => {
      resolver.current = (value: SceneDraft) => {
        resolve(value)
      }
    })

    vi.spyOn(publishApi, 'getDraft').mockReturnValue(draftPromise)
    vi.spyOn(publishApi, 'getRelease').mockResolvedValue({
      sceneId: 'scan-a',
      revision: 0,
      annotations: [],
      updatedAt: Date.now(),
    })

    const { loadDraft, addAnnotation } = useViewerStore.getState()
    const loadPromise = loadDraft('scan-a')

    addAnnotation({
      id: 'local-1',
      position: [1, 1, 1],
      title: 'Local annotation',
      description: '',
      images: [],
      videoUrl: null,
      links: [],
      sceneId: 'scan-a',
      createdAt: Date.now(),
    })

    if (!resolver.current) {
      throw new Error('draft resolver was not initialized')
    }

    resolver.current({
      sceneId: 'scan-a',
      revision: 2,
      annotations: [],
      updatedAt: Date.now(),
    })

    await loadPromise

    const state = useViewerStore.getState()
    expect(state.annotations).toHaveLength(1)
    expect(state.annotations[0].id).toBe('local-1')
    expect(state.draftRevisionByScene['scan-a']).toBe(2)
    expect(state.draftDirtyByScene['scan-a']).toBe(true)
  })

  it('loadDraft keeps dirty state when user deletes last local annotation during in-flight request', async () => {
    const resolver: { current: ((value: SceneDraft) => void) | null } = { current: null }
    const draftPromise = new Promise<SceneDraft>((resolve) => {
      resolver.current = (value: SceneDraft) => {
        resolve(value)
      }
    })

    vi.spyOn(publishApi, 'getDraft').mockReturnValue(draftPromise)
    vi.spyOn(publishApi, 'getRelease').mockResolvedValue({
      sceneId: 'scan-a',
      revision: 0,
      annotations: [],
      updatedAt: Date.now(),
    })

    useViewerStore.setState({
      annotations: [
        {
          id: 'local-delete-1',
          position: [0, 0, 0],
          title: 'To delete',
          description: '',
          images: [],
          videoUrl: null,
          links: [],
          sceneId: 'scan-a',
          createdAt: Date.now(),
        },
      ],
      draftDirtyByScene: { 'scan-a': false },
      sceneMutationVersion: { 'scan-a': 1 },
    })

    const { loadDraft, removeAnnotation } = useViewerStore.getState()
    const loadPromise = loadDraft('scan-a')

    removeAnnotation('local-delete-1')

    if (!resolver.current) {
      throw new Error('draft resolver was not initialized')
    }

    resolver.current({
      sceneId: 'scan-a',
      revision: 3,
      annotations: [
        {
          id: 'server-annotation',
          position: [1, 1, 1],
          title: 'Server version',
          description: '',
          images: [],
          videoUrl: null,
          links: [],
          sceneId: 'scan-a',
          createdAt: Date.now(),
        },
      ],
      updatedAt: Date.now(),
    })

    await loadPromise

    const state = useViewerStore.getState()
    expect(state.annotations).toHaveLength(0)
    expect(state.draftDirtyByScene['scan-a']).toBe(true)
  })
})
