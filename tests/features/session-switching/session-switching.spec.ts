/**
 * Feature Documentation: Session Switching
 *
 * Exercises the flow of switching between sessions in the sidebar,
 * capturing screenshots at each stage to document the feature.
 *
 * Run with: pnpm test:feature-docs
 */
import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { screenshotElement } from '../_shared/screenshot-helpers'
import { generateFeaturePage, generateIndex, FeatureStep } from '../_shared/template'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const FEATURE_DIR = __dirname
const SCREENSHOTS = path.join(FEATURE_DIR, 'screenshots')
const FEATURES_ROOT = path.join(__dirname, '..')

let electronApp: ElectronApplication
let page: Page
const steps: FeatureStep[] = []

test.setTimeout(60000)

test.beforeAll(async () => {
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true })

  electronApp = await electron.launch({
    args: [path.join(__dirname, '..', '..', '..', 'out', 'main', 'index.js')],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      E2E_TEST: 'true',
      E2E_HEADLESS: process.env.E2E_HEADLESS ?? 'true',
    },
  })

  page = await electronApp.firstWindow()
  await page.setViewportSize({ width: 1400, height: 900 })
  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector('#root > div', { timeout: 15000 })

  // Wait for terminals to initialize
  await page.waitForTimeout(3000)
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'Session Switching',
      description:
        'Users can switch between coding sessions by clicking on them in the sidebar. ' +
        'Each session maintains its own terminal state, branch, and agent status. ' +
        'The active session is highlighted and its terminal is displayed in the main area.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)

  if (electronApp) {
    await electronApp.close()
  }
})

test.describe.serial('Feature: Session Switching', () => {
  test('Step 1: Initial state — multiple sessions in sidebar', async () => {
    const sidebar = page.locator('[data-panel-id="sidebar"]')
    await expect(sidebar).toBeVisible()

    // Verify multiple sessions exist
    const broomySession = page.locator('.cursor-pointer:has-text("broomy")')
    await expect(broomySession).toBeVisible()
    const backendSession = page.locator('.cursor-pointer:has-text("backend-api")')
    await expect(backendSession).toBeVisible()

    await screenshotElement(page, sidebar, path.join(SCREENSHOTS, '01-initial-sidebar.png'), {
      maxHeight: 600,
    })
    steps.push({
      screenshotPath: 'screenshots/01-initial-sidebar.png',
      caption: 'Initial sidebar with multiple sessions',
      description:
        'The sidebar shows all active sessions. Each card displays the repo name, branch, ' +
        'agent status (Idle/Working), and a status indicator dot.',
    })
  })

  test('Step 2: First session is selected — terminal visible', async () => {
    // The first session (broomy) should be selected by default
    const broomySession = page.locator('.cursor-pointer:has-text("broomy")')
    await expect(broomySession).toHaveClass(/bg-accent\/15/)

    // Agent terminal should show fake claude output
    const terminalText = await page.evaluate(() => {
      const viewport = document.querySelector('.xterm-rows')
      return viewport?.textContent || ''
    })
    expect(terminalText).toContain('FAKE_CLAUDE_READY')

    // Screenshot the terminal area
    const terminalArea = page.locator('.xterm').first()
    await screenshotElement(page, terminalArea, path.join(SCREENSHOTS, '02-first-session-terminal.png'))
    steps.push({
      screenshotPath: 'screenshots/02-first-session-terminal.png',
      caption: 'Terminal output for the initially selected session',
      description:
        'The main area shows the agent terminal for the active session. ' +
        'Here the fake Claude agent has started and is ready.',
    })
  })

  test('Step 3: Click a different session', async () => {
    const backendSession = page.locator('.cursor-pointer:has-text("backend-api")')
    await backendSession.click()
    await page.waitForTimeout(500)

    // Backend session should now be highlighted
    await expect(backendSession).toHaveClass(/bg-accent\/15/)

    // Previous session should no longer be highlighted
    const broomySession = page.locator('.cursor-pointer:has-text("broomy")')
    const broomyClasses = await broomySession.getAttribute('class')
    expect(broomyClasses).not.toContain('bg-accent/15')

    const sidebar = page.locator('[data-panel-id="sidebar"]')
    await screenshotElement(page, sidebar, path.join(SCREENSHOTS, '03-switched-session.png'), {
      maxHeight: 600,
    })
    steps.push({
      screenshotPath: 'screenshots/03-switched-session.png',
      caption: 'After clicking backend-api, it becomes the active session',
      description:
        'The highlight has moved from "broomy" to "backend-api". ' +
        'The terminal area now shows the backend-api agent terminal.',
    })
  })

  test('Step 4: Switch back — terminal state preserved', async () => {
    // Switch back to broomy
    const broomySession = page.locator('.cursor-pointer:has-text("broomy")')
    await broomySession.click()
    await page.waitForTimeout(500)

    await expect(broomySession).toHaveClass(/bg-accent\/15/)

    // Terminal state should be preserved — still shows the original output
    const terminalText = await page.evaluate(() => {
      const viewport = document.querySelector('.xterm-rows')
      return viewport?.textContent || ''
    })
    expect(terminalText).toContain('FAKE_CLAUDE_READY')

    const terminalArea = page.locator('.xterm').first()
    await screenshotElement(page, terminalArea, path.join(SCREENSHOTS, '04-preserved-terminal.png'))
    steps.push({
      screenshotPath: 'screenshots/04-preserved-terminal.png',
      caption: 'Switching back preserves terminal state',
      description:
        'After switching back to the "broomy" session, its terminal output is exactly as we left it. ' +
        'Terminal state is preserved across session switches — nothing is lost.',
    })
  })
})
