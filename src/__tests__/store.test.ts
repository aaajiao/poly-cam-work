import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useViewerStore } from '@/store/viewerStore'
import * as publishApi from '@/lib/publishApi'
import { imageStorage } from '@/storage/imageStorage'
import { vercelBlobImageStorage } from '@/storage/vercelBlobImageStorage'
import type { SceneDraft } from '@/types'

describe('viewerStore', () => {
  beforeEach(() => {
    vi.restoreAllMocks()

    // Reset store to initial state
    useViewerStore.setState({
      activeSceneId: 'scan-a',
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
      loadRequestVersionByScene: {},
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
      annotationId: 'ann-upload-1',
      filename: 'pending.jpg',
    })

    const savedDraft = saveDraftSpy.mock.calls[0]?.[1]
    expect(savedDraft.annotations[0].images).toEqual([
      { filename: 'pending.jpg', url: 'https://blob.example/pending.jpg' },
    ])

    expect(deleteSpy).toHaveBeenCalledWith('local-img-2')
    expect(publishSpy).toHaveBeenCalledWith('scan-a', undefined)
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
  })
})
