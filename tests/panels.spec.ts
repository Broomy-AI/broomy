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

// ── Toolbar Panel Buttons ──────────────────────────────────────────────────

test.describe('Toolbar Panels', () => {
  test('should display all expected toolbar buttons', async () => {
    // The toolbar should have buttons for Sessions (Sidebar), Explorer, Settings, and Guide
    const sessionsBtn = page.locator('button[title*="Sessions"]')
    const explorerBtn = page.locator('button[title*="Explorer"]')
    const settingsBtn = page.locator('button[title*="Settings"]')
    const guideBtn = page.locator('button[title*="Guide"]')

    await expect(sessionsBtn).toBeVisible()
    await expect(explorerBtn).toBeVisible()
    await expect(settingsBtn).toBeVisible()
    await expect(guideBtn).toBeVisible()
  })

  test('should toggle Explorer panel on and off', async () => {
    const explorerBtn = page.locator('button[title*="Explorer"]')
    const explorerPanel = page.locator('[data-panel-id="explorer"]')

    // Open
    await explorerBtn.click()
    await expect(explorerPanel).toBeVisible()

    // Button should be highlighted (active state has bg-accent)
    await expect(explorerBtn).toHaveClass(/bg-accent/)

    // Close
    await explorerBtn.click()
    await expect(explorerPanel).not.toBeVisible()
    await expect(explorerBtn).not.toHaveClass(/bg-accent/)
  })

  test('should toggle Settings panel on and off', async () => {
    const settingsBtn = page.locator('button[title*="Settings"]')
    const settingsPanel = page.locator('[data-panel-id="settings"]')

    // Open
    await settingsBtn.click()
    await expect(settingsPanel).toBeVisible()
    await expect(settingsBtn).toHaveClass(/bg-accent/)

    // Close
    await settingsBtn.click()
    await expect(settingsPanel).not.toBeVisible()
    await expect(settingsBtn).not.toHaveClass(/bg-accent/)
  })

  test('should toggle Guide panel on and off', async () => {
    const guideBtn = page.locator('button[title*="Guide"]')
    const tutorialPanel = page.locator('[data-panel-id="tutorial"]')

    // Open
    await guideBtn.click()
    await expect(tutorialPanel).toBeVisible()
    await expect(guideBtn).toHaveClass(/bg-accent/)

    // Close
    await guideBtn.click()
    await expect(tutorialPanel).not.toBeVisible()
    await expect(guideBtn).not.toHaveClass(/bg-accent/)
  })

  test('should toggle Sidebar visibility', async () => {
    const sessionsBtn = page.locator('button[title*="Sessions"]')
    const sidebar = page.locator('[data-panel-id="sidebar"]')

    // Sidebar should be visible by default
    await expect(sidebar).toBeVisible()

    // Hide sidebar
    await sessionsBtn.click()
    await expect(sidebar).not.toBeVisible()

    // Show sidebar again
    await sessionsBtn.click()
    await expect(sidebar).toBeVisible()
  })
})

// ── Settings Panel Content ─────────────────────────────────────────────────

test.describe('Settings Panel', () => {
  test('should display agents and repos', async () => {
    const settingsBtn = page.locator('button[title*="Settings"]')
    await settingsBtn.click()

    const settingsPanel = page.locator('[data-panel-id="settings"]')
    await expect(settingsPanel).toBeVisible()

    // Should show "Settings" heading on root screen
    await expect(settingsPanel.locator('h2:has-text("Settings")')).toBeVisible()

    // Root screen shows nav rows for Agents and Repositories
    await expect(settingsPanel.locator('text=Manage Agents')).toBeVisible()
    await expect(settingsPanel.locator('h3:has-text("Repositories")')).toBeVisible()
    await expect(settingsPanel.locator('text=demo-project').first()).toBeVisible()

    // Navigate to agents sub-screen
    await settingsPanel.locator('[data-testid="nav-agents"]').click()
    await expect(settingsPanel.locator('h2:has-text("Agents")')).toBeVisible()

    // Should display the default agents from mock config
    await expect(settingsPanel.locator('text=Claude Code')).toBeVisible()
    await expect(settingsPanel.locator('text=Codex').first()).toBeVisible()
    await expect(settingsPanel.locator('text=Gemini CLI')).toBeVisible()
    await expect(settingsPanel.locator('text=GitHub Copilot')).toBeVisible()

    // Should show "+ Add Agent" button
    await expect(settingsPanel.locator('button:has-text("+ Add Agent")')).toBeVisible()

    // Navigate back to root
    await settingsPanel.locator('[data-testid="settings-back"]').click()
    await expect(settingsPanel.locator('h2:has-text("Settings")')).toBeVisible()

    // Close settings
    await settingsBtn.click()
  })

  test('should persist across session switches (global panel)', async () => {
    const settingsBtn = page.locator('button[title*="Settings"]')
    await settingsBtn.click()

    const settingsPanel = page.locator('[data-panel-id="settings"]')
    await expect(settingsPanel).toBeVisible()

    // Switch session
    const backendSession = page.locator('.cursor-pointer:has-text("backend-api")')
    await backendSession.click()
    await expect(backendSession).toHaveClass(/bg-accent\/15/)

    // Settings should still be visible
    await expect(settingsPanel).toBeVisible()

    // Switch back and close
    const broomySession = page.locator('.cursor-pointer:has-text("broomy")')
    await broomySession.click()
    await settingsBtn.click()
  })
})

