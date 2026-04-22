/**
 * Feature Documentation: Error Banner Shows Full Details in Modal
 *
 * Demonstrates that git operation errors in the source control panel
 * are displayed using the shared DialogErrorBanner component, which
 * wraps the full error text (instead of truncating) and opens an
 * ErrorDetailModal on click to show the complete raw error message.
 *
 * Run with: pnpm test:feature-docs error-not-expand
 */
import { test, expect, resetApp } from '../_shared/electron-fixture'
import type { Page, ElectronApplication } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { screenshotElement, screenshotRegion, waitForExplorer } from '../_shared/screenshot-helpers'
import { generateFeaturePage, generateIndex, FeatureStep } from '../_shared/template'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const FEATURE_DIR = __dirname
const SCREENSHOTS = path.join(FEATURE_DIR, 'screenshots')
const FEATURES_ROOT = path.join(__dirname, '..')

let page: Page
let electronApp: ElectronApplication
const steps: FeatureStep[] = []

/** Replace an IPC handler in the main process to return a custom response. */
async function overrideIpcHandler(channel: string, response: unknown) {
  await electronApp.evaluate(({ ipcMain }, { ch, resp }) => {
    ipcMain.removeHandler(ch)
    ipcMain.handle(ch, () => resp)
  }, { ch: channel, resp: response })
}

/** Restore an IPC handler to its original E2E mock (returns { success: true }). */
async function restoreIpcHandler(channel: string) {
  await electronApp.evaluate(({ ipcMain }, ch) => {
    ipcMain.removeHandler(ch)
    ipcMain.handle(ch, () => ({ success: true }))
  }, channel)
}

test.beforeAll(async () => {
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true })
  ;({ page, electronApp } = await resetApp())
})

test.afterAll(async () => {
  await restoreIpcHandler('git:commitMerge')
  await restoreIpcHandler('git:status')

  await generateFeaturePage(
    {
      title: 'Error Banner Shows Full Details in Modal',
      description:
        'Git operation errors in the source control panel now use the shared DialogErrorBanner ' +
        'component. Error text wraps instead of being truncated to 80 characters, and clicking ' +
        'the banner opens a modal showing the complete raw error message. This ensures multi-line ' +
        'git output (like fetch progress + actual error) is always fully visible.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

// Helper to open explorer and navigate to Source Control tab
async function openSourceControl() {
  // Select the backend-api session (which has a non-main branch, so PR mock returns OPEN)
  const backendSession = page.locator('.cursor-pointer:has-text("backend-api")')
  await backendSession.click()
  await expect(backendSession).toHaveClass(/bg-accent\/15/)

  // Override git:status to return a merging state so the "Commit merge" button appears
  await overrideIpcHandler('git:status', {
    files: [
      { path: 'src/index.ts', status: 'modified', staged: true, indexStatus: 'M', workingDirStatus: ' ' },
    ],
    current: 'feature/auth',
    tracking: 'origin/feature/auth',
    ahead: 1,
    behind: 0,
    isMerging: true,
    hasConflicts: false,
  })

  const explorerBtn = page.locator('button[title*="Explorer"]')
  await explorerBtn.click()
  const explorer = await waitForExplorer(page)
  const scButton = explorer.locator('button[title="Source Control"]')
  if (await scButton.isVisible()) {
    await scButton.click()
  }
  return explorer
}

test.describe.serial('Feature: Error Banner Expansion', () => {
  test('Step 1: Source control panel in merge state', async () => {
    const explorer = await openSourceControl()

    // Wait for PR status to load (the OPEN badge appears inside a span)
    await expect(explorer.locator('span:has-text("OPEN")')).toBeVisible({ timeout: 10000 })
    await expect(explorer.locator('text=Commit merge')).toBeVisible({ timeout: 5000 })

    await screenshotElement(page, explorer, path.join(SCREENSHOTS, '01-source-control-normal.png'), { maxHeight: 350 })
    steps.push({
      screenshotPath: 'screenshots/01-source-control-normal.png',
      caption: 'Source control panel with open PR and Commit merge button',
      description:
        'The source control panel shows the PR status and a "Commit merge" button. ' +
        'This is the normal state before any error occurs.',
    })
  })

  test('Step 2: Trigger a multi-line git error', async () => {
    // Override commitMerge to return a multi-line error
    await overrideIpcHandler('git:commitMerge', {
      success: false,
      error: 'error: Committing is not possible because you have unmerged files.\nhint: Fix them up in the work tree, and then use \'git add/rm <file>\'\nhint: as appropriate to mark resolution and make a commit.\nfatal: Exiting because of an unresolved conflict.',
    })

    // Click "Commit merge" to trigger the error
    const mergeBtn = page.locator('button:has-text("Commit merge")')
    await mergeBtn.click()

    // Wait for the error banner to appear
    const errorBanner = page.locator('button[title="Click to view full error"]')
    await expect(errorBanner).toBeVisible({ timeout: 5000 })

    // Screenshot the error banner - it should wrap text, not truncate
    const explorer = page.locator('[data-panel-id="explorer"]')
    await screenshotElement(page, explorer, path.join(SCREENSHOTS, '02-error-banner-wrapped.png'), { maxHeight: 350 })
    steps.push({
      screenshotPath: 'screenshots/02-error-banner-wrapped.png',
      caption: 'Error banner wraps the full error message instead of truncating',
      description:
        'After the merge commit fails, the error banner shows the operation label ("Merge commit failed") ' +
        'followed by the humanized error message. The text wraps naturally instead of being cut off ' +
        'at 80 characters, so multi-line git output is fully readable.',
    })
  })

  test('Step 3: Click error banner to open detail modal', async () => {
    // Click the error banner text to open the detail modal
    const errorBanner = page.locator('button[title="Click to view full error"]')
    await errorBanner.click()

    // Wait for the modal to appear
    const modal = page.locator('.fixed.inset-0.z-50')
    await expect(modal).toBeVisible({ timeout: 3000 })

    // The modal should show the full raw error in a monospace box
    await expect(modal.locator('text=Error Details')).toBeVisible()
    await expect(modal.locator('pre')).toBeVisible()

    await screenshotElement(page, modal.locator('.bg-bg-secondary'), path.join(SCREENSHOTS, '03-error-detail-modal.png'))
    steps.push({
      screenshotPath: 'screenshots/03-error-detail-modal.png',
      caption: 'Error detail modal shows the full raw error message',
      description:
        'Clicking the error banner opens a modal with the humanized message at top ' +
        'and the complete raw error output in a scrollable monospace box. This lets ' +
        'users see multi-line git output (fetch progress, actual error) that would ' +
        'otherwise be hidden.',
    })

    // Close the modal
    await modal.locator('button:has-text("Close")').click()
    await expect(modal).not.toBeVisible()
  })

  test('Step 4: Dismiss the error banner', async () => {
    // Dismiss the error
    const dismissBtn = page.locator('button[title="Dismiss"]')
    await dismissBtn.click()

    // Error banner should be gone
    const errorBanner = page.locator('button[title="Click to view full error"]')
    await expect(errorBanner).not.toBeVisible()

    // Restore the handler
    await restoreIpcHandler('git:commitMerge')

    const explorer = page.locator('[data-panel-id="explorer"]')
    await screenshotElement(page, explorer, path.join(SCREENSHOTS, '04-error-dismissed.png'), { maxHeight: 350 })
    steps.push({
      screenshotPath: 'screenshots/04-error-dismissed.png',
      caption: 'Error banner dismissed, back to normal state',
      description:
        'After clicking the dismiss button (×), the error banner is removed and the ' +
        'source control panel returns to its normal state.',
    })
  })
})
