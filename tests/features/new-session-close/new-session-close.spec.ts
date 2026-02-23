/**
 * Feature Documentation: New Session Dialog — No Close on Backdrop Click
 *
 * Demonstrates that clicking outside the new session dialog does NOT close it.
 * The dialog can only be dismissed via the Cancel button or Escape key.
 *
 * Run with: pnpm test:feature-docs new-session-close
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
      title: 'New Session Dialog — No Close on Backdrop Click',
      description:
        'The new session dialog requires an explicit Cancel action to close. ' +
        'Clicking outside the dialog (on the backdrop) does not dismiss it, ' +
        'preventing accidental loss of in-progress session configuration.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)

  if (electronApp) {
    await electronApp.close()
  }
})

test.describe.serial('Feature: New Session Dialog Close Behavior', () => {
  test('Step 1: Open the new session dialog', async () => {
    const newSessionBtn = page.locator('button:has-text("+ New Session")')
    await expect(newSessionBtn).toBeVisible()
    await newSessionBtn.click()

    // Wait for the dialog to appear
    const dialog = page.locator('.fixed.inset-0.z-50 .rounded-lg')
    await expect(dialog).toBeVisible()

    await screenshotElement(page, dialog, path.join(SCREENSHOTS, '01-dialog-open.png'))
    steps.push({
      screenshotPath: 'screenshots/01-dialog-open.png',
      caption: 'New session dialog is open',
      description:
        'Clicking "+ New Session" opens the dialog with repo list and options. ' +
        'The semi-transparent backdrop is visible behind it.',
    })
  })

  test('Step 2: Click the backdrop — dialog stays open', async () => {
    // Click the backdrop (the semi-transparent overlay outside the dialog)
    const backdrop = page.locator('.fixed.inset-0.z-50')
    await backdrop.click({ position: { x: 10, y: 10 } })
    await page.waitForTimeout(300)

    // Dialog should still be visible
    const dialog = page.locator('.fixed.inset-0.z-50 .rounded-lg')
    await expect(dialog).toBeVisible()

    await screenshotElement(page, dialog, path.join(SCREENSHOTS, '02-still-open-after-backdrop-click.png'))
    steps.push({
      screenshotPath: 'screenshots/02-still-open-after-backdrop-click.png',
      caption: 'Dialog remains open after clicking the backdrop',
      description:
        'After clicking the dark area outside the dialog, it stays open. ' +
        'This prevents accidental dismissal when the user misclicks.',
    })
  })

  test('Step 3: Cancel button closes the dialog', async () => {
    // Find and click the Cancel button
    const cancelBtn = page.locator('.fixed.inset-0.z-50 button:has-text("Cancel")')
    await expect(cancelBtn).toBeVisible()

    // Screenshot showing the Cancel button before clicking
    const dialog = page.locator('.fixed.inset-0.z-50 .rounded-lg')
    await screenshotElement(page, dialog, path.join(SCREENSHOTS, '03-cancel-button-visible.png'))
    steps.push({
      screenshotPath: 'screenshots/03-cancel-button-visible.png',
      caption: 'The Cancel button is the way to dismiss the dialog',
      description:
        'The Cancel button at the bottom of the dialog is the explicit action ' +
        'required to close it. Escape key also works from the home view.',
    })

    await cancelBtn.click()
    await page.waitForTimeout(300)

    // Dialog should now be gone
    const backdrop = page.locator('.fixed.inset-0.z-50')
    await expect(backdrop).not.toBeVisible()
  })

  test('Step 4: Confirm dialog is closed', async () => {
    // The main app should be visible again without the dialog overlay
    const sidebar = page.locator('[data-panel-id="sidebar"]')
    await expect(sidebar).toBeVisible()

    // The new session button should be available again
    const newSessionBtn = page.locator('button:has-text("+ New Session")')
    await expect(newSessionBtn).toBeVisible()

    await screenshotElement(page, sidebar, path.join(SCREENSHOTS, '04-dialog-closed.png'), {
      maxHeight: 600,
    })
    steps.push({
      screenshotPath: 'screenshots/04-dialog-closed.png',
      caption: 'Dialog closed after clicking Cancel',
      description:
        'The dialog is dismissed and the user is back to the normal session view. ' +
        'The dialog was only closed by the explicit Cancel action, not by the backdrop click.',
    })
  })
})
