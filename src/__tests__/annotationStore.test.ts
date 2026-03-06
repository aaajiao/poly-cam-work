import { describe, it, expect, beforeEach } from 'vitest'
import { useViewerStore } from '@/store/viewerStore'
import type { Annotation } from '@/types'

function applyV0ToV1Migration(a: Record<string, unknown>): Record<string, unknown> {
  const { text: _text, ...rest } = a
  return {
    ...rest,
    title: typeof a.text === 'string' ? a.text : (a.title ?? ''),
    description: a.description ?? '',
    images: a.images ?? [],
    videoUrl: a.videoUrl ?? null,
    links: a.links ?? [],
    createdAt: a.createdAt ?? Date.now(),
  }
}

const makeAnnotation = (overrides: Partial<Annotation> = {}): Annotation => ({
  id: 'ann-1',
  position: [0, 0, 0],
  title: 'Test',
  description: '',
  images: [],
  videoUrl: null,
  links: [],
  sceneId: 'scan-a',
  createdAt: Date.now(),
  ...overrides,
})

describe('annotation store', () => {
  beforeEach(() => {
    useViewerStore.setState({
      annotations: [],
      selectedAnnotationId: null,
      openAnnotationPanelIds: [],
      annotationsVisible: true,
      activeSceneId: 'scan-a',
    })
  })

  it('addAnnotation adds to list', () => {
    const { addAnnotation } = useViewerStore.getState()
    addAnnotation(makeAnnotation())
    expect(useViewerStore.getState().annotations).toHaveLength(1)
    expect(useViewerStore.getState().annotations[0].id).toBe('ann-1')
  })

  it('removeAnnotation removes from list', () => {
    const { addAnnotation, removeAnnotation } = useViewerStore.getState()
    addAnnotation(makeAnnotation({ id: 'ann-del' }))
    removeAnnotation('ann-del')
    expect(useViewerStore.getState().annotations).toHaveLength(0)
  })

  it('updateAnnotationContent updates specific fields without clobbering others', () => {
    const { addAnnotation, updateAnnotationContent } = useViewerStore.getState()
    addAnnotation(makeAnnotation({ id: 'ann-update', title: 'Original' }))
    updateAnnotationContent('ann-update', { title: 'Updated', description: 'Some detail' })
    const ann = useViewerStore.getState().annotations[0]
    expect(ann.title).toBe('Updated')
    expect(ann.description).toBe('Some detail')
    expect(ann.images).toEqual([])
    expect(ann.videoUrl).toBeNull()
    expect(ann.links).toEqual([])
    expect(ann.id).toBe('ann-update')
    expect(ann.sceneId).toBe('scan-a')
  })

  it('selectAnnotation sets selectedAnnotationId', () => {
    const { selectAnnotation } = useViewerStore.getState()
    selectAnnotation('ann-1')
    expect(useViewerStore.getState().selectedAnnotationId).toBe('ann-1')
  })

  it('selectAnnotation(null) clears selection', () => {
    const { selectAnnotation } = useViewerStore.getState()
    selectAnnotation('ann-1')
    selectAnnotation(null)
    expect(useViewerStore.getState().selectedAnnotationId).toBeNull()
  })

  it('openAnnotationPanel appends unique ids only', () => {
    const { openAnnotationPanel } = useViewerStore.getState()
    openAnnotationPanel('ann-1')
    openAnnotationPanel('ann-2')
    openAnnotationPanel('ann-1')
    expect(useViewerStore.getState().openAnnotationPanelIds).toEqual(['ann-1', 'ann-2'])
  })

  it('toggleAnnotationPanel toggles panel id open and closed', () => {
    const { toggleAnnotationPanel } = useViewerStore.getState()
    toggleAnnotationPanel('ann-1')
    expect(useViewerStore.getState().openAnnotationPanelIds).toEqual(['ann-1'])
    toggleAnnotationPanel('ann-1')
    expect(useViewerStore.getState().openAnnotationPanelIds).toEqual([])
  })

  it('clearAnnotationPanels closes all opened panels', () => {
    const { openAnnotationPanel, clearAnnotationPanels } = useViewerStore.getState()
    openAnnotationPanel('ann-1')
    openAnnotationPanel('ann-2')
    clearAnnotationPanels()
    expect(useViewerStore.getState().openAnnotationPanelIds).toEqual([])
  })

  it('toggleAnnotationsVisible toggles boolean', () => {
    const { toggleAnnotationsVisible } = useViewerStore.getState()
    expect(useViewerStore.getState().annotationsVisible).toBe(true)
    toggleAnnotationsVisible()
    expect(useViewerStore.getState().annotationsVisible).toBe(false)
    toggleAnnotationsVisible()
    expect(useViewerStore.getState().annotationsVisible).toBe(true)
  })

  it('setActiveScene clears selectedAnnotationId', () => {
    const { selectAnnotation, openAnnotationPanel, setActiveScene } = useViewerStore.getState()
    selectAnnotation('ann-1')
    openAnnotationPanel('ann-1')
    expect(useViewerStore.getState().selectedAnnotationId).toBe('ann-1')
    setActiveScene('scan-b')
    expect(useViewerStore.getState().selectedAnnotationId).toBeNull()
    expect(useViewerStore.getState().openAnnotationPanelIds).toEqual([])
  })

  it('removeAnnotation also clears selection and opened panel id for that annotation', () => {
    const { addAnnotation, selectAnnotation, openAnnotationPanel, removeAnnotation } = useViewerStore.getState()
    addAnnotation(makeAnnotation({ id: 'ann-rm' }))
    selectAnnotation('ann-rm')
    openAnnotationPanel('ann-rm')

    removeAnnotation('ann-rm')

    const state = useViewerStore.getState()
    expect(state.annotations).toHaveLength(0)
    expect(state.selectedAnnotationId).toBeNull()
    expect(state.openAnnotationPanelIds).toEqual([])
  })

  it('migrate v0→v1: text field becomes title with empty defaults', () => {
    const oldAnnotation = { id: 'old-1', position: [0, 0, 0], text: 'Old Label', sceneId: 'scan-a' }
    const migrated = applyV0ToV1Migration(oldAnnotation)
    expect(migrated.title).toBe('Old Label')
    expect(migrated.description).toBe('')
    expect(migrated.images).toEqual([])
    expect(migrated.videoUrl).toBeNull()
    expect(migrated.links).toEqual([])
    expect('text' in migrated).toBe(false)
  })

  it('migrate v0→v1: preserves existing title when no text field', () => {
    const almostNew = { id: 'p-1', position: [0, 0, 0], title: 'Keep Me', sceneId: 'scan-a' }
    const migrated = applyV0ToV1Migration(almostNew)
    expect(migrated.title).toBe('Keep Me')
    expect('text' in migrated).toBe(false)
  })
})
