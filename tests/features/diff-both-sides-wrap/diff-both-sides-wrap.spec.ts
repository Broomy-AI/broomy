/**
 * Feature Documentation: Both Diff Panes Word-Wrap
 *
 * Verifies that in side-by-side diff view, BOTH the original (left) and
 * modified (right) panes wrap long lines. Previously the right pane wrapped
 * but the left pane did not, causing horizontal scrolling on one side only.
 *
 * Run with: pnpm test:feature-docs diff-both-sides-wrap
 */
import { test, expect, resetApp } from '../_shared/electron-fixture'
import type { Page } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { screenshotElement, waitForDiffEditor } from '../_shared/screenshot-helpers'
import { generateFeaturePage, generateIndex, FeatureStep } from '../_shared/template'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const FEATURE_DIR = __dirname
const SCREENSHOTS = path.join(FEATURE_DIR, 'screenshots')
const FEATURES_ROOT = path.join(__dirname, '..')

let page: Page
const steps: FeatureStep[] = []

async function openSourceControl(page: Page) {
  const explorerButton = page.locator('[data-panel-id="explorer-toggle"], [title*="Explorer"]').first()
  if (await explorerButton.isVisible()) {
    const cls = await explorerButton.getAttribute('class').catch(() => '')
    if (!cls?.includes('bg-accent')) {
      await explorerButton.click()
      await expect(page.locator('[data-panel-id="explorer"]')).toBeVisible()
    }
  }

  await page.evaluate(() => {
    const store = (window as Record<string, unknown>).__sessionStore as {
      getState: () => { activeSessionId: string; setExplorerFilter: (id: string, filter: string) => void }
    }
    if (!store) return
    const state = store.getState()
    state.setExplorerFilter(state.activeSessionId, 'source-control')
  })
  await expect(page.locator('[data-panel-id="explorer"]').getByText(/^Changes \(/)).toBeVisible()
}

/**
 * Compares each pane's rendered .view-lines width with its container width.
 * Wrap is working when view-lines fit inside the container; if a pane is
 * un-wrapped, its content overflows horizontally (view-lines width >>
 * container width).
 */
async function paneWrapState(page: Page) {
  return page.evaluate(() => {
    const measure = (side: 'original' | 'modified') => {
      const root = document.querySelector(`.${side}-in-monaco-diff-editor`) as HTMLElement | null
      const viewLines = root?.querySelector('.view-lines') as HTMLElement | null
      return {
        container: root?.offsetWidth ?? 0,
        viewLines: viewLines?.offsetWidth ?? 0,
      }
    }
    return { original: measure('original'), modified: measure('modified') }
  })
}

test.beforeAll(async () => {
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true })
  ;({ page } = await resetApp())
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'Both Diff Panes Word-Wrap',
      description:
        'In side-by-side diff view, both the original (left) and modified (right) panes wrap long lines. ' +
        'Previously the right pane would wrap while the left pane scrolled horizontally, making changes hard to align visually.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: Both Diff Panes Word-Wrap', () => {
  test('Step 1: Open source control and locate modified README.md', async () => {
    await openSourceControl(page)

    const readmeEntry = page.locator('text=README.md').first()
    await expect(readmeEntry).toBeVisible()

    const explorerPanel = page.locator('[data-panel-id="explorer"]')
    await screenshotElement(page, explorerPanel, path.join(SCREENSHOTS, '01-source-control.png'), {
      maxHeight: 400,
    })
    steps.push({
      screenshotPath: 'screenshots/01-source-control.png',
      caption: 'README.md appears as modified in source control',
      description:
        'The mock E2E repository has a README with long paragraphs on both the original and the modified ' +
        'side. Clicking the entry opens it in the diff viewer.',
    })
  })

  test('Step 2: Open diff and verify both panes wrap their long lines', async () => {
    const readmeEntry = page.locator('text=README.md').first()
    await readmeEntry.click()

    const fileViewerArea = page.locator('[data-panel-id="fileViewer"]').first()
    await waitForDiffEditor(fileViewerArea)

    const widths = await paneWrapState(page)

    // Sanity: both panes have a measurable container.
    expect(widths.original.container).toBeGreaterThan(50)
    expect(widths.modified.container).toBeGreaterThan(50)

    // When wrap is working, .view-lines fits inside the pane container.
    // When the bug is present, the left pane's content overflows to ~2x its
    // container width (since the long line renders un-wrapped). A 1.5x cushion
    // catches the bug while tolerating gutter/sash padding.
    expect(widths.original.viewLines).toBeLessThan(widths.original.container * 1.5)
    expect(widths.modified.viewLines).toBeLessThan(widths.modified.container * 1.5)

    await screenshotElement(page, fileViewerArea, path.join(SCREENSHOTS, '02-both-panes-wrap.png'))
    steps.push({
      screenshotPath: 'screenshots/02-both-panes-wrap.png',
      caption: 'Long lines wrap on both the left (original) and right (modified) panes',
      description:
        'Both panes break long sentences across multiple visual lines, keeping the diff readable without ' +
        'horizontal scrolling. The test asserts this programmatically by comparing each pane\'s rendered ' +
        'view-lines width against its container width.',
    })
  })

  test('Step 3: Switch to inline mode — content still wraps', async () => {
    const inlineButton = page.locator('button[title="Switch to inline view"]')
    if (await inlineButton.isVisible()) {
      await inlineButton.click()
    }

    const fileViewerArea = page.locator('[data-panel-id="fileViewer"]').first()
    await waitForDiffEditor(fileViewerArea)

    const widths = await paneWrapState(page)
    // In inline mode only the modified pane is shown — assert it still wraps.
    expect(widths.modified.container).toBeGreaterThan(50)
    expect(widths.modified.viewLines).toBeLessThan(widths.modified.container * 1.5)

    await screenshotElement(page, fileViewerArea, path.join(SCREENSHOTS, '03-inline-wrap.png'))
    steps.push({
      screenshotPath: 'screenshots/03-inline-wrap.png',
      caption: 'Inline diff mode also wraps long lines',
      description:
        'In inline mode the original pane is hidden — only the modified pane renders, and it continues ' +
        'to wrap long lines as expected.',
    })
  })
})
