/**
 * Feature Documentation: Branch Name Clash Handling
 *
 * Shows what happens when a user tries to create a new branch that already
 * exists on the remote. Instead of a confusing non-fast-forward error, the
 * UI detects the clash, cleans up the orphaned worktree, and offers to
 * either open the existing session (if one exists) or navigate to the
 * "Existing Branches" flow to create a session from the remote branch.
 *
 * Run with: pnpm test:feature-docs branch-clash
 */
import { test, expect, resetApp } from '../_shared/electron-fixture'
import type { Page, ElectronApplication } from '@playwright/test'
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

async function openNewSessionDialog() {
  const newSessionBtn = page.locator('button:has-text("+ New Session")')
  await newSessionBtn.click()
  await expect(page.locator('h2:has-text("New Session")')).toBeVisible()
}

async function navigateToNewBranch() {
  await openNewSessionDialog()
  await page.locator('button[title="Create a new branch worktree"]').click()
  await expect(page.locator('h2:has-text("New Branch")')).toBeVisible()
}

test.beforeAll(async () => {
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true })
  ;({ page, electronApp } = await resetApp())
})

test.afterAll(async () => {
  await restoreIpcHandler('git:pushNewBranch')

  await generateFeaturePage(
    {
      title: 'Branch Name Clash Handling',
      description:
        'When creating a new branch whose name already exists on the remote, ' +
        'Broomy detects the non-fast-forward rejection, cleans up the orphaned ' +
        'local worktree and branch, and offers recovery options: open the existing ' +
        'session if one is active for that branch, or switch to the "Existing Branches" ' +
        'flow to create a session from the remote branch.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: Branch Name Clash', () => {
  test('Step 1: Normal new branch creation', async () => {
    await navigateToNewBranch()

    const branchInput = page.locator('input[placeholder*="feature/"]')
    await branchInput.fill('fix/lint')

    // Screenshot the normal state before attempting creation
    const dialog = page.locator('.fixed.inset-0').first()
    await screenshotElement(page, dialog, path.join(SCREENSHOTS, '01-new-branch-form.png'))
    steps.push({
      screenshotPath: 'screenshots/01-new-branch-form.png',
      caption: 'New Branch dialog with branch name entered',
      description:
        'The user enters a branch name in the New Branch dialog. ' +
        'If this name already exists on the remote, the push will fail.',
    })

    // Close dialog for next step
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
  })

  test('Step 2: Push fails because remote branch exists — shows "Use existing branch"', async () => {
    await navigateToNewBranch()

    const branchInput = page.locator('input[placeholder*="feature/"]')
    await branchInput.fill('fix/lint')

    // Override pushNewBranch to simulate remote branch clash
    await overrideIpcHandler('git:pushNewBranch', {
      success: false,
      error: 'BRANCH_EXISTS:The remote branch "fix/lint" has diverged. You can create a session from the remote branch instead.',
    })

    // Click Create Branch to trigger the error
    await page.locator('button:has-text("Create Branch")').click()

    // Wait for the error and "Use existing branch" button to appear
    await expect(page.locator('button:has-text("Use existing branch instead")')).toBeVisible({ timeout: 5000 })

    // Screenshot the dialog showing the clash error with recovery option
    const dialog = page.locator('.fixed.inset-0').first()
    await screenshotElement(page, dialog, path.join(SCREENSHOTS, '02-branch-clash-use-existing.png'))
    steps.push({
      screenshotPath: 'screenshots/02-branch-clash-use-existing.png',
      caption: 'Branch clash detected — offering to use existing remote branch',
      description:
        'The push was rejected because a branch with this name already exists on the remote. ' +
        'The orphaned local worktree and branch are cleaned up automatically. ' +
        'The "Use existing branch instead" button navigates to the Existing Branches view. ' +
        'If an active session already uses this branch, "Open existing session" appears instead.',
    })

    // Click the button to navigate to Existing Branches view
    await page.locator('button:has-text("Use existing branch instead")').click()
    await expect(page.locator('h2:has-text("Existing Branches")')).toBeVisible({ timeout: 5000 })

    // Screenshot the Existing Branches view
    const dialogAfter = page.locator('.fixed.inset-0').first()
    await screenshotElement(page, dialogAfter, path.join(SCREENSHOTS, '03-existing-branches-view.png'))
    steps.push({
      screenshotPath: 'screenshots/03-existing-branches-view.png',
      caption: 'Navigated to Existing Branches view',
      description:
        'After clicking "Use existing branch instead", the user is taken to the ' +
        'Existing Branches view where they can select the remote branch and create ' +
        'a worktree from it.',
    })

    // Restore and close
    await restoreIpcHandler('git:pushNewBranch')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
  })

})
