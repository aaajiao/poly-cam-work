import { test, expect } from '@playwright/test'

test.describe('Tool Modes', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('[data-testid="tool-buttons"]', { timeout: 15000 })
  })

  test('orbit tool is active by default', async ({ page }) => {
    const orbitBtn = page.locator('[data-testid="tool-orbit"]')
    await expect(orbitBtn).toBeVisible()
    await expect(orbitBtn).toHaveClass(/bg-blue-600/)
  })

  test('clicking measure tool activates it', async ({ page }) => {
    await page.click('[data-testid="tool-measure"]')
    await expect(page.locator('[data-testid="tool-measure"]')).toHaveClass(/bg-blue-600/)
    await expect(page.locator('[data-testid="tool-orbit"]')).not.toHaveClass(/bg-blue-600/)
  })

  test('clicking clip toggle enables clipping', async ({ page }) => {
    await page.click('[data-testid="clip-toggle"]')
    await expect(page.locator('[data-testid="clip-toggle"]')).toHaveClass(/bg-blue-600/)
  })

  test('clicking clip toggle twice disables clipping', async ({ page }) => {
    await page.click('[data-testid="clip-toggle"]')
    await expect(page.locator('[data-testid="clip-toggle"]')).toHaveClass(/bg-blue-600/)
    await page.click('[data-testid="clip-toggle"]')
    await expect(page.locator('[data-testid="clip-toggle"]')).not.toHaveClass(/bg-blue-600/)
  })

  test('clip toggle does not change active tool mode', async ({ page }) => {
    await expect(page.locator('[data-testid="tool-orbit"]')).toHaveClass(/bg-blue-600/)
    await page.click('[data-testid="clip-toggle"]')
    await expect(page.locator('[data-testid="tool-orbit"]')).toHaveClass(/bg-blue-600/)
  })

  test('clicking annotate tool activates it', async ({ page }) => {
    await page.click('[data-testid="tool-annotate"]')
    await expect(page.locator('[data-testid="tool-annotate"]')).toHaveClass(/bg-blue-600/)
  })

  test('keyboard shortcut M activates measure tool', async ({ page }) => {
    await page.keyboard.press('m')
    await expect(page.locator('[data-testid="tool-measure"]')).toHaveClass(/bg-blue-600/)
  })

  test('keyboard shortcut C toggles clipping', async ({ page }) => {
    await page.keyboard.press('c')
    await expect(page.locator('[data-testid="clip-toggle"]')).toHaveClass(/bg-blue-600/)
    await page.keyboard.press('c')
    await expect(page.locator('[data-testid="clip-toggle"]')).not.toHaveClass(/bg-blue-600/)
  })

  test('keyboard shortcut A activates annotate tool', async ({ page }) => {
    await page.keyboard.press('a')
    await expect(page.locator('[data-testid="tool-annotate"]')).toHaveClass(/bg-blue-600/)
  })

  test('Escape returns to orbit tool', async ({ page }) => {
    await page.keyboard.press('m')
    await expect(page.locator('[data-testid="tool-measure"]')).toHaveClass(/bg-blue-600/)

    await page.keyboard.press('Escape')
    await expect(page.locator('[data-testid="tool-orbit"]')).toHaveClass(/bg-blue-600/)
  })

  test('screenshot button exists in toolbar', async ({ page }) => {
    await expect(page.locator('[data-testid="screenshot-btn"]')).toBeVisible()
  })

  test('clip controls appear in sidebar when clipping enabled', async ({ page }) => {
    await page.click('[data-testid="clip-toggle"]')
    await expect(page.locator('[data-testid="clip-controls"]')).toBeVisible()
  })
})
