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
    draftEtagByScene: {},
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
      etag: 'etag-5',
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
      etag: 'etag-1',
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
      draftEtagByScene: { 'scan-a': null },
      draftRevisionSourceByScene: { 'scan-a': 'draft' },
      draftDirtyByScene: { 'scan-a': true },
    })

    vi.spyOn(imageStorage, 'get').mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }))
    const deleteSpy = vi.spyOn(imageStorage, 'delete').mockResolvedValue()
    const uploadSpy = vi.spyOn(vercelBlobImageStorage, 'upload').mockResolvedValue({
      filename: 'pending.jpg',
      url: 'https://blob.example/pending.jpg',
    })
    const saveAndPublishSpy = vi.spyOn(publishApi, 'saveAndPublishDraft').mockResolvedValue({
      ok: true,
      revision: 1,
      etag: 'etag-1',
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

    const savedDraft = saveAndPublishSpy.mock.calls[0]?.[1]
    expect(savedDraft.annotations[0].images).toEqual([
      { filename: 'pending.jpg', url: 'https://blob.example/pending.jpg' },
    ])

    expect(deleteSpy).toHaveBeenCalledWith('local-img-2')
    expect(saveAndPublishSpy).toHaveBeenCalledTimes(1)
    expect(saveAndPublishSpy).toHaveBeenCalledWith(
      'scan-a',
      expect.objectContaining({ sceneId: 'scan-a', revision: 0 }),
      0,
      null,
      undefined
    )
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
      draftEtagByScene: { 'scan-a': null },
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
    vi.spyOn(publishApi, 'saveAndPublishDraft').mockResolvedValue({
      ok: true,
      revision: 1,
      etag: 'etag-1',
      version: 2,
    })

    const { publishDraft } = useViewerStore.getState()
    await publishDraft('scan-a')

    expect(uploadSpy).toHaveBeenCalledTimes(1)
  })

  it.each(['scan-b', 'scan-c'])('publishes two consecutive versions for %s in one request each', async (sceneId) => {
    useViewerStore.setState({
      activeSceneId: sceneId,
      annotations: [
        {
          id: `ann-${sceneId}`,
          position: [0, 0, 0],
          title: 'Version one',
          description: '',
          images: [],
          videoUrl: null,
          links: [],
          sceneId,
          createdAt: Date.now(),
        },
      ],
      draftRevisionByScene: { [sceneId]: 0 },
      draftEtagByScene: { [sceneId]: null },
      draftRevisionSourceByScene: { [sceneId]: 'draft' },
      draftDirtyByScene: { [sceneId]: true },
    })

    let version = 0
    const saveAndPublishSpy = vi
      .spyOn(publishApi, 'saveAndPublishDraft')
      .mockImplementation(async (_sceneId, _draft, expectedRevision) => ({
        ok: true,
        revision: expectedRevision + 1,
        etag: `etag-${expectedRevision + 1}`,
        version: ++version,
      }))
    const legacyPublishSpy = vi.spyOn(publishApi, 'publishDraft')

    await useViewerStore.getState().publishDraft(sceneId)
    useViewerStore.getState().updateAnnotation(`ann-${sceneId}`, 'Version two')
    await useViewerStore.getState().publishDraft(sceneId)

    expect(saveAndPublishSpy).toHaveBeenCalledTimes(2)
    expect(saveAndPublishSpy.mock.calls[0]?.[2]).toBe(0)
    expect(saveAndPublishSpy.mock.calls[0]?.[3]).toBeNull()
    expect(saveAndPublishSpy.mock.calls[1]?.[2]).toBe(1)
    expect(saveAndPublishSpy.mock.calls[1]?.[3]).toBe('etag-1')
    expect(legacyPublishSpy).not.toHaveBeenCalled()

    const state = useViewerStore.getState()
    expect(state.draftRevisionByScene[sceneId]).toBe(2)
    expect(state.draftEtagByScene[sceneId]).toBe('etag-2')
    expect(state.publishedVersionByScene[sceneId]).toBe(2)
    expect(state.publishedVersionsByScene[sceneId]).toEqual([2, 1])
    expect(state.draftDirtyByScene[sceneId]).toBe(false)
  })

  it('keeps a publish retryable when the save-and-publish response has no version', async () => {
    useViewerStore.setState({
      annotations: [
        {
          id: 'ann-malformed-publish',
          position: [0, 0, 0],
          title: 'Still unpublished',
          description: '',
          images: [],
          videoUrl: null,
          links: [],
          sceneId: 'scan-a',
          createdAt: Date.now(),
        },
      ],
      draftRevisionByScene: { 'scan-a': 1 },
      draftEtagByScene: { 'scan-a': 'etag-1' },
      draftRevisionSourceByScene: { 'scan-a': 'draft' },
      draftDirtyByScene: { 'scan-a': true },
      publishedVersionByScene: { 'scan-a': 1 },
      publishedVersionsByScene: { 'scan-a': [1] },
    })

    const malformedResponse = {
      ok: true,
      revision: 2,
      etag: 'etag-2',
    } as unknown as Awaited<ReturnType<typeof publishApi.saveAndPublishDraft>>
    vi.spyOn(publishApi, 'saveAndPublishDraft').mockResolvedValue(malformedResponse)

    await expect(useViewerStore.getState().publishDraft('scan-a')).rejects.toThrow(
      'Publish response did not include a version'
    )

    const state = useViewerStore.getState()
    expect(state.draftRevisionByScene['scan-a']).toBe(1)
    expect(state.draftDirtyByScene['scan-a']).toBe(true)
    expect(state.publishedVersionByScene['scan-a']).toBe(1)
    expect(state.draftStatus).toBe('error')
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
      draftEtag: 'etag-7',
      annotations: [],
      updatedAt: Date.now(),
    })
    const saveDraftSpy = vi.spyOn(publishApi, 'saveDraft').mockResolvedValue({
      ok: true,
      revision: 8,
      etag: 'etag-8',
    })

    const { saveDraft } = useViewerStore.getState()
    await saveDraft('scan-a')

    expect(saveDraftSpy).toHaveBeenCalledWith(
      'scan-a',
      expect.any(Object),
      7,
      'etag-7'
    )
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
      draftEtag: 'etag-9',
      annotations: [],
      updatedAt: Date.now(),
    })

    const saveDraftSpy = vi
      .spyOn(publishApi, 'saveDraft')
      .mockRejectedValueOnce(conflictError)
      .mockResolvedValueOnce({ ok: true, revision: 10, etag: 'etag-10' })

    const { saveDraft } = useViewerStore.getState()
    const result = await saveDraft('scan-a')

    expect(saveDraftSpy).toHaveBeenCalledTimes(2)
    expect(saveDraftSpy.mock.calls[0]?.[2]).toBe(2)
    expect(saveDraftSpy.mock.calls[0]?.[3]).toBeUndefined()
    expect(saveDraftSpy.mock.calls[1]?.[2]).toBe(9)
    expect(saveDraftSpy.mock.calls[1]?.[3]).toBe('etag-9')
    expect(result.revision).toBe(10)
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

  it('login-in-place then load fetches the server draft over release-sourced annotations (no silent overwrite)', async () => {
    // Anonymous visit fell back to the release (cookie expired -> getDraft 401).
    useViewerStore.setState({
      isAuthenticated: false,
      annotations: [
        {
          id: 'ann-from-release',
          position: [0, 0, 0],
          title: 'Release copy',
          description: '',
          images: [],
          videoUrl: null,
          links: [],
          sceneId: 'scan-a',
          createdAt: Date.now(),
        },
      ],
      draftRevisionByScene: { 'scan-a': 5 },
      draftRevisionSourceByScene: { 'scan-a': 'release' },
      draftDirtyByScene: { 'scan-a': false },
    })

    vi.spyOn(publishApi, 'login').mockResolvedValue(undefined)
    vi.spyOn(publishApi, 'getDraft').mockResolvedValue({
      sceneId: 'scan-a',
      revision: 6,
      annotations: [
        {
          id: 'ann-unpublished-draft',
          position: [1, 1, 1],
          title: 'Unpublished draft edit',
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
    const saveDraftSpy = vi.spyOn(publishApi, 'saveDraft').mockResolvedValue({
      ok: true,
      revision: 7,
      etag: 'etag-7',
    })

    const store = useViewerStore.getState()
    await store.login('secret')
    // The App load effect now runs loadDraft after auth because the scene was
    // release-sourced and not dirty.
    await store.loadDraft('scan-a')

    const state = useViewerStore.getState()
    expect(state.annotations.map((a) => a.id)).toEqual(['ann-unpublished-draft'])
    expect(state.draftRevisionSourceByScene['scan-a']).toBe('draft')
    expect(state.draftRevisionByScene['scan-a']).toBe(6)

    // A later save targets the loaded draft revision, so the unpublished server
    // draft is not overwritten with release-derived content.
    await useViewerStore.getState().saveDraft('scan-a')
    expect(saveDraftSpy.mock.calls[0]?.[2]).toBe(6)
    const savedPayload = saveDraftSpy.mock.calls[0]?.[1]
    expect(savedPayload.annotations.map((a) => a.id)).toEqual([
      'ann-unpublished-draft',
    ])
  })

  it('saveDraft keeps dirty flag when the scene is edited during the in-flight request', async () => {
    useViewerStore.setState({
      annotations: [
        {
          id: 'ann-inflight-base',
          position: [0, 0, 0],
          title: 'Base',
          description: '',
          images: [],
          videoUrl: null,
          links: [],
          sceneId: 'scan-a',
          createdAt: Date.now(),
        },
      ],
      draftRevisionByScene: { 'scan-a': 3 },
      draftRevisionSourceByScene: { 'scan-a': 'draft' },
      draftDirtyByScene: { 'scan-a': true },
    })

    const resolver: {
      current: ((value: { ok: true; revision: number; etag: string }) => void) | null
    } = {
      current: null,
    }
    const savePromise = new Promise<{ ok: true; revision: number; etag: string }>((resolve) => {
      resolver.current = resolve
    })
    vi.spyOn(publishApi, 'saveDraft').mockReturnValue(savePromise)

    const { saveDraft, addAnnotation } = useViewerStore.getState()
    const savePending = saveDraft('scan-a')

    // A concurrent edit lands while the request is in flight; it is not part of
    // the snapshotted payload, so the draft must remain dirty.
    addAnnotation({
      id: 'ann-inflight-edit',
      position: [2, 2, 2],
      title: 'Edited mid-save',
      description: '',
      images: [],
      videoUrl: null,
      links: [],
      sceneId: 'scan-a',
      createdAt: Date.now(),
    })

    if (!resolver.current) throw new Error('save resolver not initialized')
    resolver.current({ ok: true, revision: 4, etag: 'etag-4' })
    await savePending

    const state = useViewerStore.getState()
    expect(state.draftRevisionByScene['scan-a']).toBe(4)
    expect(state.draftDirtyByScene['scan-a']).toBe(true)
  })

  it('publishDraft defers local image deletion so partial-upload failure keeps local copies', async () => {
    useViewerStore.setState({
      annotations: [
        {
          id: 'ann-partial-1',
          position: [0, 0, 0],
          title: 'First',
          description: '',
          images: [{ filename: 'first.jpg', localId: 'local-first' }],
          videoUrl: null,
          links: [],
          sceneId: 'scan-a',
          createdAt: Date.now(),
        },
        {
          id: 'ann-partial-2',
          position: [1, 1, 1],
          title: 'Second',
          description: '',
          images: [{ filename: 'second.jpg', localId: 'local-second' }],
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
    vi.spyOn(vercelBlobImageStorage, 'upload')
      .mockResolvedValueOnce({ filename: 'first.jpg', url: 'https://blob.example/first.jpg' })
      .mockRejectedValueOnce(new Error('network down'))
    const saveAndPublishSpy = vi.spyOn(publishApi, 'saveAndPublishDraft').mockResolvedValue({
      ok: true,
      revision: 1,
      etag: 'etag-1',
      version: 1,
    })

    const { publishDraft } = useViewerStore.getState()
    await expect(publishDraft('scan-a')).rejects.toThrow('network down')

    // The combined save+publish never ran, so no local copy may be deleted.
    expect(saveAndPublishSpy).not.toHaveBeenCalled()
    expect(deleteSpy).not.toHaveBeenCalled()

    // The successfully-uploaded image is still committed as a remote URL.
    const first = useViewerStore
      .getState()
      .annotations.find((a) => a.id === 'ann-partial-1')
    expect(first?.images[0]).toEqual({
      filename: 'first.jpg',
      url: 'https://blob.example/first.jpg',
    })
  })

  it('saveDraftWithImages uploads pending local images, saves, then deletes local copies', async () => {
    useViewerStore.setState({
      annotations: [
        {
          id: 'ann-save-images',
          position: [0, 0, 0],
          title: 'Save with images',
          description: '',
          images: [{ filename: 'pending.jpg', localId: 'local-save-1' }],
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
      etag: 'etag-1',
    })
    const publishSpy = vi.spyOn(publishApi, 'publishDraft')

    const { saveDraftWithImages } = useViewerStore.getState()
    const revision = await saveDraftWithImages('scan-a')

    expect(uploadSpy).toHaveBeenCalledTimes(1)
    expect(uploadSpy).toHaveBeenCalledWith(expect.any(Blob), {
      sceneId: 'scan-a',
      annotationId: 'ann-save-images',
      filename: 'pending.jpg',
    })

    // The saved payload carries the uploaded remote URL, not the local id.
    const savedDraft = saveDraftSpy.mock.calls[0]?.[1]
    expect(savedDraft.annotations[0].images).toEqual([
      { filename: 'pending.jpg', url: 'https://blob.example/pending.jpg' },
    ])

    // Local copy is deleted only after saveDraft persisted the remote URL.
    expect(deleteSpy).toHaveBeenCalledWith('local-save-1')
    expect(revision).toBe(1)
    // The save path never publishes.
    expect(publishSpy).not.toHaveBeenCalled()

    // The committed annotation now references the remote URL and is no longer dirty.
    const committed = useViewerStore
      .getState()
      .annotations.find((a) => a.id === 'ann-save-images')
    expect(committed?.images[0]).toEqual({
      filename: 'pending.jpg',
      url: 'https://blob.example/pending.jpg',
    })
    expect(useViewerStore.getState().draftDirtyByScene['scan-a']).toBe(false)
  })

  it('saveDraftWithImages throws on partial upload failure, deleting nothing and committing successes', async () => {
    useViewerStore.setState({
      annotations: [
        {
          id: 'ann-save-partial-1',
          position: [0, 0, 0],
          title: 'First',
          description: '',
          images: [{ filename: 'first.jpg', localId: 'local-save-first' }],
          videoUrl: null,
          links: [],
          sceneId: 'scan-a',
          createdAt: Date.now(),
        },
        {
          id: 'ann-save-partial-2',
          position: [1, 1, 1],
          title: 'Second',
          description: '',
          images: [{ filename: 'second.jpg', localId: 'local-save-second' }],
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
    vi.spyOn(vercelBlobImageStorage, 'upload')
      .mockResolvedValueOnce({ filename: 'first.jpg', url: 'https://blob.example/first.jpg' })
      .mockRejectedValueOnce(new Error('network down'))
    const saveDraftSpy = vi.spyOn(publishApi, 'saveDraft').mockResolvedValue({
      ok: true,
      revision: 1,
      etag: 'etag-1',
    })

    const { saveDraftWithImages } = useViewerStore.getState()
    await expect(saveDraftWithImages('scan-a')).rejects.toThrow('network down')

    // saveDraft never ran, so no local copy may be deleted (retry-friendly).
    expect(saveDraftSpy).not.toHaveBeenCalled()
    expect(deleteSpy).not.toHaveBeenCalled()

    // The successfully-uploaded image is still committed as a remote URL.
    const first = useViewerStore
      .getState()
      .annotations.find((a) => a.id === 'ann-save-partial-1')
    expect(first?.images[0]).toEqual({
      filename: 'first.jpg',
      url: 'https://blob.example/first.jpg',
    })
  })

  it('logout clears non-dirty draft annotations but keeps dirty scene edits', async () => {
    useViewerStore.setState({
      isAuthenticated: true,
      presentationMode: false,
      annotations: [
        {
          id: 'ann-clean-draft',
          position: [0, 0, 0],
          title: 'Clean draft',
          description: '',
          images: [],
          videoUrl: null,
          links: [],
          sceneId: 'scan-a',
          createdAt: Date.now(),
        },
        {
          id: 'ann-dirty-draft',
          position: [1, 1, 1],
          title: 'Dirty draft',
          description: '',
          images: [],
          videoUrl: null,
          links: [],
          sceneId: 'scan-b',
          createdAt: Date.now(),
        },
      ],
      openAnnotationPanelIds: ['ann-clean-draft', 'ann-dirty-draft'],
      selectedAnnotationId: 'ann-clean-draft',
      draftRevisionByScene: { 'scan-a': 4, 'scan-b': 2 },
      draftEtagByScene: { 'scan-a': 'etag-a-4', 'scan-b': 'etag-b-2' },
      draftRevisionSourceByScene: { 'scan-a': 'draft', 'scan-b': 'draft' },
      draftDirtyByScene: { 'scan-a': false, 'scan-b': true },
      sceneMutationVersion: { 'scan-a': 1, 'scan-b': 1 },
    })

    vi.spyOn(publishApi, 'logout').mockResolvedValue(undefined)

    await useViewerStore.getState().logout()

    const state = useViewerStore.getState()
    expect(state.isAuthenticated).toBe(false)
    expect(state.presentationMode).toBe(true)

    // Non-dirty draft scene is wiped so the anon effect refetches the release.
    expect(state.annotations.some((a) => a.sceneId === 'scan-a')).toBe(false)
    expect(state.draftEtagByScene['scan-a']).toBeUndefined()
    expect(state.draftRevisionSourceByScene['scan-a']).toBeUndefined()
    expect(state.draftDirtyByScene['scan-a']).toBeUndefined()
    expect(state.sceneMutationVersion['scan-a']).toBe(2)
    expect(state.selectedAnnotationId).toBeNull()
    expect(state.openAnnotationPanelIds).toEqual(['ann-dirty-draft'])

    // Dirty scene keeps its unsaved local edits untouched.
    expect(state.annotations.some((a) => a.id === 'ann-dirty-draft')).toBe(true)
    expect(state.draftEtagByScene['scan-b']).toBe('etag-b-2')
    expect(state.draftRevisionSourceByScene['scan-b']).toBe('draft')
    expect(state.draftDirtyByScene['scan-b']).toBe(true)
    expect(state.sceneMutationVersion['scan-b']).toBe(1)
  })

  it('logout({ discardDirtyScenes: true }) reverts dirty draft scenes too', async () => {
    useViewerStore.setState({
      isAuthenticated: true,
      presentationMode: false,
      annotations: [
        {
          id: 'ann-dirty-discard',
          position: [1, 1, 1],
          title: 'Dirty draft',
          description: '',
          images: [],
          videoUrl: null,
          links: [],
          sceneId: 'scan-b',
          createdAt: Date.now(),
        },
      ],
      openAnnotationPanelIds: ['ann-dirty-discard'],
      selectedAnnotationId: 'ann-dirty-discard',
      draftRevisionByScene: { 'scan-b': 5 },
      draftEtagByScene: { 'scan-b': 'etag-b-5' },
      draftRevisionSourceByScene: { 'scan-b': 'draft' },
      draftDirtyByScene: { 'scan-b': true },
      sceneMutationVersion: { 'scan-b': 2 },
    })

    vi.spyOn(publishApi, 'logout').mockResolvedValue(undefined)

    await useViewerStore.getState().logout({ discardDirtyScenes: true })

    const state = useViewerStore.getState()
    expect(state.isAuthenticated).toBe(false)
    expect(state.presentationMode).toBe(true)

    // Dirty draft scene is discarded so the anon effect refetches the release.
    expect(state.annotations.some((a) => a.sceneId === 'scan-b')).toBe(false)
    expect(state.draftRevisionByScene['scan-b']).toBeUndefined()
    expect(state.draftEtagByScene['scan-b']).toBeUndefined()
    expect(state.draftRevisionSourceByScene['scan-b']).toBeUndefined()
    expect(state.draftDirtyByScene['scan-b']).toBeUndefined()
    expect(state.sceneMutationVersion['scan-b']).toBe(3)
    expect(state.selectedAnnotationId).toBeNull()
    expect(state.openAnnotationPanelIds).toEqual([])
  })

  it('logout clears auth locally even when the server call fails', async () => {
    useViewerStore.setState({ isAuthenticated: true, presentationMode: false })
    vi.spyOn(publishApi, 'logout').mockRejectedValue(new Error('network down'))

    await expect(useViewerStore.getState().logout()).resolves.toBeUndefined()

    const state = useViewerStore.getState()
    expect(state.isAuthenticated).toBe(false)
    expect(state.presentationMode).toBe(true)
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
