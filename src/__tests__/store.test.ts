import { describe, it, expect, beforeEach } from 'vitest'
import { useViewerStore } from '@/store/viewerStore'

describe('viewerStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useViewerStore.setState({
      activeSceneId: 'scan-a',
      viewMode: 'mesh',
      toolMode: 'orbit',
      measurements: [],
      annotations: [],
      clipPlane: { enabled: false, axis: 'y', position: 0.5, flipped: false },
      colorMapMode: 'original',
      pointSize: 0.02,
      isLoading: false,
      loadingProgress: 0,
      loadingMessage: '',
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
})
