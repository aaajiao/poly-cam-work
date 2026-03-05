import { test, expect } from '@playwright/test'

test.describe('File Upload', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('[data-testid="scene-canvas"]', { timeout: 15000 })
  })

  test('drop overlay appears when dragging over page', async ({ page }) => {
    await page.evaluate(() => {
      const event = new DragEvent('dragover', {
        bubbles: true,
        cancelable: true,
        dataTransfer: new DataTransfer(),
      })
      window.dispatchEvent(event)
    })

    await expect(page.locator('[data-testid="drop-overlay"]')).toBeVisible({ timeout: 2000 })
  })

  test('drop overlay disappears when drag leaves', async ({ page }) => {
    await page.evaluate(() => {
      window.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true }))
    })
    await expect(page.locator('[data-testid="drop-overlay"]')).toBeVisible({ timeout: 2000 })

    await page.evaluate(() => {
      window.dispatchEvent(new DragEvent('dragleave', { bubbles: true, relatedTarget: null }))
    })
    await expect(page.locator('[data-testid="drop-overlay"]')).not.toBeVisible({ timeout: 2000 })
  })

  test('invalid file type shows error', async ({ page }) => {
    await page.evaluate(() => {
      const dt = new DataTransfer()
      const file = new File(['fake jpg content'], 'photo.jpg', { type: 'image/jpeg' })
      dt.items.add(file)
      const event = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt,
      })
      window.dispatchEvent(event)
    })

    await expect(page.locator('[data-testid="upload-error"]')).toBeVisible({ timeout: 3000 })
  })

  test('status bar shows scene info', async ({ page }) => {
    const statusBar = page.locator('[data-testid="status-bar"]')
    await expect(statusBar).toBeVisible()
    const text = await statusBar.textContent()
    expect(text).toBeTruthy()
    expect(text!.length).toBeGreaterThan(0)
  })
})
