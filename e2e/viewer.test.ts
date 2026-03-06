import { test, expect, type Page } from '@playwright/test'

async function openSidebar(page: Page) {
  const sidebar = page.locator('[data-testid="sidebar"]')
  const box = await sidebar.boundingBox()
  if (box && box.width < 100) {
    await page.click('[data-testid="sidebar-toggle"]')
    await page.waitForTimeout(300)
  }
}

test.describe('3D Viewer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('[data-testid="scene-canvas"]', { timeout: 15000 })
  })

  test('canvas renders and is not blank', async ({ page }) => {
    const canvas = page.locator('canvas')
    await expect(canvas).toBeVisible({ timeout: 10000 })

    const box = await canvas.boundingBox()
    expect(box?.width).toBeGreaterThan(100)
    expect(box?.height).toBeGreaterThan(100)
  })

  test('view mode toggle switches between mesh and point cloud', async ({ page }) => {
    await expect(page.locator('[data-testid="view-mode-toggle"]')).toBeVisible()

    const meshBtn = page.locator('[data-testid="view-mode-mesh"]')
    await expect(meshBtn).toHaveClass(/bg-blue-600/)

    await page.click('[data-testid="view-mode-pointcloud"]')
    await expect(page.locator('[data-testid="view-mode-pointcloud"]')).toHaveClass(/bg-blue-600/)
    await expect(meshBtn).not.toHaveClass(/bg-blue-600/)

    await page.click('[data-testid="view-mode-both"]')
    await expect(page.locator('[data-testid="view-mode-both"]')).toHaveClass(/bg-blue-600/)
  })

  test('file manager shows 3 preset scans', async ({ page }) => {
    await openSidebar(page)

    const scanList = page.locator('[data-testid="scan-list"]')
    await expect(scanList).toBeVisible()

    const items = scanList.locator('button')
    await expect(items).toHaveCount(3)

    await expect(page.locator('[data-testid="scene-item-scan-a"]')).toBeVisible()
    await expect(page.locator('[data-testid="scene-item-scan-b"]')).toBeVisible()
    await expect(page.locator('[data-testid="scene-item-scan-c"]')).toBeVisible()
  })

  test('clicking a scan switches active scene', async ({ page }) => {
    await openSidebar(page)

    await page.click('[data-testid="scene-item-scan-b"]')

    const scanBItem = page.locator('[data-testid="scene-item-scan-b"]')
    await expect(scanBItem).toHaveClass(/bg-blue-600/)
  })

  test('sidebar starts collapsed and can toggle', async ({ page }) => {
    const sidebar = page.locator('[data-testid="sidebar"]')
    const initialBox = await sidebar.boundingBox()
    expect(initialBox?.width).toBeLessThan(100)

    await page.click('[data-testid="sidebar-toggle"]')
    await page.waitForTimeout(400)
    const expandedBox = await sidebar.boundingBox()
    expect(expandedBox?.width).toBeGreaterThan(200)

    await page.click('[data-testid="sidebar-toggle"]')
    await page.waitForTimeout(400)
    const collapsedBox = await sidebar.boundingBox()
    expect(collapsedBox?.width).toBeLessThan(100)
  })
})
