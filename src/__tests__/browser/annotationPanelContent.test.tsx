import { beforeEach, describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { AnnotationPanelContent } from '@/components/tools/AnnotationPanelContent'
import { useViewerStore } from '@/store/viewerStore'
import type { Annotation } from '@/types'

vi.mock('@/components/ui/VimeoEmbed', () => ({
  VimeoEmbed: ({ videoId }: { videoId: string }) => <div data-testid="mock-vimeo-embed">{videoId}</div>,
}))

function makeAnnotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: 'ann-content',
    position: [0, 0, 0],
    title: 'Content Test',
    description: '',
    images: [],
    videoUrl: null,
    links: [],
    sceneId: 'scan-a',
    createdAt: 1709600000000,
    ...overrides,
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
    cameraControlsEnabled: true,
    clipPlane: { enabled: false, axis: 'y', position: 0.5, flipped: false },
    uploadedScenes: [],
  })
}

function getContentOrder() {
  const content = document.querySelector('[data-testid="annotation-panel-content"]')
  expect(content).not.toBeNull()
  return Array.from(content!.children).map((child) => child.getAttribute('data-testid'))
}

describe('browser annotation panel content', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    resetStore()
  })

  test('renders media before description when image and video both exist', async () => {
    const annotation = makeAnnotation({
      description: 'Description after media',
      images: [{ filename: 'detail.gif', url: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' }],
      videoUrl: 'https://vimeo.com/123456789',
      links: [{ url: 'https://example.com', label: 'Reference' }],
    })

    const screen = await render(
      <AnnotationPanelContent
        annotation={annotation}
        primaryImageAspectRatio={4 / 3}
        onPrimaryAspectRatioChange={vi.fn()}
      />
    )

    await expect.element(screen.getByText('Description after media')).toBeVisible()
    await expect.element(screen.getByTestId('mock-vimeo-embed')).toBeVisible()
    expect(getContentOrder()).toEqual([
      'annotation-panel-image-media',
      'annotation-panel-video-media',
      'annotation-panel-description',
      'annotation-panel-links',
    ])
  })

  test('keeps description first when no media exists', async () => {
    const annotation = makeAnnotation({
      description: 'Text only description',
      links: [{ url: 'https://example.com/text', label: 'Read more' }],
    })

    const screen = await render(
      <AnnotationPanelContent
        annotation={annotation}
        primaryImageAspectRatio={4 / 3}
        onPrimaryAspectRatioChange={vi.fn()}
      />
    )

    await expect.element(screen.getByText('Text only description')).toBeVisible()
    expect(getContentOrder()).toEqual([
      'annotation-panel-description',
      'annotation-panel-links',
    ])
  })
})
