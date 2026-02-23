/**
 * Feature Documentation: File Outline
 *
 * Shows the outline (symbol list) feature in the file viewer. When viewing
 * a TypeScript file, clicking the outline button opens Monaco's quick outline
 * widget listing all symbols (functions, constants, etc.) in the file.
 *
 * Run with: pnpm test:feature-docs
 */
import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { screenshotElement, screenshotRegion } from '../_shared/screenshot-helpers'
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
      SCREENSHOT_MODE: 'true',
      E2E_HEADLESS: process.env.E2E_HEADLESS ?? 'true',
    },
  })

  page = await electronApp.firstWindow()
  await page.setViewportSize({ width: 1400, height: 900 })
  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector('#root > div', { timeout: 15000 })

  // Wait for app to fully initialize
  await page.waitForTimeout(3000)
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'File Outline',
      description:
        'The file viewer toolbar includes an outline button that opens a quick symbol list ' +
        'for the current file. This lets you jump to any function, class, or constant in the file ' +
        'without scrolling. The outline uses Monaco Editor\'s built-in language intelligence, so it ' +
        'works for TypeScript, JavaScript, JSON, and other supported languages.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)

  if (electronApp) {
    await electronApp.close()
  }
})

test.describe.serial('Feature: File Outline', () => {
  test('Step 1: Open the explorer and navigate to a TypeScript file', async () => {
    // Open the explorer panel
    const explorerButton = page.locator('button:has-text("Explorer")')
    await expect(explorerButton).toBeVisible()
    await explorerButton.click()
    await page.waitForTimeout(500)

    const explorerPanel = page.locator('[data-panel-id="explorer"]')
    await expect(explorerPanel).toBeVisible()

    // Expand src directory
    const srcFolder = explorerPanel.locator('text=src').first()
    await srcFolder.click()
    await page.waitForTimeout(300)

    // Expand middleware directory
    const middlewareFolder = explorerPanel.locator('text=middleware').first()
    await middlewareFolder.click()
    await page.waitForTimeout(300)

    // Click auth.ts to open it in the file viewer
    const authFile = explorerPanel.locator('text=auth.ts').first()
    await authFile.click()
    await page.waitForTimeout(1500)

    // File viewer should now be visible
    const fileViewer = page.locator('[data-panel-id="fileViewer"]')
    await expect(fileViewer).toBeVisible()

    await screenshotElement(page, fileViewer, path.join(SCREENSHOTS, '01-file-open.png'), {
      maxHeight: 500,
    })
    steps.push({
      screenshotPath: 'screenshots/01-file-open.png',
      caption: 'TypeScript file open in the file viewer',
      description:
        'The auth.ts middleware file is open in the file viewer. The toolbar at the top shows ' +
        'the file name and several action buttons, including the outline button (list icon).',
    })
  })

  test('Step 2: Locate the outline button in the toolbar', async () => {
    // The outline button should be visible
    const outlineButton = page.locator('button[title="Outline (symbol list)"]')
    await expect(outlineButton).toBeVisible()

    // Screenshot the toolbar area to highlight the outline button
    const toolbar = page.locator('[data-panel-id="fileViewer"]').locator('.flex-shrink-0').first()
    await screenshotElement(page, toolbar, path.join(SCREENSHOTS, '02-toolbar-outline-button.png'))
    steps.push({
      screenshotPath: 'screenshots/02-toolbar-outline-button.png',
      caption: 'The outline button in the file viewer toolbar',
      description:
        'The outline button (list icon) appears in the file viewer toolbar when a code file is open. ' +
        'Hovering over it shows the tooltip "Outline (symbol list)".',
    })
  })

  test('Step 3: Click the outline button to open the symbol list', async () => {
    const outlineButton = page.locator('button[title="Outline (symbol list)"]')
    await outlineButton.click()

    // Wait for the quick outline widget to appear
    // Monaco's quick outline uses the quick-input-widget class
    const quickInput = page.locator('.quick-input-widget:visible')
    await expect(quickInput).toBeVisible({ timeout: 5000 })

    // Wait a moment for the symbol list to populate
    await page.waitForTimeout(1000)

    // Verify symbol entries are shown
    const symbolRows = page.locator('.quick-input-list .monaco-list-row')
    const count = await symbolRows.count()
    expect(count).toBeGreaterThan(0)

    // Screenshot the file viewer with the outline widget open
    const fileViewer = page.locator('[data-panel-id="fileViewer"]')
    await screenshotElement(page, fileViewer, path.join(SCREENSHOTS, '03-outline-open.png'), {
      maxHeight: 500,
    })
    steps.push({
      screenshotPath: 'screenshots/03-outline-open.png',
      caption: 'Outline widget showing symbols in the file',
      description:
        'After clicking the outline button, a quick-access widget appears at the top of the editor ' +
        'listing all symbols defined in the file — functions, constants, and other definitions. ' +
        'You can type to filter the list and press Enter to jump to a symbol.',
    })
  })

  test('Step 4: Dismiss and reopen with keyboard', async () => {
    // Press Escape to close the outline
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)

    // The quick input widget should be hidden
    const quickInput = page.locator('.quick-input-widget:visible')
    await expect(quickInput).not.toBeVisible()

    // Click the outline button again to reopen
    const outlineButton = page.locator('button[title="Outline (symbol list)"]')
    await outlineButton.click()

    const reopenedWidget = page.locator('.quick-input-widget:visible')
    await expect(reopenedWidget).toBeVisible({ timeout: 5000 })
    await page.waitForTimeout(500)

    const fileViewer = page.locator('[data-panel-id="fileViewer"]')
    await screenshotElement(page, fileViewer, path.join(SCREENSHOTS, '04-outline-reopened.png'), {
      maxHeight: 500,
    })
    steps.push({
      screenshotPath: 'screenshots/04-outline-reopened.png',
      caption: 'Outline can be dismissed and reopened',
      description:
        'Press Escape to dismiss the outline, then click the button again to reopen it. ' +
        'The outline reliably opens each time, even after the editor loses and regains focus.',
    })
  })
})
