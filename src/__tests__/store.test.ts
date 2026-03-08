import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  resolveActiveSceneFromCatalog,
  resolveOfficialSceneSyncDiff,
  useViewerStore,
} from '@/store/viewerStore'
import * as publishApi from '@/lib/publishApi'
import * as modelApi from '@/lib/modelApi'
import { imageStorage } from '@/storage/imageStorage'
import { vercelBlobImageStorage } from '@/storage/vercelBlobImageStorage'
import { vercelBlobModelStorage } from '@/storage/vercelBlobModelStorage'
import type { SceneDraft } from '@/types'

describe('viewerStore', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.removeItem('polycam-viewer-state')

    // Reset store to initial state
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
  })

  it('initializes with preset scenes', () => {
    const state = useViewerStore.getState()
    expect(state.scenes).toHaveLength(3)
    expect(state.scenes[0].id).toBe('scan-a')
    expect(state.scenes[1].id).toBe('scan-b')
    expect(state.scenes[2].id).toBe('scan-c')
  })

  it('has correct preset scene URLs', () => {
    const state = useViewerStore.getState()
    expect(state.scenes[0].glbUrl).toBe('/models/scan-a.glb')
    expect(state.scenes[0].plyUrl).toBe('/models/scan-a.ply')
    expect(state.scenes[1].glbUrl).toBe('/models/scan-b.glb')
    expect(state.scenes[1].plyUrl).toBe('/models/scan-b.ply')
  })

  it('setViewMode updates viewMode', () => {
    const { setViewMode } = useViewerStore.getState()
    setViewMode('pointcloud')
    expect(useViewerStore.getState().viewMode).toBe('pointcloud')
  })

  it('setToolMode updates toolMode', () => {
    const { setToolMode } = useViewerStore.getState()
    setToolMode('measure')
    expect(useViewerStore.getState().toolMode).toBe('measure')
  })

  it('setToolMode toggles active tool back to orbit', () => {
    const { setToolMode } = useViewerStore.getState()
    setToolMode('measure')
    expect(useViewerStore.getState().toolMode).toBe('measure')
    setToolMode('measure')
    expect(useViewerStore.getState().toolMode).toBe('orbit')
  })

  it('setToolMode does not toggle orbit', () => {
    const { setToolMode } = useViewerStore.getState()
    setToolMode('orbit')
    expect(useViewerStore.getState().toolMode).toBe('orbit')
  })

  it('setToolMode annotate opens annotationsPanelOpen', () => {
    const { setToolMode, setAnnotationsPanelOpen } = useViewerStore.getState()
    setAnnotationsPanelOpen(false)
    expect(useViewerStore.getState().annotationsPanelOpen).toBe(false)
    setToolMode('annotate')
    expect(useViewerStore.getState().toolMode).toBe('annotate')
    expect(useViewerStore.getState().annotationsPanelOpen).toBe(true)
  })

  it('setToolMode toggles annotate off and closes panel', () => {
    const { setToolMode } = useViewerStore.getState()
    setToolMode('annotate')
    expect(useViewerStore.getState().annotationsPanelOpen).toBe(true)
    setToolMode('annotate')
    expect(useViewerStore.getState().toolMode).toBe('orbit')
    expect(useViewerStore.getState().annotationsPanelOpen).toBe(false)
  })

  it('setToolMode measure does not affect annotationsPanelOpen', () => {
    const { setToolMode } = useViewerStore.getState()
    setToolMode('annotate')
    expect(useViewerStore.getState().annotationsPanelOpen).toBe(true)
    setToolMode('measure')
    expect(useViewerStore.getState().annotationsPanelOpen).toBe(true)
  })

  it('annotationsVisible and annotationsPanelOpen are independent', () => {
    const { setToolMode, toggleAnnotationsVisible } = useViewerStore.getState()
    setToolMode('annotate')
    expect(useViewerStore.getState().annotationsPanelOpen).toBe(true)
    expect(useViewerStore.getState().annotationsVisible).toBe(true)

    toggleAnnotationsVisible()
    expect(useViewerStore.getState().annotationsVisible).toBe(false)
    expect(useViewerStore.getState().annotationsPanelOpen).toBe(true)

    toggleAnnotationsVisible()
    expect(useViewerStore.getState().annotationsVisible).toBe(true)

    setToolMode('annotate')
    expect(useViewerStore.getState().annotationsPanelOpen).toBe(false)
    expect(useViewerStore.getState().annotationsVisible).toBe(true)
  })

  it('addMeasurement adds to measurements array', () => {
    const { addMeasurement } = useViewerStore.getState()
    addMeasurement({
      id: 'test-1',
      type: 'distance',
      points: [[0, 0, 0], [3, 4, 0]],
      value: 5,
      unit: 'm',
    })
    expect(useViewerStore.getState().measurements).toHaveLength(1)
    expect(useViewerStore.getState().measurements[0].value).toBe(5)
  })

  it('removeMeasurement removes by id', () => {
    const { addMeasurement, removeMeasurement } = useViewerStore.getState()
    addMeasurement({ id: 'del-1', type: 'distance', points: [], value: 1, unit: 'm' })
    removeMeasurement('del-1')
    expect(useViewerStore.getState().measurements).toHaveLength(0)
  })

  it('addAnnotation adds to annotations array', () => {
    const { addAnnotation } = useViewerStore.getState()
    addAnnotation({ id: 'ann-1', position: [1, 2, 3], title: 'Test', description: '', images: [], videoUrl: null, links: [], sceneId: 'scan-a', createdAt: Date.now() })
    expect(useViewerStore.getState().annotations).toHaveLength(1)
    expect(useViewerStore.getState().draftDirtyByScene['scan-a']).toBe(true)
  })

  it('updateAnnotationContent marks scene draft as dirty', () => {
    const now = Date.now()
    useViewerStore.setState({
      annotations: [
        {
          id: 'ann-dirty',
          position: [0, 0, 0],
          title: 'Base',
          description: '',
          images: [],
          videoUrl: null,
          links: [],
          sceneId: 'scan-a',
          createdAt: now,
        },
      ],
      draftDirtyByScene: { 'scan-a': false },
    })

    const { updateAnnotationContent } = useViewerStore.getState()
    updateAnnotationContent('ann-dirty', {
      links: [{ url: 'https://example.com', label: 'Example' }],
    })

    expect(useViewerStore.getState().draftDirtyByScene['scan-a']).toBe(true)
  })

  it('setClipPlane updates clip plane state', () => {
    const { setClipPlane } = useViewerStore.getState()
    setClipPlane({ enabled: true, axis: 'x', position: 0.3 })
    const clip = useViewerStore.getState().clipPlane
    expect(clip.enabled).toBe(true)
    expect(clip.axis).toBe('x')
    expect(clip.position).toBe(0.3)
  })

  it('setCameraControlsEnabled updates orbit-control lock state', () => {
    const { setCameraControlsEnabled } = useViewerStore.getState()
    setCameraControlsEnabled(false)
    expect(useViewerStore.getState().cameraControlsEnabled).toBe(false)
    setCameraControlsEnabled(true)
    expect(useViewerStore.getState().cameraControlsEnabled).toBe(true)
  })

  it('addUploadedScene switches scene and clears annotation selection/open panels', () => {
    const { addUploadedScene, selectAnnotation, openAnnotationPanel } = useViewerStore.getState()
    selectAnnotation('ann-1')
    openAnnotationPanel('ann-1')

    addUploadedScene({
      id: 'scan-upload-1',
      name: 'Upload 1',
      glbUrl: '/models/upload-1.glb',
      plyUrl: '/models/upload-1.ply',
    })

    const state = useViewerStore.getState()
    expect(state.activeSceneId).toBe('scan-upload-1')
    expect(state.selectedAnnotationId).toBeNull()
    expect(state.openAnnotationPanelIds).toEqual([])
  })

  it('loadCloudScenes hydrates cloud model list and keeps active scene', async () => {
    vi.spyOn(modelApi, 'getModels').mockResolvedValue([
      {
        id: 'cloud-1',
        name: 'Cloud One',
        glbUrl: 'https://fudojb4sssxlkcld.public.blob.vercel-storage.com/models/cloud-1.glb',
        plyUrl: 'https://fudojb4sssxlkcld.public.blob.vercel-storage.com/models/cloud-1.ply',
        catalogSource: 'published',
      },
      {
        id: 'cloud-2',
        name: 'Cloud Two',
        glbUrl: 'https://fudojb4sssxlkcld.public.blob.vercel-storage.com/models/cloud-2.glb',
        plyUrl: 'https://fudojb4sssxlkcld.public.blob.vercel-storage.com/models/cloud-2.ply',
        catalogSource: 'published',
      },
    ])

    const { loadCloudScenes } = useViewerStore.getState()
    await loadCloudScenes()

    const state = useViewerStore.getState()
    expect(state.publishedScenes).toHaveLength(2)
    expect(state.activeSceneId).toBe('scan-a')
  })

  it('loadCloudScenes sets active scene when no scene is selected', async () => {
    useViewerStore.setState({ activeSceneId: null })

    vi.spyOn(modelApi, 'getModels').mockResolvedValue([
      {
        id: 'cloud-first',
        name: 'Cloud First',
        glbUrl: 'https://fudojb4sssxlkcld.public.blob.vercel-storage.com/models/cloud-first.glb',
        plyUrl: 'https://fudojb4sssxlkcld.public.blob.vercel-storage.com/models/cloud-first.ply',
        catalogSource: 'published',
      },
    ])

    const { loadCloudScenes } = useViewerStore.getState()
    await loadCloudScenes()

    const state = useViewerStore.getState()
    expect(state.publishedScenes.map((scene) => scene.id)).toEqual(['cloud-first'])
    expect(state.activeSceneId).toBe('cloud-first')
  })

  it('loadCloudScenes keeps previous cloud list when request fails', async () => {
    useViewerStore.setState({
      publishedScenes: [
        {
          id: 'cloud-existing',
          name: 'Cloud Existing',
          glbUrl: 'https://fudojb4sssxlkcld.public.blob.vercel-storage.com/models/cloud-existing.glb',
          plyUrl: 'https://fudojb4sssxlkcld.public.blob.vercel-storage.com/models/cloud-existing.ply',
          catalogSource: 'published',
        },
      ],
    })

    vi.spyOn(modelApi, 'getModels').mockRejectedValue(new Error('network down'))

    const { loadCloudScenes } = useViewerStore.getState()
    await loadCloudScenes()

    const state = useViewerStore.getState()
    expect(state.publishedScenes.map((scene) => scene.id)).toEqual(['cloud-existing'])
  })

  it('addPublishedScene prepends and activates uploaded cloud model', () => {
    useViewerStore.setState({
      publishedScenes: [
        {
          id: 'cloud-old',
          name: 'Cloud Old',
          glbUrl: 'https://fudojb4sssxlkcld.public.blob.vercel-storage.com/models/cloud-old.glb',
          plyUrl: 'https://fudojb4sssxlkcld.public.blob.vercel-storage.com/models/cloud-old.ply',
          catalogSource: 'published',
        },
      ],
    })

    const { addPublishedScene } = useViewerStore.getState()
    addPublishedScene({
      id: 'cloud-new',
      name: 'Cloud New',
        glbUrl: 'https://fudojb4sssxlkcld.public.blob.vercel-storage.com/models/cloud-new.glb',
        plyUrl: 'https://fudojb4sssxlkcld.public.blob.vercel-storage.com/models/cloud-new.ply',
      catalogSource: 'published',
    })

    const state = useViewerStore.getState()
    expect(state.publishedScenes.map((scene) => scene.id)).toEqual(['cloud-new', 'cloud-old'])
    expect(state.activeSceneId).toBe('cloud-new')
  })

  it('syncPresetScenesToCloud uploads all preset pairs and merges by preset ids', async () => {
    useViewerStore.setState({ isAuthenticated: true })
    vi.spyOn(publishApi, 'getSession').mockResolvedValue({ authenticated: true })

    const uploadSpy = vi
      .spyOn(vercelBlobModelStorage, 'uploadFromUrl')
      .mockImplementation(
        async (url, params) =>
          `https://fudojb4sssxlkcld.public.blob.vercel-storage.com/models/${params.sceneKey}/${params.kind}-${url.split('/').pop()}`
      )

    const syncModelsSpy = vi.spyOn(modelApi, 'syncModels').mockResolvedValue([
      {
        id: 'scan-a',
        name: 'Scan A (Corridor)',
        glbUrl: 'https://fudojb4sssxlkcld.public.blob.vercel-storage.com/models/scan-a/glb-scan-a.glb',
        plyUrl: 'https://fudojb4sssxlkcld.public.blob.vercel-storage.com/models/scan-a/ply-scan-a.ply',
        catalogSource: 'published',
      },
      {
        id: 'scan-b',
        name: 'Scan B (Large Room)',
        glbUrl: 'https://fudojb4sssxlkcld.public.blob.vercel-storage.com/models/scan-b/glb-scan-b.glb',
        plyUrl: 'https://fudojb4sssxlkcld.public.blob.vercel-storage.com/models/scan-b/ply-scan-b.ply',
        catalogSource: 'published',
      },
      {
        id: 'scan-c',
        name: 'Scan C (Multi-Room)',
        glbUrl: 'https://fudojb4sssxlkcld.public.blob.vercel-storage.com/models/scan-c/glb-scan-c.glb',
        plyUrl: 'https://fudojb4sssxlkcld.public.blob.vercel-storage.com/models/scan-c/ply-scan-c.ply',
        catalogSource: 'published',
      },
    ])

    const { syncPresetScenesToCloud } = useViewerStore.getState()
    const synced = await syncPresetScenesToCloud()

    expect(uploadSpy).toHaveBeenCalledTimes(6)
    expect(syncModelsSpy).toHaveBeenCalledTimes(1)
    expect(syncModelsSpy).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'scan-a' }),
      expect.objectContaining({ id: 'scan-b' }),
      expect.objectContaining({ id: 'scan-c' }),
    ])
    expect(synced).toHaveLength(3)
    expect(useViewerStore.getState().publishedScenes.map((scene) => scene.id)).toEqual([
      'scan-a',
      'scan-b',
      'scan-c',
    ])
  })

  it('syncPresetScenesToCloud reuses already-cloud preset assets and uploads only missing presets', async () => {
    useViewerStore.setState({
      isAuthenticated: true,
      publishedScenes: [
        {
          id: 'scan-a',
          name: 'Scan A (Corridor)',
          glbUrl: 'https://fudojb4sssxlkcld.public.blob.vercel-storage.com/scenes/scan-a/models/glb-existing.glb',
          plyUrl: 'https://fudojb4sssxlkcld.public.blob.vercel-storage.com/scenes/scan-a/models/ply-existing.ply',
          catalogSource: 'published',
        },
      ],
    })
    vi.spyOn(publishApi, 'getSession').mockResolvedValue({ authenticated: true })

    const uploadSpy = vi
      .spyOn(vercelBlobModelStorage, 'uploadFromUrl')
      .mockImplementation(
        async (url, params) =>
          `https://fudojb4sssxlkcld.public.blob.vercel-storage.com/scenes/${params.sceneKey}/models/${params.kind}-${url.split('/').pop()}`
      )

    const syncModelsSpy = vi.spyOn(modelApi, 'syncModels').mockResolvedValue([
      {
        id: 'scan-a',
        name: 'Scan A (Corridor)',
        glbUrl: 'https://fudojb4sssxlkcld.public.blob.vercel-storage.com/scenes/scan-a/models/glb-existing.glb',
        plyUrl: 'https://fudojb4sssxlkcld.public.blob.vercel-storage.com/scenes/scan-a/models/ply-existing.ply',
        catalogSource: 'published',
      },
      {
        id: 'scan-b',
        name: 'Scan B (Large Room)',
        glbUrl: 'https://fudojb4sssxlkcld.public.blob.vercel-storage.com/scenes/scan-b/models/glb-scan-b.glb',
        plyUrl: 'https://fudojb4sssxlkcld.public.blob.vercel-storage.com/scenes/scan-b/models/ply-scan-b.ply',
        catalogSource: 'published',
      },
      {
        id: 'scan-c',
        name: 'Scan C (Multi-Room)',
        glbUrl: 'https://fudojb4sssxlkcld.public.blob.vercel-storage.com/scenes/scan-c/models/glb-scan-c.glb',
        plyUrl: 'https://fudojb4sssxlkcld.public.blob.vercel-storage.com/scenes/scan-c/models/ply-scan-c.ply',
        catalogSource: 'published',
      },
    ])

    const { syncPresetScenesToCloud } = useViewerStore.getState()
    await syncPresetScenesToCloud()

    expect(uploadSpy).toHaveBeenCalledTimes(4)
    expect(syncModelsSpy).toHaveBeenCalledWith([
      {
        id: 'scan-a',
        name: 'Scan A (Corridor)',
        glbUrl: 'https://fudojb4sssxlkcld.public.blob.vercel-storage.com/scenes/scan-a/models/glb-existing.glb',
        plyUrl: 'https://fudojb4sssxlkcld.public.blob.vercel-storage.com/scenes/scan-a/models/ply-existing.ply',
      },
      expect.objectContaining({ id: 'scan-b' }),
      expect.objectContaining({ id: 'scan-c' }),
    ])
  })

  it('syncPresetScenesToCloud requires login', async () => {
    useViewerStore.setState({ isAuthenticated: false })
    vi.spyOn(publishApi, 'getSession').mockResolvedValue({ authenticated: false })
    const { syncPresetScenesToCloud } = useViewerStore.getState()
    await expect(syncPresetScenesToCloud()).rejects.toThrow('Login required to sync official scenes.')
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
      .mockResolvedValueOnce({
        sceneId: 'scan-a',
        revision: 8,
        annotations: [],
        updatedAt: Date.now(),
      })
      .mockResolvedValueOnce({
        sceneId: 'scan-a',
        revision: 9,
        annotations: [],
        updatedAt: Date.now(),
      })
      .mockResolvedValueOnce({
        sceneId: 'scan-a',
        revision: 10,
        annotations: [],
        updatedAt: Date.now(),
      })

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

  it('loadDiscoveredScenes excludes preset scene IDs from discovered results', async () => {
    vi.spyOn(modelApi, 'discoverLocalScenes').mockResolvedValue({
      scenes: [
        { id: 'scan-a', name: 'Scan A', glbUrl: '/models/scan-a.glb', plyUrl: '/models/scan-a.ply' },
        { id: 'scan-b', name: 'Scan B', glbUrl: '/models/scan-b.glb', plyUrl: '/models/scan-b.ply' },
        { id: 'scan-c', name: 'Scan C', glbUrl: '/models/scan-c.glb', plyUrl: '/models/scan-c.ply' },
        { id: 'scan-d', name: 'Scan D', glbUrl: '/models/scan-d.glb', plyUrl: '/models/scan-d.ply' },
      ],
      errors: [],
    })

    const { loadDiscoveredScenes } = useViewerStore.getState()
    await loadDiscoveredScenes()

    const state = useViewerStore.getState()
    expect(state.discoveredScenes).toHaveLength(1)
    expect(state.discoveredScenes[0].id).toBe('scan-d')
    expect(state.discoveredScenes[0].catalogSource).toBe('discovered')
    expect(state.discoveredScenes[0].officialStatus?.syncStatus).toBe('unsynced')
    expect(state.discoveredScenes[0].officialStatus?.pairCompleteness).toBe('complete')

    expect(state.scenes.map((s) => s.id)).toEqual(['scan-a', 'scan-b', 'scan-c'])
    expect(state.scenes[0].catalogSource).toBe('bootstrap')
  })

  it('loadDiscoveredScenes surfaces new scene with correct discovered status', async () => {
    vi.spyOn(modelApi, 'discoverLocalScenes').mockResolvedValue({
      scenes: [
        { id: 'new-room', name: 'New Room', glbUrl: '/models/new-room.glb', plyUrl: '/models/new-room.ply' },
      ],
      errors: [],
    })

    const { loadDiscoveredScenes } = useViewerStore.getState()
    await loadDiscoveredScenes()

    const state = useViewerStore.getState()
    expect(state.discoveredScenes).toHaveLength(1)
    const scene = state.discoveredScenes[0]
    expect(scene.id).toBe('new-room')
    expect(scene.name).toBe('New Room')
    expect(scene.glbUrl).toBe('/models/new-room.glb')
    expect(scene.plyUrl).toBe('/models/new-room.ply')
    expect(scene.catalogSource).toBe('discovered')
    expect(scene.officialStatus).toEqual({
      sceneId: 'new-room',
      catalogSource: 'discovered',
      pairCompleteness: 'complete',
      syncStatus: 'unsynced',
    })
  })

  it('loadDiscoveredScenes returns empty when only preset scenes exist locally', async () => {
    vi.spyOn(modelApi, 'discoverLocalScenes').mockResolvedValue({
      scenes: [
        { id: 'scan-a', name: 'Scan A', glbUrl: '/models/scan-a.glb', plyUrl: '/models/scan-a.ply' },
        { id: 'scan-b', name: 'Scan B', glbUrl: '/models/scan-b.glb', plyUrl: '/models/scan-b.ply' },
        { id: 'scan-c', name: 'Scan C', glbUrl: '/models/scan-c.glb', plyUrl: '/models/scan-c.ply' },
      ],
      errors: [],
    })

    const { loadDiscoveredScenes } = useViewerStore.getState()
    await loadDiscoveredScenes()

    const state = useViewerStore.getState()
    expect(state.discoveredScenes).toHaveLength(0)
  })

  it('loadDiscoveredScenes sets activeSceneId to first discovered when none selected', async () => {
    useViewerStore.setState({ activeSceneId: null })

    vi.spyOn(modelApi, 'discoverLocalScenes').mockResolvedValue({
      scenes: [
        { id: 'scan-d', name: 'Scan D', glbUrl: '/models/scan-d.glb', plyUrl: '/models/scan-d.ply' },
      ],
      errors: [],
    })

    const { loadDiscoveredScenes } = useViewerStore.getState()
    await loadDiscoveredScenes()

    expect(useViewerStore.getState().activeSceneId).toBe('scan-d')
  })

  it('loadDiscoveredScenes keeps existing activeSceneId when one is set', async () => {
    vi.spyOn(modelApi, 'discoverLocalScenes').mockResolvedValue({
      scenes: [
        { id: 'scan-d', name: 'Scan D', glbUrl: '/models/scan-d.glb', plyUrl: '/models/scan-d.ply' },
      ],
      errors: [],
    })

    const { loadDiscoveredScenes } = useViewerStore.getState()
    await loadDiscoveredScenes()

    expect(useViewerStore.getState().activeSceneId).toBe('scan-a')
  })

  it('loadDiscoveredScenes keeps previous list when request fails', async () => {
    useViewerStore.setState({
      discoveredScenes: [
        {
          id: 'scan-existing',
          name: 'Existing Discovered',
          glbUrl: '/models/scan-existing.glb',
          plyUrl: '/models/scan-existing.ply',
          catalogSource: 'discovered',
        },
      ],
    })

    vi.spyOn(modelApi, 'discoverLocalScenes').mockRejectedValue(new Error('network down'))

    const { loadDiscoveredScenes } = useViewerStore.getState()
    await loadDiscoveredScenes()

    expect(useViewerStore.getState().discoveredScenes.map((s) => s.id)).toEqual(['scan-existing'])
  })

  it('loadDiscoveredScenes does not call API when import.meta.env.DEV is false', async () => {
    const originalDev = import.meta.env.DEV
    try {
      import.meta.env.DEV = false as unknown as boolean

      const spy = vi.spyOn(modelApi, 'discoverLocalScenes')

      const { loadDiscoveredScenes } = useViewerStore.getState()
      await loadDiscoveredScenes()

      expect(spy).not.toHaveBeenCalled()
      expect(useViewerStore.getState().discoveredScenes).toEqual([])
    } finally {
      import.meta.env.DEV = originalDev
    }
  })

  it('loadDiscoveredScenes keeps discovered scene when same sceneId exists in cloud and marks it synced', async () => {
    useViewerStore.setState({
      publishedScenes: [
        {
          id: 'published-collision',
          name: 'Published Scene',
          glbUrl: 'https://example.com/published.glb',
          plyUrl: 'https://example.com/published.ply',
          catalogSource: 'published',
        },
      ],
    })

    vi.spyOn(modelApi, 'discoverLocalScenes').mockResolvedValueOnce({
      scenes: [
        {
          id: 'published-collision',
          name: 'Local Scene Variant',
          glbUrl: '/models/published-collision.glb',
          plyUrl: '/models/published-collision.ply',
        },
        {
          id: 'new-discovered',
          name: 'New Discovered',
          glbUrl: '/models/new-discovered.glb',
          plyUrl: '/models/new-discovered.ply',
        },
      ],
      errors: [],
    })

    const { loadDiscoveredScenes } = useViewerStore.getState()
    await loadDiscoveredScenes()

    const state = useViewerStore.getState()
    expect(state.discoveredScenes).toHaveLength(2)
    expect(state.discoveredScenes.map((scene) => scene.id)).toEqual([
      'published-collision',
      'new-discovered',
    ])
    expect(state.discoveredScenes[0].officialStatus?.syncStatus).toBe('synced')
    expect(state.discoveredScenes[1].officialStatus?.syncStatus).toBe('unsynced')
  })

  it('loadDiscoveredScenes refresh fully replaces discovered catalog from filesystem truth', async () => {
    vi.spyOn(modelApi, 'discoverLocalScenes')
      .mockResolvedValueOnce({
        scenes: [
          {
            id: 'refresh-alpha',
            name: 'Refresh Alpha',
            glbUrl: '/models/refresh-alpha.glb',
            plyUrl: '/models/refresh-alpha.ply',
          },
          {
            id: 'refresh-beta',
            name: 'Refresh Beta',
            glbUrl: '/models/refresh-beta.glb',
            plyUrl: '/models/refresh-beta.ply',
          },
        ],
        errors: [],
      })
      .mockResolvedValueOnce({
        scenes: [
          {
            id: 'refresh-beta',
            name: 'Refresh Beta',
            glbUrl: '/models/refresh-beta.glb',
            plyUrl: '/models/refresh-beta.ply',
          },
          {
            id: 'refresh-gamma',
            name: 'Refresh Gamma',
            glbUrl: '/models/refresh-gamma.glb',
            plyUrl: '/models/refresh-gamma.ply',
          },
        ],
        errors: [],
      })

    const { loadDiscoveredScenes } = useViewerStore.getState()
    await loadDiscoveredScenes()
    expect(useViewerStore.getState().discoveredScenes.map((scene) => scene.id)).toEqual([
      'refresh-alpha',
      'refresh-beta',
    ])

    await loadDiscoveredScenes()

    const state = useViewerStore.getState()
    expect(state.discoveredScenes.map((scene) => scene.id)).toEqual(['refresh-beta', 'refresh-gamma'])
    expect(resolveOfficialSceneSyncDiff(state)).toEqual([
      {
        sceneId: 'refresh-beta',
        discovered: true,
        published: false,
        syncStatus: 'unsynced',
      },
      {
        sceneId: 'refresh-gamma',
        discovered: true,
        published: false,
        syncStatus: 'unsynced',
      },
    ])
  })

  it('loadDiscoveredScenes dedupes duplicate scene IDs from discovery payload', async () => {
    vi.spyOn(modelApi, 'discoverLocalScenes').mockResolvedValue({
      scenes: [
        {
          id: 'dup-scene',
          name: 'Duplicate Scene First',
          glbUrl: '/models/dup-scene-a.glb',
          plyUrl: '/models/dup-scene-a.ply',
        },
        {
          id: 'dup-scene',
          name: 'Duplicate Scene Second',
          glbUrl: '/models/dup-scene-b.glb',
          plyUrl: '/models/dup-scene-b.ply',
        },
        {
          id: 'unique-scene',
          name: 'Unique Scene',
          glbUrl: '/models/unique-scene.glb',
          plyUrl: '/models/unique-scene.ply',
        },
      ],
      errors: [],
    })

    const { loadDiscoveredScenes } = useViewerStore.getState()
    await loadDiscoveredScenes()

    const state = useViewerStore.getState()
    expect(state.discoveredScenes.map((scene) => scene.id)).toEqual(['dup-scene', 'unique-scene'])
    expect(state.discoveredScenes[0].name).toBe('Duplicate Scene First')
  })

  it('loadDiscoveredScenes recovers interrupted syncing state as retryable error', async () => {
    useViewerStore.setState({
      discoveredScenes: [
        {
          id: 'interrupted-scene',
          name: 'Interrupted Scene',
          glbUrl: '/models/interrupted-scene.glb',
          plyUrl: '/models/interrupted-scene.ply',
          catalogSource: 'discovered',
        },
      ],
      officialSceneSyncOverridesByScene: {
        'interrupted-scene': 'syncing',
      },
    })

    vi.spyOn(modelApi, 'discoverLocalScenes').mockResolvedValue({
      scenes: [
        {
          id: 'interrupted-scene',
          name: 'Interrupted Scene',
          glbUrl: '/models/interrupted-scene.glb',
          plyUrl: '/models/interrupted-scene.ply',
        },
      ],
      errors: [],
    })

    const { loadDiscoveredScenes } = useViewerStore.getState()
    await loadDiscoveredScenes()

    const state = useViewerStore.getState()
    expect(state.officialSceneSyncOverridesByScene['interrupted-scene']).toBe('error')
    expect(state.discoveredScenes[0].officialStatus?.syncStatus).toBe('error')
  })

  it('persists discovered scenes and sync retry overrides for reload recovery', () => {
    useViewerStore.setState({
      discoveredScenes: [
        {
          id: 'persisted-scene',
          name: 'Persisted Scene',
          glbUrl: '/models/persisted-scene.glb',
          plyUrl: '/models/persisted-scene.ply',
          catalogSource: 'discovered',
          officialStatus: {
            sceneId: 'persisted-scene',
            catalogSource: 'discovered',
            pairCompleteness: 'complete',
            syncStatus: 'error',
          },
        },
      ],
      officialSceneSyncOverridesByScene: {
        'persisted-scene': 'error',
      },
    })

    const raw = localStorage.getItem('polycam-viewer-state')
    expect(raw).toBeTruthy()

    const persisted = JSON.parse(raw as string) as {
      state?: {
        discoveredScenes?: Array<{ id: string; officialStatus?: { syncStatus?: string } }>
        officialSceneSyncOverridesByScene?: Record<string, string>
      }
    }

    expect(persisted.state?.discoveredScenes?.map((scene) => scene.id)).toEqual(['persisted-scene'])
    expect(persisted.state?.discoveredScenes?.[0]?.officialStatus?.syncStatus).toBe('error')
    expect(persisted.state?.officialSceneSyncOverridesByScene?.['persisted-scene']).toBe('error')
  })

  it('setOfficialSceneSyncStatus supports syncing, error, and retry back to derived unsynced', () => {
    const {
      addDiscoveredScene,
      setOfficialSceneSyncStatus,
      clearOfficialSceneSyncStatus,
    } = useViewerStore.getState()

    addDiscoveredScene({
      id: 'sync-state-scene',
      name: 'Sync State Scene',
      glbUrl: '/models/sync-state-scene.glb',
      plyUrl: '/models/sync-state-scene.ply',
    })

    expect(useViewerStore.getState().discoveredScenes[0].officialStatus?.syncStatus).toBe('unsynced')

    setOfficialSceneSyncStatus('sync-state-scene', 'syncing')
    expect(useViewerStore.getState().discoveredScenes[0].officialStatus?.syncStatus).toBe('syncing')

    setOfficialSceneSyncStatus('sync-state-scene', 'error')
    expect(useViewerStore.getState().discoveredScenes[0].officialStatus?.syncStatus).toBe('error')

    clearOfficialSceneSyncStatus('sync-state-scene')
    expect(useViewerStore.getState().discoveredScenes[0].officialStatus?.syncStatus).toBe('unsynced')
  })

  it('markOfficialSceneSyncSuccess transitions discovered scene to synced via cloud diff', () => {
    const {
      addDiscoveredScene,
      setOfficialSceneSyncStatus,
      markOfficialSceneSyncSuccess,
    } = useViewerStore.getState()

    addDiscoveredScene({
      id: 'sync-success-scene',
      name: 'Sync Success Scene',
      glbUrl: '/models/sync-success-scene.glb',
      plyUrl: '/models/sync-success-scene.ply',
    })

    setOfficialSceneSyncStatus('sync-success-scene', 'syncing')
    expect(useViewerStore.getState().discoveredScenes[0].officialStatus?.syncStatus).toBe('syncing')

    markOfficialSceneSyncSuccess({
      id: 'sync-success-scene',
      name: 'Sync Success Scene',
      glbUrl: 'https://fudojb4sssxlkcld.public.blob.vercel-storage.com/models/sync-success-scene.glb',
      plyUrl: 'https://fudojb4sssxlkcld.public.blob.vercel-storage.com/models/sync-success-scene.ply',
    })

    const state = useViewerStore.getState()
    expect(state.publishedScenes.some((scene) => scene.id === 'sync-success-scene')).toBe(true)
    expect(state.discoveredScenes[0].officialStatus?.syncStatus).toBe('synced')
  })

  it('loadDiscoveredScenes keeps local discovered scene selectable after sync success refresh', async () => {
    useViewerStore.setState({
      activeSceneId: 'stable-refresh-scene',
      publishedScenes: [
        {
          id: 'stable-refresh-scene',
          name: 'Cloud Stable Refresh Scene',
          glbUrl: 'https://fudojb4sssxlkcld.public.blob.vercel-storage.com/models/stable-refresh-scene.glb',
          plyUrl: 'https://fudojb4sssxlkcld.public.blob.vercel-storage.com/models/stable-refresh-scene.ply',
          catalogSource: 'published',
        },
      ],
    })

    vi.spyOn(modelApi, 'discoverLocalScenes').mockResolvedValueOnce({
      scenes: [
        {
          id: 'stable-refresh-scene',
          name: 'Local Stable Refresh Scene',
          glbUrl: '/models/stable-refresh-scene.glb',
          plyUrl: '/models/stable-refresh-scene.ply',
        },
      ],
      errors: [],
    })

    const { loadDiscoveredScenes } = useViewerStore.getState()
    await loadDiscoveredScenes()

    const state = useViewerStore.getState()
    expect(state.discoveredScenes.map((scene) => scene.id)).toEqual(['stable-refresh-scene'])
    expect(state.discoveredScenes[0].officialStatus?.syncStatus).toBe('synced')
    const activeScene = resolveActiveSceneFromCatalog(state)
    expect(activeScene?.id).toBe('stable-refresh-scene')
    expect(activeScene?.catalogSource).toBe('discovered')
  })

  it('keeps stable sceneId across discovered sync, cloud reload, and local refresh', async () => {
    useViewerStore.setState({
      activeSceneId: 'stable-lifecycle',
      isAuthenticated: true,
    })
    vi.spyOn(publishApi, 'getSession').mockResolvedValue({ authenticated: true })

    const uploadSpy = vi
      .spyOn(vercelBlobModelStorage, 'uploadFromUrl')
      .mockResolvedValueOnce('https://blob.test/stable-lifecycle.glb')
      .mockResolvedValueOnce('https://blob.test/stable-lifecycle.ply')

    vi.spyOn(modelApi, 'registerOfficialScene').mockResolvedValue({
      id: 'stable-lifecycle',
      name: 'Stable Lifecycle',
      glbUrl: 'https://blob.test/stable-lifecycle.glb',
      plyUrl: 'https://blob.test/stable-lifecycle.ply',
      catalogSource: 'published',
    })

    vi.spyOn(modelApi, 'getModels').mockResolvedValue([
      {
        id: 'stable-lifecycle',
        name: 'Stable Lifecycle Cloud',
        glbUrl: 'https://blob.test/stable-lifecycle.glb',
        plyUrl: 'https://blob.test/stable-lifecycle.ply',
        catalogSource: 'published',
      },
    ])

    vi.spyOn(modelApi, 'discoverLocalScenes').mockResolvedValue({
      scenes: [
        {
          id: 'stable-lifecycle',
          name: 'Stable Lifecycle Local',
          glbUrl: '/models/stable-lifecycle.glb',
          plyUrl: '/models/stable-lifecycle.ply',
        },
      ],
      errors: [],
    })

    const { addDiscoveredScene, syncDiscoveredScene, loadCloudScenes, loadDiscoveredScenes } = useViewerStore.getState()
    addDiscoveredScene({
      id: 'stable-lifecycle',
      name: 'Stable Lifecycle Local',
      glbUrl: '/models/stable-lifecycle.glb',
      plyUrl: '/models/stable-lifecycle.ply',
    })

    await syncDiscoveredScene('stable-lifecycle')
    await loadCloudScenes()
    await loadDiscoveredScenes()

    const state = useViewerStore.getState()
    expect(uploadSpy).toHaveBeenCalledTimes(2)
    expect(state.activeSceneId).toBe('stable-lifecycle')
    expect(state.discoveredScenes.some((scene) => scene.id === 'stable-lifecycle')).toBe(true)
    expect(state.publishedScenes.some((scene) => scene.id === 'stable-lifecycle')).toBe(true)
    expect(state.discoveredScenes[0].officialStatus?.sceneId).toBe('stable-lifecycle')
    expect(state.discoveredScenes[0].officialStatus?.syncStatus).toBe('synced')
    const activeScene = resolveActiveSceneFromCatalog(state)
    expect(activeScene?.id).toBe('stable-lifecycle')
    expect(activeScene?.catalogSource).toBe('discovered')
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

  describe('discovered scenes validation', () => {
    it('accepts valid GLB+PLY pair as one complete official scene', () => {
      const { addDiscoveredScene } = useViewerStore.getState()
      addDiscoveredScene({
        id: 'test-scene',
        name: 'Test Scene',
        glbUrl: '/models/test-scene.glb',
        plyUrl: '/models/test-scene.ply',
      })

      const state = useViewerStore.getState()
      expect(state.discoveredScenes).toHaveLength(1)
      expect(state.discoveredScenes[0].id).toBe('test-scene')
      expect(state.discoveredScenes[0].officialStatus?.pairCompleteness).toBe('complete')
      expect(state.discoveredScenes[0].officialStatus?.syncStatus).toBe('unsynced')
      expect(state.discoveredScenes[0].officialStatus?.catalogSource).toBe('discovered')
    })

    it('rejects incomplete pair with missing GLB', () => {
      const { addDiscoveredScene } = useViewerStore.getState()
      const incompleteScene = {
        id: 'orphan-ply',
        name: 'Orphan PLY',
        glbUrl: '',
        plyUrl: '/models/orphan-ply.ply',
      }

      addDiscoveredScene(incompleteScene)

      const state = useViewerStore.getState()
      expect(state.discoveredScenes).toHaveLength(0)
    })

    it('rejects incomplete pair with missing PLY', () => {
      const { addDiscoveredScene } = useViewerStore.getState()
      const incompleteScene = {
        id: 'orphan-glb',
        name: 'Orphan GLB',
        glbUrl: '/models/orphan-glb.glb',
        plyUrl: '',
      }

      addDiscoveredScene(incompleteScene)

      const state = useViewerStore.getState()
      expect(state.discoveredScenes).toHaveLength(0)
    })

    it('filters out preset scene IDs from discovered results', async () => {
      const { loadDiscoveredScenes } = useViewerStore.getState()

      vi.spyOn(modelApi, 'discoverLocalScenes').mockResolvedValueOnce({
        scenes: [
          {
            id: 'scan-a',
            name: 'Scan A',
            glbUrl: '/models/scan-a.glb',
            plyUrl: '/models/scan-a.ply',
          },
          {
            id: 'new-scene',
            name: 'New Scene',
            glbUrl: '/models/new-scene.glb',
            plyUrl: '/models/new-scene.ply',
          },
        ],
        errors: [],
      })

      await loadDiscoveredScenes()

      const state = useViewerStore.getState()
      expect(state.discoveredScenes).toHaveLength(1)
      expect(state.discoveredScenes[0].id).toBe('new-scene')
    })

    it('handles discovery endpoint returning validation errors', async () => {
      const { loadDiscoveredScenes } = useViewerStore.getState()

      vi.spyOn(modelApi, 'discoverLocalScenes').mockResolvedValueOnce({
        scenes: [
          {
            id: 'valid-pair',
            name: 'Valid Pair',
            glbUrl: '/models/valid-pair.glb',
            plyUrl: '/models/valid-pair.ply',
          },
        ],
        errors: [
          {
            code: 'orphan-glb',
            basename: 'orphan-file',
            message: 'Orphan GLB file: "orphan-file.glb" has no matching PLY file',
          },
          {
            code: 'orphan-ply',
            basename: 'another-orphan',
            message: 'Orphan PLY file: "another-orphan.ply" has no matching GLB file',
          },
        ],
      })

      await loadDiscoveredScenes()

      const state = useViewerStore.getState()
      expect(state.discoveredScenes).toHaveLength(1)
      expect(state.discoveredScenes[0].id).toBe('valid-pair')
    })

    it('maintains stable sceneId across discovery and store operations', () => {
      const { addDiscoveredScene, setActiveScene } = useViewerStore.getState()
      const sceneId = 'stable-test-scene'

      addDiscoveredScene({
        id: sceneId,
        name: 'Stable Test Scene',
        glbUrl: '/models/stable-test-scene.glb',
        plyUrl: '/models/stable-test-scene.ply',
      })

      setActiveScene(sceneId)

      const state = useViewerStore.getState()
      expect(state.activeSceneId).toBe(sceneId)
      expect(state.discoveredScenes[0].id).toBe(sceneId)
      expect(state.discoveredScenes[0].officialStatus?.sceneId).toBe(sceneId)
    })

    it('preserves existing discovered scenes when adding new ones', () => {
      const { addDiscoveredScene } = useViewerStore.getState()

      addDiscoveredScene({
        id: 'first-scene',
        name: 'First Scene',
        glbUrl: '/models/first-scene.glb',
        plyUrl: '/models/first-scene.ply',
      })

      addDiscoveredScene({
        id: 'second-scene',
        name: 'Second Scene',
        glbUrl: '/models/second-scene.glb',
        plyUrl: '/models/second-scene.ply',
      })

      const state = useViewerStore.getState()
      expect(state.discoveredScenes).toHaveLength(2)
      expect(state.discoveredScenes.map((s) => s.id)).toEqual(['first-scene', 'second-scene'])
    })

    it('marks discovered scenes as unsynced by default', () => {
      const { addDiscoveredScene } = useViewerStore.getState()

      addDiscoveredScene({
        id: 'unsynced-test',
        name: 'Unsynced Test',
        glbUrl: '/models/unsynced-test.glb',
        plyUrl: '/models/unsynced-test.ply',
      })

      const state = useViewerStore.getState()
      const scene = state.discoveredScenes[0]
      expect(scene.officialStatus?.syncStatus).toBe('unsynced')
      expect(scene.officialStatus?.catalogSource).toBe('discovered')
    })

    // Stable sceneId and collision handling tests
    it('preserves stable sceneId through lifecycle', () => {
      const { addDiscoveredScene } = useViewerStore.getState()
      const sceneId = 'stable-id-test'

      addDiscoveredScene({
        id: sceneId,
        name: 'Stable ID Test',
        glbUrl: '/models/stable-id-test.glb',
        plyUrl: '/models/stable-id-test.ply',
      })

      const state = useViewerStore.getState()
      const scene = state.discoveredScenes[0]
      expect(scene.id).toBe(sceneId)
      expect(scene.officialStatus?.sceneId).toBe(sceneId)
    })

    it('rejects collision with preset scene ID', () => {
      const { addDiscoveredScene } = useViewerStore.getState()

      addDiscoveredScene({
        id: 'scan-a',
        name: 'Collision with Preset',
        glbUrl: '/models/scan-a-new.glb',
        plyUrl: '/models/scan-a-new.ply',
      })

      const state = useViewerStore.getState()
      expect(state.discoveredScenes).toHaveLength(0)
    })

    it('rejects collision with existing discovered scene ID', () => {
      const { addDiscoveredScene } = useViewerStore.getState()

      addDiscoveredScene({
        id: 'collision-test',
        name: 'First Scene',
        glbUrl: '/models/collision-test-1.glb',
        plyUrl: '/models/collision-test-1.ply',
      })

      addDiscoveredScene({
        id: 'collision-test',
        name: 'Second Scene (Collision)',
        glbUrl: '/models/collision-test-2.glb',
        plyUrl: '/models/collision-test-2.ply',
      })

      const state = useViewerStore.getState()
      expect(state.discoveredScenes).toHaveLength(1)
      expect(state.discoveredScenes[0].name).toBe('First Scene')
    })

    it('allows local discovered sceneId to coexist with published sceneId', () => {
      const { addDiscoveredScene, addPublishedScene } = useViewerStore.getState()

      addPublishedScene({
        id: 'published-collision',
        name: 'Published Scene',
        glbUrl: 'https://example.com/published.glb',
        plyUrl: 'https://example.com/published.ply',
      })

      addDiscoveredScene({
        id: 'published-collision',
        name: 'Discovered Collision',
        glbUrl: '/models/published-collision.glb',
        plyUrl: '/models/published-collision.ply',
      })

      const state = useViewerStore.getState()
      expect(state.discoveredScenes).toHaveLength(1)
      expect(state.discoveredScenes[0].officialStatus?.syncStatus).toBe('synced')
      expect(state.publishedScenes).toHaveLength(1)
    })

    it('collision does not mutate state', () => {
      const { addDiscoveredScene } = useViewerStore.getState()

      addDiscoveredScene({
        id: 'immutable-test',
        name: 'First Scene',
        glbUrl: '/models/immutable-test-1.glb',
        plyUrl: '/models/immutable-test-1.ply',
      })

      const stateBefore = useViewerStore.getState()
      const discoveredBefore = [...stateBefore.discoveredScenes]

      addDiscoveredScene({
        id: 'immutable-test',
        name: 'Collision Attempt',
        glbUrl: '/models/immutable-test-2.glb',
        plyUrl: '/models/immutable-test-2.ply',
      })

      const stateAfter = useViewerStore.getState()
      expect(stateAfter.discoveredScenes).toEqual(discoveredBefore)
    })
  })

})
