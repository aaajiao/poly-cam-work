import { beforeEach, describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { AnnotationPanelContent } from '@/components/tools/AnnotationPanelContent'
import { imageStorage } from '@/storage/imageStorage'
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

function createPatternPng(width: number, height: number): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D context unavailable')

  const tileSize = Math.max(4, Math.round(width / 80))
  for (let y = 0; y < height; y += tileSize) {
    for (let x = 0; x < width; x += tileSize) {
      context.fillStyle = (x / tileSize + y / tileSize) % 2 === 0 ? '#ffffff' : '#111111'
      context.fillRect(x, y, tileSize, tileSize)
    }
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed'))),
      'image/png'
    )
  })
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

  test('uses the full local image in the resizable panel instead of its thumbnail', async () => {
    const fullImageBlob = await createPatternPng(1600, 900)
    const thumbnailBlob = await createPatternPng(200, 113)
    const getImage = vi.spyOn(imageStorage, 'get').mockResolvedValue(fullImageBlob)
    const getThumbnail = vi
      .spyOn(imageStorage, 'getThumbnail')
      .mockResolvedValue(thumbnailBlob)
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL')
    const annotation = makeAnnotation({
      images: [{ filename: 'local-detail.png', localId: 'local-image-1' }],
    })

    const screen = await render(
      <AnnotationPanelContent
        annotation={annotation}
        primaryImageAspectRatio={4 / 3}
        onPrimaryAspectRatioChange={vi.fn()}
      />
    )

    await expect.element(screen.getByRole('img', { name: 'local-detail.png' })).toBeVisible()
    await vi.waitFor(() => {
      const image = document.querySelector(
        'img[alt="local-detail.png"]'
      ) as HTMLImageElement | null
      expect(image?.naturalWidth).toBe(1600)
      expect(image?.naturalWidth).toBeGreaterThanOrEqual(560 * 2)
    })
    expect(getImage).toHaveBeenCalledWith('local-image-1')
    expect(getThumbnail).not.toHaveBeenCalled()

    const renderedImage = document.querySelector(
      'img[alt="local-detail.png"]'
    ) as HTMLImageElement
    const sourceUrl = renderedImage.src
    await screen.unmount()
    expect(revokeObjectUrl).toHaveBeenCalledWith(sourceUrl)
  })

  test('keeps loaded images and handles a later IndexedDB read failure', async () => {
    const imageBlob = await createPatternPng(640, 360)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(imageStorage, 'get').mockImplementation(async (localId) => {
      if (localId === 'local-image-ok') return imageBlob
      throw new Error('IndexedDB read failed')
    })
    const annotation = makeAnnotation({
      images: [
        { filename: 'loaded.png', localId: 'local-image-ok' },
        { filename: 'missing.png', localId: 'local-image-failed' },
      ],
    })

    const screen = await render(
      <AnnotationPanelContent
        annotation={annotation}
        primaryImageAspectRatio={4 / 3}
        onPrimaryAspectRatioChange={vi.fn()}
      />
    )

    await expect.element(screen.getByRole('img', { name: 'loaded.png' })).toBeVisible()
    await vi.waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(
        'Failed to load annotation image: missing.png',
        expect.any(Error)
      )
    })
    expect(document.querySelector('img[alt="missing.png"]')).toBeNull()
    await screen.unmount()
  })
})
