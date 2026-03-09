import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'
import { dockerArgs } from './electron-launch-args'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let electronApp: ElectronApplication
let page: Page

test.beforeAll(async () => {
  electronApp = await electron.launch({
    args: [...dockerArgs, path.join(__dirname, '..', 'out', 'main', 'index.js')],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      E2E_TEST: 'true',
      E2E_HEADLESS: process.env.E2E_HEADLESS ?? 'true',
    },
  })
  page = await electronApp.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector('#root > div', { timeout: 10000 })
  // Wait for sessions to load
  await page.waitForSelector('.cursor-pointer', { timeout: 10000 })
})

test.afterAll(async () => {
  if (electronApp) await electronApp.close()
})

test.describe('Keyboard Shortcuts - Panel Toggles', () => {
  test('Cmd+1 should toggle first toolbar panel (Sessions/Sidebar)', async () => {
    const sidebar = page.locator('[data-panel-id="sidebar"]')
    await expect(sidebar).toBeVisible()

    // Hide sidebar
    await page.keyboard.press('Meta+1')
    await expect(sidebar).not.toBeVisible()

    // Show sidebar
    await page.keyboard.press('Meta+1')
    await expect(sidebar).toBeVisible()
  })

  test('Cmd+2 should toggle Explorer panel', async () => {
    const explorer = page.locator('[data-panel-id="explorer"]')
    await expect(explorer).not.toBeVisible()

    // Show explorer
    await page.keyboard.press('Meta+2')
    await expect(explorer).toBeVisible()

    // Hide explorer
    await page.keyboard.press('Meta+2')
    await expect(explorer).not.toBeVisible()
  })
})

test.describe('Keyboard Shortcuts - Session Navigation', () => {
  test('Alt+ArrowDown should move to next session', async () => {
    // Ensure broomy session is selected first
    const broomySession = page.locator('.cursor-pointer:has-text("broomy")')
    await broomySession.click()
    await expect(broomySession).toHaveClass(/bg-accent\/15/)

    // Move to next session
    await page.keyboard.press('Alt+ArrowDown')

    // backend-api should now be selected (active)
    const backendSession = page.locator('.cursor-pointer:has-text("backend-api")')
    await expect(backendSession).toHaveClass(/bg-accent\/15/)
  })

  test('Alt+ArrowUp should move to previous session', async () => {
    // Currently on backend-api, move back
    await page.keyboard.press('Alt+ArrowUp')

    // broomy should be selected again
    const broomySession = page.locator('.cursor-pointer:has-text("broomy")')
    await expect(broomySession).toHaveClass(/bg-accent\/15/)
  })
})

test.describe('Keyboard Shortcuts - New Session', () => {
  test('Cmd+N should open New Session dialog', async () => {
    await page.keyboard.press('Meta+n')

    // Dialog should appear
    await expect(page.locator('h2:has-text("New Session")')).toBeVisible()

    // Close it by clicking Cancel button (more reliable than Escape which can be captured by terminal)
    await page.locator('button:has-text("Cancel")').click()
    await expect(page.locator('h2:has-text("New Session")')).not.toBeVisible()
  })
})
