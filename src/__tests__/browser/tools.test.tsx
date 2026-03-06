import { beforeEach, describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { Toolbar } from '@/components/toolbar/Toolbar'
import { useViewerStore } from '@/store/viewerStore'

function resetStore() {
  localStorage.removeItem('polycam-viewer-state')
  useViewerStore.setState({
    toolMode: 'orbit',
    annotationsVisible: true,
    annotationsPanelOpen: false,
    sidebarOpen: false,
    clipPlane: { enabled: false, axis: 'y', position: 0.5, flipped: false },
  })
}

describe('browser toolbar tools', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    resetStore()
  })

  test('orbit tool is active by default and measure can be activated', async () => {
    const screen = await render(<Toolbar />)

    await expect.element(screen.getByTestId('tool-orbit')).toHaveClass('bg-blue-600')
    await screen.getByTestId('tool-measure').click()

    await expect.element(screen.getByTestId('tool-measure')).toHaveClass('bg-blue-600')
    await expect.element(screen.getByTestId('tool-orbit')).not.toHaveClass('bg-blue-600')
    expect(useViewerStore.getState().toolMode).toBe('measure')
  })

  test('clip toggle enables and disables clipping without changing tool mode', async () => {
    const screen = await render(<Toolbar />)

    await screen.getByTestId('clip-toggle').click()
    await expect.element(screen.getByTestId('clip-toggle')).toHaveClass('bg-blue-600')
    expect(useViewerStore.getState().clipPlane.enabled).toBe(true)
    expect(useViewerStore.getState().toolMode).toBe('orbit')

    await screen.getByTestId('clip-toggle').click()
    await expect.element(screen.getByTestId('clip-toggle')).not.toHaveClass('bg-blue-600')
    expect(useViewerStore.getState().clipPlane.enabled).toBe(false)
    expect(useViewerStore.getState().toolMode).toBe('orbit')
  })

  test('annotate tool activates and opens annotation panel', async () => {
    const screen = await render(<Toolbar />)

    await screen.getByTestId('tool-annotate').click()

    await expect.element(screen.getByTestId('tool-annotate')).toHaveClass('bg-blue-600')
    expect(useViewerStore.getState().toolMode).toBe('annotate')
    expect(useViewerStore.getState().annotationsPanelOpen).toBe(true)
  })

  test('annotation visibility toggle reflects hidden/visible state', async () => {
    const screen = await render(<Toolbar />)

    const toggle = screen.getByTestId('toggle-annotations-btn')
    await expect.element(toggle).toHaveClass('bg-blue-600')

    await toggle.click()
    await expect.element(toggle).toHaveClass('bg-zinc-900')
    expect(useViewerStore.getState().annotationsVisible).toBe(false)

    await toggle.click()
    await expect.element(toggle).toHaveClass('bg-blue-600')
    expect(useViewerStore.getState().annotationsVisible).toBe(true)
  })

  test('screenshot button exists and invokes screenshot bridge', async () => {
    const screenshotSpy = vi.fn()
    ;(window as Window & { __takeScreenshot?: () => void }).__takeScreenshot = screenshotSpy

    const screen = await render(<Toolbar />)

    await expect.element(screen.getByTestId('screenshot-btn')).toBeVisible()
    await screen.getByTestId('screenshot-btn').click()
    expect(screenshotSpy).toHaveBeenCalledOnce()
  })
})
