import { test, expect } from '@playwright/test'

test.describe('3D Viewer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('[data-testid="scene-canvas"]', { timeout: 15000 })
  })

  test('canvas renders and is not blank', async ({ page }) => {
    // Wait for canvas element
    const canvas = page.locator('canvas')
    await expect(canvas).toBeVisible({ timeout: 10000 })

    // Canvas should have non-zero dimensions
    const box = await canvas.boundingBox()
    expect(box?.width).toBeGreaterThan(100)
    expect(box?.height).toBeGreaterThan(100)
  })

  test('view mode toggle switches between mesh and point cloud', async ({ page }) => {
    // Check view mode toggle exists
    await expect(page.locator('[data-testid="view-mode-toggle"]')).toBeVisible()

    // Default should be mesh mode
    const meshBtn = page.locator('[data-testid="view-mode-mesh"]')
    await expect(meshBtn).toHaveClass(/bg-blue-600/)

    // Switch to point cloud
    await page.click('[data-testid="view-mode-pointcloud"]')
    await expect(page.locator('[data-testid="view-mode-pointcloud"]')).toHaveClass(/bg-blue-600/)
    await expect(meshBtn).not.toHaveClass(/bg-blue-600/)

    // Switch to both
    await page.click('[data-testid="view-mode-both"]')
    await expect(page.locator('[data-testid="view-mode-both"]')).toHaveClass(/bg-blue-600/)
  })

  test('file manager shows 3 preset scans', async ({ page }) => {
    const scanList = page.locator('[data-testid="scan-list"]')
    await expect(scanList).toBeVisible()

    // Should have 3 scan items
    const items = scanList.locator('button')
    await expect(items).toHaveCount(3)

    // First scan should be active by default
    await expect(page.locator('[data-testid="scene-item-scan-a"]')).toBeVisible()
    await expect(page.locator('[data-testid="scene-item-scan-b"]')).toBeVisible()
    await expect(page.locator('[data-testid="scene-item-scan-c"]')).toBeVisible()
  })

  test('clicking a scan switches active scene', async ({ page }) => {
    // Click scan-b
    await page.click('[data-testid="scene-item-scan-b"]')

    // scan-b should now be active (has Active badge)
    const scanBItem = page.locator('[data-testid="scene-item-scan-b"]')
    await expect(scanBItem).toHaveClass(/bg-blue-600/)
  })

  test('sidebar collapses and expands', async ({ page }) => {
    const sidebar = page.locator('[data-testid="sidebar"]')
    const initialBox = await sidebar.boundingBox()
    expect(initialBox?.width).toBeGreaterThan(200)

    // Collapse
    await page.click('[data-testid="sidebar-toggle"]')
    await page.waitForTimeout(300)
    const collapsedBox = await sidebar.boundingBox()
    expect(collapsedBox?.width).toBeLessThan(100)

    // Expand
    await page.click('[data-testid="sidebar-toggle"]')
    await page.waitForTimeout(300)
    const expandedBox = await sidebar.boundingBox()
    expect(expandedBox?.width).toBeGreaterThan(200)
  })
})
