import { beforeEach, describe, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { Layout } from '@/components/Layout'
import { useViewerStore } from '@/store/viewerStore'

function resetStore() {
  localStorage.removeItem('polycam-viewer-state')
  useViewerStore.setState({
    presentationMode: false,
    sidebarOpen: true,
  })
}

describe('browser presentation mode layout', () => {
  beforeEach(() => {
    resetStore()
  })

  test('presentation mode hides chrome and shows exit affordance', async () => {
    useViewerStore.setState({ presentationMode: true })
    const screen = await render(
      <Layout
        sidebar={<div>Sidebar</div>}
        toolbar={<div>Toolbar</div>}
        statusBar={<div>Status</div>}
      >
        <div data-testid="presentation-content">Content</div>
      </Layout>
    )

    await expect.element(screen.getByTestId('canvas-container')).toBeVisible()
    await expect.element(screen.getByTestId('presentation-content')).toBeVisible()
    await expect.element(screen.getByTestId('presentation-exit-btn')).toBeVisible()
    await expect.element(screen.getByTestId('sidebar')).not.toBeInTheDocument()
    await expect.element(screen.getByTestId('toolbar')).not.toBeInTheDocument()
    await expect.element(screen.getByTestId('statusbar')).not.toBeInTheDocument()
  })

  test('escape exits presentation mode without clearing open annotation panels', async () => {
    useViewerStore.setState({ presentationMode: true, openAnnotationPanelIds: ['ann-1'] })
    await render(
      <Layout
        sidebar={<div>Sidebar</div>}
        toolbar={<div>Toolbar</div>}
        statusBar={<div>Status</div>}
      >
        <div>Content</div>
      </Layout>
    )

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

    expect(useViewerStore.getState().presentationMode).toBe(false)
    expect(useViewerStore.getState().openAnnotationPanelIds).toEqual(['ann-1'])
  })
})
