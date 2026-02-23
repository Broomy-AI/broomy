/**
 * Feature Documentation: Diff View Word Wrap
 *
 * Demonstrates that the Monaco diff editor wraps long lines, which is
 * especially useful for markdown files where paragraphs are often a single
 * long line.
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

/** Navigate the explorer panel to the source-control tab */
async function openSourceControl(page: Page) {
  // Ensure explorer panel is open
  const explorerButton = page.locator('[data-panel-id="explorer-toggle"], [title*="Explorer"]').first()
  if (await explorerButton.isVisible()) {
    const cls = await explorerButton.getAttribute('class').catch(() => '')
    if (!cls?.includes('bg-accent')) {
      await explorerButton.click()
      await page.waitForTimeout(300)
    }
  }

  // Switch to source-control filter via store
  await page.evaluate(() => {
    const store = (window as Record<string, unknown>).__sessionStore as {
      getState: () => { activeSessionId: string; setExplorerFilter: (id: string, filter: string) => void }
    }
    if (!store) return
    const state = store.getState()
    state.setExplorerFilter(state.activeSessionId, 'source-control')
  })
  await page.waitForTimeout(500)
}

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
      title: 'Diff View Word Wrap',
      description:
        'The Monaco diff editor now wraps long lines instead of requiring horizontal scrolling. ' +
        'This is especially useful for markdown files where paragraphs are often written as single long lines.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)

  if (electronApp) {
    await electronApp.close()
  }
})

test.describe.serial('Feature: Diff View Word Wrap', () => {
  test('Step 1: Open source control and see modified README.md', async () => {
    await openSourceControl(page)

    // Verify the source control view shows the README.md as modified
    const readmeEntry = page.locator('text=README.md').first()
    await expect(readmeEntry).toBeVisible()

    const explorerPanel = page.locator('[data-panel-id="explorer"]')
    await screenshotElement(page, explorerPanel, path.join(SCREENSHOTS, '01-source-control.png'), {
      maxHeight: 400,
    })
    steps.push({
      screenshotPath: 'screenshots/01-source-control.png',
      caption: 'Source control shows README.md as modified',
      description:
        'The source control panel lists files with changes. README.md appears ' +
        'in the changes section, ready to be clicked to view its diff.',
    })
  })

  test('Step 2: Click README.md to open diff view with word wrap', async () => {
    // Click on README.md to open it in diff mode
    const readmeEntry = page.locator('text=README.md').first()
    await readmeEntry.click()
    await page.waitForTimeout(1000)

    // The file viewer should now be showing the diff
    // Look for the Monaco diff editor container
    const diffEditor = page.locator('.monaco-diff-editor').first()
    await expect(diffEditor).toBeVisible({ timeout: 10000 })

    // Screenshot the entire file viewer area (right side of the layout)
    const fileViewerArea = page.locator('[data-panel-id="fileViewer"]').first()
    if (await fileViewerArea.isVisible()) {
      await screenshotElement(page, fileViewerArea, path.join(SCREENSHOTS, '02-diff-word-wrap.png'))
    } else {
      // Fallback: screenshot the diff editor itself
      await screenshotElement(page, diffEditor, path.join(SCREENSHOTS, '02-diff-word-wrap.png'))
    }
    steps.push({
      screenshotPath: 'screenshots/02-diff-word-wrap.png',
      caption: 'Diff view with word-wrapped long lines',
      description:
        'The diff view shows the README.md changes with long paragraphs wrapping within the editor ' +
        'instead of extending off-screen. This makes it easy to read markdown diffs without horizontal scrolling.',
    })
  })

  test('Step 3: Switch to inline diff to show word wrap there too', async () => {
    // Click the side-by-side toggle to switch to inline mode
    const inlineButton = page.locator('button[title="Switch to inline view"]')
    if (await inlineButton.isVisible()) {
      await inlineButton.click()
      await page.waitForTimeout(500)
    }

    const diffEditor = page.locator('.monaco-diff-editor').first()
    await expect(diffEditor).toBeVisible({ timeout: 5000 })

    const fileViewerArea = page.locator('[data-panel-id="fileViewer"]').first()
    if (await fileViewerArea.isVisible()) {
      await screenshotElement(page, fileViewerArea, path.join(SCREENSHOTS, '03-inline-diff-wrap.png'))
    } else {
      await screenshotElement(page, diffEditor, path.join(SCREENSHOTS, '03-inline-diff-wrap.png'))
    }
    steps.push({
      screenshotPath: 'screenshots/03-inline-diff-wrap.png',
      caption: 'Inline diff view also wraps long lines',
      description:
        'The inline diff mode wraps long lines as well, showing additions and deletions ' +
        'in a single column with full word wrap support.',
    })
  })
})
