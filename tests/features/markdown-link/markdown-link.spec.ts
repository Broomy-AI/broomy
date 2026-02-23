/**
 * Feature Documentation: Markdown Links Open in External Browser
 *
 * Demonstrates that clicking a markdown link in the MarkdownViewer opens the
 * URL in the user's default browser instead of navigating the Electron window.
 *
 * Run with: pnpm test:feature-docs markdown-link
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
  await page.waitForTimeout(3000)
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'Markdown Links Open in External Browser',
      description:
        'Clicking a link in the markdown preview opens the URL in the default browser ' +
        'instead of navigating the Electron window away from Broomy.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)

  if (electronApp) {
    await electronApp.close()
  }
})

test.describe.serial('Feature: Markdown Links Open in External Browser', () => {
  test('Step 1: Open explorer and navigate to README.md', async () => {
    // Open the explorer panel
    const explorerButton = page.locator('[data-panel-id="explorer-toggle"], [title*="Explorer"]').first()
    if (await explorerButton.isVisible()) {
      const cls = await explorerButton.getAttribute('class').catch(() => '')
      if (!cls?.includes('bg-accent')) {
        await explorerButton.click()
        await page.waitForTimeout(300)
      }
    }

    const explorerPanel = page.locator('[data-panel-id="explorer"]')
    await expect(explorerPanel).toBeVisible()

    // Click README.md to open it
    const readmeEntry = explorerPanel.locator('text=README.md').first()
    await expect(readmeEntry).toBeVisible()
    await readmeEntry.click()
    await page.waitForTimeout(1500)

    // The file viewer should show the markdown preview
    const fileViewer = page.locator('[data-panel-id="fileViewer"]')
    await expect(fileViewer).toBeVisible()

    await screenshotElement(page, fileViewer, path.join(SCREENSHOTS, '01-markdown-preview.png'), {
      maxHeight: 500,
    })
    steps.push({
      screenshotPath: 'screenshots/01-markdown-preview.png',
      caption: 'README.md rendered in the markdown preview',
      description:
        'Clicking README.md in the explorer opens it in the markdown preview viewer. ' +
        'Notice the rendered links in the Contributing and Resources sections.',
    })
  })

  test('Step 2: Verify link is rendered and clickable', async () => {
    const fileViewer = page.locator('[data-panel-id="fileViewer"]')

    // Find a rendered link in the markdown preview
    const link = fileViewer.locator('a[href="https://docs.example.com/api"]').first()
    await expect(link).toBeVisible({ timeout: 5000 })

    // Verify the link text
    await expect(link).toHaveText('API documentation')

    await screenshotElement(page, fileViewer, path.join(SCREENSHOTS, '02-link-visible.png'), {
      maxHeight: 500,
    })
    steps.push({
      screenshotPath: 'screenshots/02-link-visible.png',
      caption: 'Markdown links are rendered as clickable elements',
      description:
        'Links in the markdown preview are styled as clickable anchor elements. ' +
        'Clicking them calls window.shell.openExternal() to open in the default browser ' +
        'instead of navigating the Electron window.',
    })
  })

  test('Step 3: Click link and verify app stays intact', async () => {
    const fileViewer = page.locator('[data-panel-id="fileViewer"]')
    const link = fileViewer.locator('a[href="https://docs.example.com/api"]').first()

    // Click the link
    await link.click()
    await page.waitForTimeout(500)

    // Verify the app UI is still showing (not navigated away)
    const rootDiv = page.locator('#root > div')
    await expect(rootDiv).toBeVisible()
    await expect(fileViewer).toBeVisible()

    await screenshotElement(page, fileViewer, path.join(SCREENSHOTS, '03-app-intact.png'), {
      maxHeight: 500,
    })
    steps.push({
      screenshotPath: 'screenshots/03-app-intact.png',
      caption: 'App remains intact after clicking a link',
      description:
        'After clicking the link, the Broomy UI is still fully visible and functional. ' +
        'The link opens in the external browser instead of replacing the app window.',
    })
  })
})
