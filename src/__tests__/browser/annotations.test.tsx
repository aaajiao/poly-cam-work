import { beforeEach, describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { AnnotationManager } from '@/components/sidebar/AnnotationManager'
import { FileManager } from '@/components/sidebar/FileManager'
import { useViewerStore } from '@/store/viewerStore'
import type { Annotation } from '@/types'

vi.mock('@/components/ui/ImageUpload', () => ({
  ImageUpload: () => <div data-testid="image-upload" />,
}))

vi.mock('@/storage/imageStorage', () => ({
  imageStorage: {
    deleteByAnnotation: vi.fn().mockResolvedValue(undefined),
  },
}))

function makeAnnotation(id: string, title: string, sceneId = 'scan-a'): Annotation {
  return {
    id,
    position: [0.5, 1, 0.3],
    title,
    description: '',
    images: [],
    videoUrl: null,
    links: [],
    sceneId,
    createdAt: 1709600000000,
  }
}

function resetStore() {
  localStorage.removeItem('polycam-viewer-state')
  useViewerStore.setState({
    activeSceneId: 'scan-a',
    toolMode: 'orbit',
    measurements: [],
    annotations: [],
    selectedAnnotationId: null,
    openAnnotationPanelIds: [],
    annotationsVisible: true,
    annotationsPanelOpen: true,
    sidebarOpen: true,
    presentationMode: false,
    clipPlane: { enabled: false, axis: 'y', position: 0.5, flipped: false },
    uploadedScenes: [],
  })
}

describe('browser annotation manager', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    resetStore()
  })

  test('shows empty state when no annotations exist', async () => {
    const screen = await render(<AnnotationManager />)

    await expect.element(screen.getByTestId('annotation-manager')).toBeVisible()
    await expect.element(screen.getByText(/No annotations yet/)).toBeVisible()
    expect(useViewerStore.getState().annotations).toHaveLength(0)
  })

  test('shows seeded annotations and updates count by scene switch', async () => {
    useViewerStore.setState({
      annotations: [
        makeAnnotation('ann-a1', 'A One', 'scan-a'),
        makeAnnotation('ann-a2', 'A Two', 'scan-a'),
        makeAnnotation('ann-b1', 'B One', 'scan-b'),
      ],
    })

    const screen = await render(
      <>
        <FileManager />
        <AnnotationManager />
      </>
    )

    await expect.element(screen.getByText('A One')).toBeVisible()
    await expect.element(screen.getByTestId('annotation-count-badge')).toHaveTextContent('2')

    await screen.getByTestId('scene-item-scan-b').click()
    await expect.element(screen.getByText('B One')).toBeVisible()
    await expect.element(screen.getByTestId('annotation-count-badge')).toHaveTextContent('1')
    expect(useViewerStore.getState().activeSceneId).toBe('scan-b')
  })

  test('selecting annotation opens editor and supports title/description edits', async () => {
    useViewerStore.setState({ annotations: [makeAnnotation('ann-edit', 'Original Title')] })
    const screen = await render(<AnnotationManager />)

    await screen.getByTestId('annotation-item-ann-edit').click()
    await expect.element(screen.getByTestId('annotation-editor')).toBeVisible()

    const titleInput = screen.getByTestId('annotation-title-input')
    await titleInput.fill('Updated Title')
    await screen.getByTestId('annotation-description-input').click()

    const descriptionInput = screen.getByTestId('annotation-description-input')
    await descriptionInput.fill('Some description text')
    await screen.getByTestId('annotation-video-input').click()

    const updated = useViewerStore.getState().annotations.find((a) => a.id === 'ann-edit')
    expect(updated?.title).toBe('Updated Title')
    expect(updated?.description).toBe('Some description text')
  })

  test('validates Vimeo URL and allows link add/remove', async () => {
    useViewerStore.setState({ annotations: [makeAnnotation('ann-video', 'Video Test')] })
    const screen = await render(<AnnotationManager />)

    await screen.getByTestId('annotation-item-ann-video').click()

    const videoInput = screen.getByTestId('annotation-video-input')
    await videoInput.fill('https://youtube.com/watch?v=abc123')
    await expect.element(screen.getByText('Only Vimeo URLs supported')).toBeVisible()

    await videoInput.fill('https://vimeo.com/123456789')
    await expect.element(videoInput).not.toHaveClass('border-destructive')

    await screen.getByTestId('annotation-add-link-btn').click()
    await expect.element(screen.getByTestId('annotation-link-url-0')).toBeVisible()

    await screen.getByTestId('annotation-link-delete-0').click()
    expect(useViewerStore.getState().annotations[0].links).toHaveLength(0)
  })

  test('delete action removes annotation when confirmed and keeps it when dismissed', async () => {
    useViewerStore.setState({ annotations: [makeAnnotation('ann-del', 'To Delete')] })
    const screen = await render(<AnnotationManager />)

    const confirmSpy = vi.spyOn(window, 'confirm')
    confirmSpy.mockReturnValue(false)
    await screen.getByTestId('annotation-item-ann-del').hover()
    await screen.getByTestId('annotation-delete-ann-del').click()
    expect(useViewerStore.getState().annotations).toHaveLength(1)

    confirmSpy.mockReturnValue(true)
    await screen.getByTestId('annotation-item-ann-del').hover()
    await screen.getByTestId('annotation-delete-ann-del').click()
    expect(useViewerStore.getState().annotations).toHaveLength(0)
    await expect.element(screen.getByText(/No annotations yet/)).toBeVisible()
  })

  test('annotation list click toggles floating panel open state', async () => {
    useViewerStore.setState({ annotations: [makeAnnotation('ann-toggle', 'Toggle Me')] })
    const screen = await render(<AnnotationManager />)

    await screen.getByTestId('annotation-item-ann-toggle').click()
    let state = useViewerStore.getState()
    expect(state.selectedAnnotationId).toBe('ann-toggle')
    expect(state.openAnnotationPanelIds).toEqual(['ann-toggle'])

    await screen.getByTestId('annotation-item-ann-toggle').click()
    state = useViewerStore.getState()
    expect(state.selectedAnnotationId).toBeNull()
    expect(state.openAnnotationPanelIds).toEqual([])
  })

  test('presentation mode keeps panel toggling but hides editing controls', async () => {
    useViewerStore.setState({
      annotations: [makeAnnotation('ann-present', 'Presentation Node')],
      presentationMode: true,
      selectedAnnotationId: 'ann-present',
    })
    const screen = await render(<AnnotationManager />)

    await expect.element(screen.getByText('Presentation Node')).toBeVisible()
    await expect.element(screen.getByTestId('annotation-editor')).not.toBeInTheDocument()
    await expect.element(screen.getByTestId('annotation-delete-ann-present')).not.toBeInTheDocument()

    await screen.getByTestId('annotation-item-ann-present').click()
    expect(useViewerStore.getState().openAnnotationPanelIds).toEqual(['ann-present'])

    await screen.getByTestId('annotation-item-ann-present').click()
    expect(useViewerStore.getState().openAnnotationPanelIds).toEqual([])
  })
})
