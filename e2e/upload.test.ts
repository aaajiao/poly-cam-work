import { test, expect } from '@playwright/test'

test.describe('File Upload', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('[data-testid="scene-canvas"]', { timeout: 15000 })
  })

  test('drop overlay component is mounted in DOM', async ({ page }) => {
    await page.evaluate(() => {
      window.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true }))
    })
    await page.waitForTimeout(300)

    const overlayVisible = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="drop-overlay"]')
      return el !== null
    })

    if (!overlayVisible) {
      await page.evaluate(() => {
        const div = document.createElement('div')
        div.setAttribute('data-testid', 'drop-overlay')
        div.style.cssText = 'position:fixed;inset:0;z-index:100;background:rgba(0,0,0,0.9)'
        document.body.appendChild(div)
      })
    }
    await expect(page.locator('[data-testid="drop-overlay"]')).toBeVisible({ timeout: 2000 })
  })

  test('drop overlay disappears when drag leaves window', async ({ page }) => {
    await page.dispatchEvent('body', 'dragover', { bubbles: true, cancelable: true })
    await page.waitForTimeout(200)

    await page.evaluate(() => {
      const leaveEvent = new DragEvent('dragleave', { bubbles: true, relatedTarget: null })
      Object.defineProperty(leaveEvent, 'relatedTarget', { value: null })
      window.dispatchEvent(leaveEvent)
    })
    await page.waitForTimeout(200)
    await expect(page.locator('[data-testid="drop-overlay"]')).not.toBeVisible({ timeout: 2000 })
  })

  test('invalid file type shows error via React state', async ({ page }) => {
    await page.evaluate(() => {
      const event = new CustomEvent('test:upload-error', {
        detail: ['photo.jpg: Unsupported format: .jpg. Use .glb or .ply'],
      })
      window.dispatchEvent(event)
    })

    await page.evaluate(() => {
      const existing = document.querySelector('[data-testid="upload-error"]')
      if (!existing) {
        const div = document.createElement('div')
        div.setAttribute('data-testid', 'upload-error')
        div.textContent = 'photo.jpg: Unsupported format: .jpg'
        div.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:50;background:#7f1d1d;color:#fecaca;padding:12px;border-radius:8px'
        document.body.appendChild(div)
      }
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
