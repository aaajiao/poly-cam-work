import { test, expect } from '@playwright/test'

test('app loads and renders layout', async ({ page }) => {
  await page.goto('/')

  await page.waitForSelector('[data-testid="sidebar"]', { timeout: 10000 })

  await expect(page.locator('[data-testid="sidebar"]')).toBeVisible()
  await expect(page.locator('[data-testid="toolbar"]')).toBeVisible()
  await expect(page.locator('[data-testid="canvas-container"]')).toBeVisible()
  await expect(page.locator('[data-testid="statusbar"]')).toBeVisible()

  const bg = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="canvas-container"]')
    return el ? window.getComputedStyle(el).backgroundColor : null
  })
  expect(bg).toBeTruthy()
})

test('sidebar toggle works', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('[data-testid="scene-canvas"]', { timeout: 15000 })

  const sidebar = page.locator('[data-testid="sidebar"]')
  const initialBox = await sidebar.boundingBox()
  expect(initialBox?.width).toBeGreaterThan(200)

  await page.click('[data-testid="sidebar-toggle"]')
  await page.waitForTimeout(400)

  const collapsedBox = await sidebar.boundingBox()
  expect(collapsedBox?.width).toBeLessThan(100)
})
