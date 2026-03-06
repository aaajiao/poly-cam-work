import { test, expect, type Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function openSidebar(page: Page) {
  const sidebar = page.locator('[data-testid="sidebar"]')
  const box = await sidebar.boundingBox()
  if (box && box.width < 100) {
    await page.click('[data-testid="sidebar-toggle"]')
    await page.waitForTimeout(300)
  }
}

function makeAnnotation(id: string, title: string, sceneId = 'scan-a') {
  return {
    id,
    position: [0.5, 1.0, 0.3],
    title,
    description: '',
    images: [],
    videoUrl: null,
    links: [],
    sceneId,
    createdAt: 1709600000000,
  }
}

async function seedViaStore(page: Page, annotations: object[]) {
  await page.evaluate((anns) => {
    const store = (window as unknown as Record<string, { setState: (s: unknown) => void }>).__store
    store.setState({ annotations: anns, annotationsVisible: true })
  }, annotations)
  await page.waitForTimeout(100)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Annotation system', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('[data-testid="toolbar"]', { timeout: 15000 })
    await page.evaluate(() => localStorage.clear())
    await page.evaluate(() => {
      const store = (window as unknown as Record<string, { setState: (s: unknown) => void }>).__store
      store.setState({ annotations: [], selectedAnnotationId: null, annotationsVisible: true })
    })
    await openSidebar(page)
  })

  // ── Empty state ────────────────────────────────────────────────────────────

  test('shows empty-state hint when no annotations exist', async ({ page }) => {
    await expect(page.locator('[data-testid="annotation-manager"]')).toBeVisible()
    await expect(page.locator('text=No annotations yet')).toBeVisible()
    await expect(page.locator('[data-testid="annotation-count-badge"]')).not.toBeVisible()
  })

  // ── Visibility toggle ──────────────────────────────────────────────────────

  test('visibility toggle button reflects visible/hidden state', async ({ page }) => {
    const btn = page.locator('[data-testid="toggle-annotations-btn"]')
    await expect(btn).toBeVisible()

    await expect(btn).toHaveClass(/bg-blue-600/)

    await btn.click()
    await expect(btn).toHaveClass(/bg-zinc-900/)
    await expect(btn).not.toHaveClass(/bg-blue-600/)

    await btn.click()
    await expect(btn).toHaveClass(/bg-blue-600/)
  })

  // ── Sidebar list (seeded) ──────────────────────────────────────────────────

  test('seeded annotation appears in sidebar list', async ({ page }) => {
    await seedViaStore(page, [makeAnnotation('ann-001', 'My Marker')])

    await expect(page.locator('[data-testid="annotation-list"]')).toBeVisible()
    await expect(page.locator('text=My Marker')).toBeVisible()
  })

  test('annotation count badge shows correct number', async ({ page }) => {
    await seedViaStore(page, [
      makeAnnotation('ann-001', 'Marker One'),
      makeAnnotation('ann-002', 'Marker Two'),
    ])

    const badge = page.locator('[data-testid="annotation-count-badge"]')
    await expect(badge).toBeVisible()
    await expect(badge).toHaveText('2')
  })

  // ── Persistence ────────────────────────────────────────────────────────────

  test('annotation persists after page reload', async ({ page }) => {
    await seedViaStore(page, [makeAnnotation('ann-persist', 'Persistent Marker')])

    await page.reload()
    await page.waitForSelector('[data-testid="toolbar"]', { timeout: 10000 })
    await openSidebar(page)

    await expect(page.locator('[data-testid="annotation-item-ann-persist"]')).toContainText('Persistent Marker')
  })

  // ── Selection + editor ────────────────────────────────────────────────────

  test('clicking annotation item selects it and shows editor', async ({ page }) => {
    await seedViaStore(page, [makeAnnotation('ann-sel', 'Selectable Marker')])

    await page.locator('[data-testid="annotation-item-ann-sel"]').click()

    await expect(page.locator('[data-testid="annotation-editor"]')).toBeVisible()
    await expect(page.locator('[data-testid="annotation-title-input"]')).toHaveValue(
      'Selectable Marker'
    )
  })

  test('clicking selected item again de-selects it and hides editor', async ({ page }) => {
    await seedViaStore(page, [makeAnnotation('ann-desel', 'Toggle Select')])

    const item = page.locator('[data-testid="annotation-item-ann-desel"]')
    await item.click()
    await expect(page.locator('[data-testid="annotation-editor"]')).toBeVisible()

    await item.click()
    await expect(page.locator('[data-testid="annotation-editor"]')).not.toBeVisible()
  })

  // ── Edit ──────────────────────────────────────────────────────────────────

  test('editing title in editor persists after reload', async ({ page }) => {
    await seedViaStore(page, [makeAnnotation('ann-edit', 'Original Title')])

    await page.locator('[data-testid="annotation-item-ann-edit"]').click()
    await expect(page.locator('[data-testid="annotation-editor"]')).toBeVisible()

    const titleInput = page.locator('[data-testid="annotation-title-input"]')
    await titleInput.clear()
    await titleInput.fill('Updated Title')
    await titleInput.blur()

    await expect(page.locator('[data-testid="annotation-item-ann-edit"]')).toContainText(
      'Updated Title',
      { timeout: 3000 }
    )

    await page.reload()
    await page.waitForSelector('[data-testid="toolbar"]', { timeout: 10000 })
    await openSidebar(page)

    await expect(page.locator('[data-testid="annotation-item-ann-edit"]')).toContainText('Updated Title')
  })

  test('description field is editable in annotation editor', async ({ page }) => {
    await seedViaStore(page, [makeAnnotation('ann-desc', 'Desc Test')])

    await page.locator('[data-testid="annotation-item-ann-desc"]').click()
    await expect(page.locator('[data-testid="annotation-editor"]')).toBeVisible()

    const descInput = page.locator('[data-testid="annotation-description-input"]')
    await descInput.fill('Some description text')
    await expect(descInput).toHaveValue('Some description text')
  })

  // ── Delete ────────────────────────────────────────────────────────────────

  test('delete annotation removes it from sidebar list', async ({ page }) => {
    await seedViaStore(page, [makeAnnotation('ann-del', 'To Delete')])

    await expect(page.locator('text=To Delete')).toBeVisible()

    page.on('dialog', (dialog) => dialog.accept())
    await page.locator('[data-testid="annotation-delete-ann-del"]').click({ force: true })

    await expect(page.locator('text=To Delete')).not.toBeVisible({ timeout: 5000 })
    await expect(page.locator('text=No annotations yet')).toBeVisible()
  })

  test('dismissing delete confirm keeps annotation in list', async ({ page }) => {
    await seedViaStore(page, [makeAnnotation('ann-keep', 'Keep Me')])

    page.on('dialog', (dialog) => dialog.dismiss())
    await page.locator('[data-testid="annotation-delete-ann-keep"]').click({ force: true })

    await expect(page.locator('text=Keep Me')).toBeVisible()
  })

  // ── Vimeo URL validation ───────────────────────────────────────────────────

  test('non-Vimeo URL shows validation error', async ({ page }) => {
    await seedViaStore(page, [makeAnnotation('ann-video', 'Video Test')])

    await page.locator('[data-testid="annotation-item-ann-video"]').click()
    await expect(page.locator('[data-testid="annotation-editor"]')).toBeVisible()

    const videoInput = page.locator('[data-testid="annotation-video-input"]')
    await videoInput.fill('https://youtube.com/watch?v=abc123')
    await videoInput.blur()

    await expect(page.locator('text=Only Vimeo URLs supported')).toBeVisible({ timeout: 2000 })
  })

  test('valid Vimeo URL does not show validation error', async ({ page }) => {
    await seedViaStore(page, [makeAnnotation('ann-vimeo', 'Vimeo Test')])

    await page.locator('[data-testid="annotation-item-ann-vimeo"]').click()
    await expect(page.locator('[data-testid="annotation-editor"]')).toBeVisible()

    const videoInput = page.locator('[data-testid="annotation-video-input"]')
    await videoInput.fill('https://vimeo.com/123456789')
    await videoInput.blur()

    await expect(page.locator('text=Only Vimeo URLs supported')).not.toBeVisible()
  })

  // ── Links ─────────────────────────────────────────────────────────────────

  test('add link button inserts a new link entry', async ({ page }) => {
    await seedViaStore(page, [makeAnnotation('ann-link', 'Link Test')])

    await page.locator('[data-testid="annotation-item-ann-link"]').click()
    await expect(page.locator('[data-testid="annotation-editor"]')).toBeVisible()

    await page.locator('[data-testid="annotation-add-link-btn"]').click()
    await expect(page.locator('[data-testid="annotation-link-url-0"]')).toBeVisible()
  })

  test('remove link button deletes link entry', async ({ page }) => {
    await seedViaStore(page, [
      {
        ...makeAnnotation('ann-rmlink', 'Remove Link Test'),
        links: [{ url: 'https://example.com', label: 'Example' }],
      },
    ])

    await page.locator('[data-testid="annotation-item-ann-rmlink"]').click()
    await expect(page.locator('[data-testid="annotation-editor"]')).toBeVisible()

    await expect(page.locator('[data-testid="annotation-link-url-0"]')).toBeVisible()
    await page.locator('[data-testid="annotation-link-delete-0"]').click()
    await expect(page.locator('[data-testid="annotation-link-url-0"]')).not.toBeVisible()
  })

  // ── Scene scoping ─────────────────────────────────────────────────────────

  test('annotations are scoped per scene', async ({ page }) => {
    await seedViaStore(page, [
      makeAnnotation('ann-a', 'Scene A Marker', 'scan-a'),
      makeAnnotation('ann-b', 'Scene B Marker', 'scan-b'),
    ])

    await expect(page.locator('text=Scene A Marker')).toBeVisible()
    await expect(page.locator('text=Scene B Marker')).not.toBeVisible()

    await page.click('[data-testid="scene-item-scan-b"]')

    await expect(page.locator('text=Scene B Marker')).toBeVisible()
    await expect(page.locator('text=Scene A Marker')).not.toBeVisible()
  })

  test('annotation count badge updates when switching scenes', async ({ page }) => {
    await seedViaStore(page, [
      makeAnnotation('ann-a1', 'A One', 'scan-a'),
      makeAnnotation('ann-a2', 'A Two', 'scan-a'),
      makeAnnotation('ann-b1', 'B One', 'scan-b'),
    ])

    await expect(page.locator('[data-testid="annotation-count-badge"]')).toHaveText('2')

    await page.click('[data-testid="scene-item-scan-b"]')
    await expect(page.locator('[data-testid="annotation-count-badge"]')).toHaveText('1')
  })
})
