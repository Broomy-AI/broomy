/**
 * Feature Documentation: Highlight currently open file in explorer source-control views
 *
 * The Files tab in the Explorer already highlights the currently open file.
 * This walkthrough shows that the highlight now also appears in the three
 * Source Control views (Working changes, Branch changes, and Commits) so
 * the user can tell at a glance which file they have open while navigating
 * any of those views.
 *
 * Run with: pnpm test:feature-docs highlight-file-in-explorer
 */
import { test, expect, resetApp } from '../_shared/electron-fixture'
import type { Page } from '@playwright/test'
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

let page: Page
const steps: FeatureStep[] = []

/** Switch the explorer panel to a specific tab (files, source-control, etc.) */
async function setExplorerTab(filter: 'files' | 'source-control') {
  const explorerButton = page.locator('[data-panel-id="explorer-toggle"], [title*="Explorer"]').first()
  if (await explorerButton.isVisible()) {
    const cls = await explorerButton.getAttribute('class').catch(() => '')
    if (!cls?.includes('bg-accent')) {
      await explorerButton.click()
      await expect(page.locator('[data-panel-id="explorer"]')).toBeVisible()
    }
  }

  await page.evaluate((nextFilter) => {
    const store = (window as Record<string, unknown>).__sessionStore as {
      getState: () => { activeSessionId: string; setExplorerFilter: (id: string, filter: string) => void }
    }
    if (!store) return
    const state = store.getState()
    state.setExplorerFilter(state.activeSessionId, nextFilter)
  }, filter)
  await expect(page.locator('[data-panel-id="explorer"]')).toBeVisible()
}

/** Click the Uncommitted / Branch / Commits view toggle inside source-control */
async function setSourceControlView(label: 'Uncommitted' | 'Branch' | 'Commits') {
  const explorer = page.locator('[data-panel-id="explorer"]')
  const toggle = explorer.locator(`button:has-text("${label}")`).first()
  await expect(toggle).toBeVisible()
  await toggle.click()
}

test.beforeAll(async () => {
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true })

  ;({ page } = await resetApp({ scenario: 'marketing' }))

  // Use the backend-api session — the marketing scenario seeds it with staged
  // and unstaged files, branch changes vs main, and several commits.
  const session = page.locator('.cursor-pointer:has-text("backend-api")')
  await session.click()
  await expect(session).toHaveClass(/bg-accent\/15/)
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'Highlight open file in explorer',
      description:
        'The Explorer now highlights the currently open file across all four source-control ' +
        'sub-views — Files, Working changes, Branch changes, and Commits. When the user opens ' +
        'a file, every row matching that path is rendered with the accent background and ring, ' +
        'so the user can tell at a glance which file they are looking at while switching views.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: Highlight open file in explorer', () => {
  test('Step 1: Open a file from the source-control Working view', async () => {
    await setExplorerTab('source-control')
    await setSourceControlView('Uncommitted')

    const explorer = page.locator('[data-panel-id="explorer"]')
    const authRow = explorer.locator('div.cursor-pointer:has-text("src/middleware/auth.ts")').first()
    await expect(authRow).toBeVisible()
    await authRow.click()

    // After clicking, the same row should have the accent highlight.
    await expect(authRow).toHaveClass(/bg-accent\/20/)

    await screenshotElement(page, explorer, path.join(SCREENSHOTS, '01-working-view-highlight.png'), {
      maxHeight: 600,
    })
    steps.push({
      screenshotPath: 'screenshots/01-working-view-highlight.png',
      caption: 'Working view: the open file is highlighted in the staged list',
      description:
        'Clicking "src/middleware/auth.ts" in the Working changes view opens it in the file viewer. ' +
        'Its row in the staged-changes list gets the accent background and ring so the user can see ' +
        'which file they are currently viewing.',
    })
  })

  test('Step 2: Same file remains highlighted in the Branch view', async () => {
    await setSourceControlView('Branch')

    const explorer = page.locator('[data-panel-id="explorer"]')
    const authRow = explorer.locator('div.cursor-pointer:has-text("src/middleware/auth.ts")').first()
    await expect(authRow).toBeVisible()
    await expect(authRow).toHaveClass(/bg-accent\/20/)

    await screenshotElement(page, explorer, path.join(SCREENSHOTS, '02-branch-view-highlight.png'), {
      maxHeight: 600,
    })
    steps.push({
      screenshotPath: 'screenshots/02-branch-view-highlight.png',
      caption: 'Branch view: the same file stays highlighted',
      description:
        'Switching to the Branch view (changes vs main) keeps the highlight on ' +
        '"src/middleware/auth.ts", since the file is still the one open in the file viewer. ' +
        'The user can switch views without losing track of which file is open.',
    })
  })

  test('Step 3: Switch to the Files tab — Files tree highlights the same file', async () => {
    await setExplorerTab('files')

    const explorer = page.locator('[data-panel-id="explorer"]')

    // Expand the src and src/middleware directories so the file is visible.
    const srcDir = explorer.locator('[data-tree-item]:has-text("src")').first()
    await expect(srcDir).toBeVisible()
    await srcDir.click()
    const middlewareDir = explorer.locator('[data-tree-item]:has-text("middleware")').first()
    await expect(middlewareDir).toBeVisible()
    await middlewareDir.click()

    const authNode = explorer.locator('[data-tree-item]:has-text("auth.ts")').first()
    await expect(authNode).toBeVisible()
    await expect(authNode).toHaveClass(/bg-accent\/20/)

    await screenshotElement(page, explorer, path.join(SCREENSHOTS, '03-files-tab-highlight.png'), {
      maxHeight: 600,
    })
    steps.push({
      screenshotPath: 'screenshots/03-files-tab-highlight.png',
      caption: 'Files tab: the file tree also highlights the open file',
      description:
        'The Files tab uses the same selected-file highlight style. Expanding the src/middleware ' +
        'directory reveals the open auth.ts file with the accent treatment, consistent across the ' +
        'Files tab and the source-control views.',
    })
  })
})