// ── Explorer Panel Content ─────────────────────────────────────────────────

test.describe('Explorer Panel', () => {
  test('should show file tree with mock files', async () => {
    const explorerBtn = page.locator('button[title*="Explorer"]')
    await explorerBtn.click()

    const explorerPanel = page.locator('[data-panel-id="explorer"]')
    await expect(explorerPanel).toBeVisible()

    // Switch to Files filter (default is source-control)
    const filesButton = explorerPanel.locator('button[title="Files"]')
    await filesButton.click()

    // The default E2E mock returns src (dir), package.json, README.md
    await expect(explorerPanel.locator('text=src').first()).toBeVisible()
    await expect(explorerPanel.locator('text=package.json').first()).toBeVisible()
  })

  test('should show source control filter with changed files', async () => {
    const explorerPanel = page.locator('[data-panel-id="explorer"]')

    // Click Source Control filter button
    const scButton = explorerPanel.locator('button[title="Source Control"]')
    await scButton.click()

    // Should show mock changed files: src/index.ts and README.md (from non-screenshot E2E mock)
    await expect(explorerPanel.locator('text=src/index.ts').first()).toBeVisible({ timeout: 5000 })
    await expect(explorerPanel.locator('text=README.md').first()).toBeVisible()
  })

  test('should switch back to Files filter', async () => {
    const explorerPanel = page.locator('[data-panel-id="explorer"]')

    // Click Files filter button
    const filesButton = explorerPanel.locator('button[title="Files"]')
    await filesButton.click()

    // Should show file tree again (src folder)
    await expect(explorerPanel.locator('text=src').first()).toBeVisible()

    // Close explorer
    const explorerBtn = page.locator('button[title*="Explorer"]')
    await explorerBtn.click()
  })
})

// ── File Viewer ────────────────────────────────────────────────────────────

test.describe('File Viewer', () => {
  test('should open file viewer when clicking a file in explorer', async () => {
    // Open explorer
    const explorerBtn = page.locator('button[title*="Explorer"]')
    await explorerBtn.click()

    const explorerPanel = page.locator('[data-panel-id="explorer"]')
    await expect(explorerPanel).toBeVisible()

    // Switch to Files filter (default is source-control)
    const filesButton = explorerPanel.locator('button[title="Files"]')
    await filesButton.click()

    // Click on package.json in the file tree
    await explorerPanel.locator('text=package.json').first().click()

    // File viewer panel should appear (uses data-panel-id in LayoutContentArea)
    const fileViewer = page.locator('[data-panel-id="fileViewer"]')
    await expect(fileViewer).toBeVisible({ timeout: 10000 })

    // Should show the filename in the viewer header
    await expect(fileViewer.locator('text=package.json').first()).toBeVisible()
  })

  test('should close file viewer via keyboard shortcut', async () => {
    // File viewer is open from previous test, close it with Cmd+3
    await page.keyboard.press('Meta+3')
    const fileViewer = page.locator('[data-panel-id="fileViewer"]')
    await expect(fileViewer).not.toBeVisible()

    // Close explorer too
    const explorerBtn = page.locator('button[title*="Explorer"]')
    await explorerBtn.click()
  })
})
