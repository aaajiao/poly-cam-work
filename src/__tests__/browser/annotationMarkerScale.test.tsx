import type { PropsWithChildren } from 'react'
import type * as THREE from 'three'
import { describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'

import { AnnotationMarker } from '@/components/tools/AnnotationMarker'
import type { Annotation } from '@/types'

interface MockThreeState {
  camera: THREE.PerspectiveCamera
  size: {
    height: number
    width: number
  }
}

interface MockR3fController {
  cameraDistance: number
  runFrame: (distance: number) => void
}

const mockR3f = vi.hoisted<MockR3fController>(() => ({
  cameraDistance: 12,
  runFrame: () => {},
}))

vi.mock('@react-three/drei', async () => {
  const { createElement } = await import('react')

  return {
    Html: ({ children }: PropsWithChildren) =>
      createElement(
        'div',
        { 'data-testid': 'mock-annotation-html-anchor' },
        children,
      ),
    useCursor: () => {},
  }
})

vi.mock('@react-three/fiber', async () => {
  const Three = await import('three')
  let frameCallback: ((state: MockThreeState) => void) | null = null

  function createState(): MockThreeState {
    const camera = new Three.PerspectiveCamera(50, 640 / 480, 0.1, 100)
    camera.position.set(0, 0, mockR3f.cameraDistance)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()
    camera.updateProjectionMatrix()

    return {
      camera,
      size: { height: 480, width: 640 },
    }
  }

  mockR3f.runFrame = (distance: number) => {
    mockR3f.cameraDistance = distance
    frameCallback?.(createState())
  }

  return {
    useFrame: (callback: (state: MockThreeState) => void) => {
      frameCallback = callback
    },
    useThree: (selector?: (state: MockThreeState) => unknown) => {
      const state = createState()
      return selector ? selector(state) : state
    },
  }
})

const ANNOTATION_ID = 'scale-regression'
const CAMERA_DISTANCES = [0.75, 8, 40] as const

const annotation: Annotation = {
  id: ANNOTATION_ID,
  position: [0, 0, 0],
  title:
    'A deliberately long annotation title that must wrap instead of growing beyond the viewport',
  description: '',
  images: [],
  videoUrl: null,
  links: [],
  sceneId: 'scan-a',
  createdAt: 1709600000000,
}

interface MarkerHarnessProps {
  distance: number
}

function MarkerHarness({ distance }: MarkerHarnessProps) {
  mockR3f.cameraDistance = distance

  return (
    <div
      data-testid="annotation-marker-stage"
      style={{ height: 480, position: 'relative', width: 640 }}
    >
      <style>{`
        [data-testid="annotation-marker-stage"] * {
          animation: none !important;
          transition: none !important;
        }
      `}</style>
      <AnnotationMarker
        annotation={annotation}
        isActive={false}
        onSelect={() => {}}
      />
    </div>
  )
}

function getElement(testId: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(
    `[data-testid="${testId}"]`,
  )
  if (!element) throw new Error(`Missing element: ${testId}`)
  return element
}

async function waitForAnimationFrames(count = 3): Promise<void> {
  for (let i = 0; i < count; i++) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }
}

async function runFrame(distance: number): Promise<void> {
  mockR3f.runFrame(distance)
  await waitForAnimationFrames()
}

function expectBetween(value: number, min: number, max: number): void {
  expect(value).toBeGreaterThanOrEqual(min)
  expect(value).toBeLessThanOrEqual(max)
}

describe('browser annotation marker scaling', () => {
  test('keeps the visual marker bounded and the hit target accessible across camera distances', async () => {
    const screen = await render(<MarkerHarness distance={CAMERA_DISTANCES[0]} />)
    const measuredVisualWidths: number[] = []

    for (const distance of CAMERA_DISTANCES) {
      await screen.rerender(<MarkerHarness distance={distance} />)
      await runFrame(distance)

      await vi.waitFor(() => {
        const markerRect = getElement(
          `annotation-marker-${ANNOTATION_ID}`,
        ).getBoundingClientRect()
        const visualRect = getElement(
          `annotation-marker-visual-${ANNOTATION_ID}`,
        ).getBoundingClientRect()

        expectBetween(markerRect.width, 43, 45)
        expectBetween(markerRect.height, 43, 45)
        expectBetween(visualRect.width, 19.9, 32.1)
        expectBetween(visualRect.height, 19.9, 32.1)

        const marker = getElement(`annotation-marker-${ANNOTATION_ID}`)
        const visual = getElement(`annotation-marker-visual-${ANNOTATION_ID}`)
        expect(marker.classList.contains('h-11')).toBe(true)
        expect(marker.classList.contains('w-11')).toBe(true)
        expect(visual.classList.contains('h-6')).toBe(true)
        expect(visual.classList.contains('w-6')).toBe(true)
      })

      measuredVisualWidths.push(
        getElement(
          `annotation-marker-visual-${ANNOTATION_ID}`,
        ).getBoundingClientRect().width,
      )
    }

    expect(measuredVisualWidths[0]).toBeGreaterThan(measuredVisualWidths[1])
    expect(measuredVisualWidths[1]).toBeGreaterThan(measuredVisualWidths[2])
  })

  test('keeps the hover tooltip readable, width-bounded, and free of horizontal overflow', async () => {
    const screen = await render(<MarkerHarness distance={0.75} />)
    await runFrame(0.75)

    await screen.getByTestId(`annotation-marker-${ANNOTATION_ID}`).hover()

    await vi.waitFor(() => {
      const tooltip = getElement(`annotation-marker-tooltip-${ANNOTATION_ID}`)
      const tooltipRect = tooltip.getBoundingClientRect()
      const fontSize = Number.parseFloat(getComputedStyle(tooltip).fontSize)
      const tooltipText = tooltip.querySelector('span')
      if (!tooltipText) throw new Error('Missing annotation tooltip text')

      expectBetween(fontSize, 11, 14)
      expect(tooltipRect.width).toBeLessThanOrEqual(240)
      expect(tooltip.scrollWidth).toBeLessThanOrEqual(tooltip.clientWidth + 1)
      expect(tooltipRect.left).toBeGreaterThanOrEqual(8)
      expect(tooltipRect.right).toBeLessThanOrEqual(window.innerWidth - 8)
      expect(tooltip.classList.contains('max-w-60')).toBe(true)
      expect(tooltipText.classList.contains('break-words')).toBe(true)
    })
  })
})
