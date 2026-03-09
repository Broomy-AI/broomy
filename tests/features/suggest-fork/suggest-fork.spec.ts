/**
 * Feature Documentation: Suggest Fork for Read-Only Repos
 *
 * When a user clones a repo they don't have write access to, or tries to
 * create a branch on such a repo, Broomy detects the lack of write access
 * and suggests forking the repo on GitHub and cloning the fork instead.
 *
 * Run with: pnpm test:feature-docs suggest-fork
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

async function navigateToClone() {
  await openNewSessionDialog()
  await page.locator('button:has-text("Clone")').click()
  await expect(page.locator('h2:has-text("Clone Repository")')).toBeVisible()
}

test.beforeAll(async () => {
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true })
  ;({ page, electronApp } = await resetApp())
})

test.afterAll(async () => {
  await restoreIpcHandler('git:pushNewBranch')
  await restoreIpcHandler('gh:hasWriteAccess')

  await generateFeaturePage(
    {
      title: 'Suggest Fork for Read-Only Repos',
      description:
        'When a user clones a repository they don\'t have write access to, or tries to ' +
        'create a branch on such a repo, Broomy warns them and suggests forking the repo ' +
        'on GitHub and cloning the fork instead.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: Suggest Fork — Branch Creation', () => {
  test('Step 1: Push fails due to no write access — shows fork suggestion', async () => {
    await navigateToNewBranch()

    const branchInput = page.locator('input[placeholder*="feature/"]')
    await branchInput.fill('fix/my-change')

    // Override pushNewBranch to simulate permission denied
    await overrideIpcHandler('git:pushNewBranch', {
      success: false,
      error: 'NO_WRITE_ACCESS:You don\'t have write access to this repository. Fork it on GitHub and clone your fork instead.',
    })

    // Click Create Branch to trigger the error
    await page.locator('button:has-text("Create Branch")').click()

    // Wait for error to appear
    await expect(page.locator('text=You don\'t have write access')).toBeVisible({ timeout: 5000 })

    // Screenshot the dialog showing the fork suggestion
    const dialog = page.locator('.fixed.inset-0').first()
    await screenshotElement(page, dialog, path.join(SCREENSHOTS, '01-no-write-access-branch.png'))
    steps.push({
      screenshotPath: 'screenshots/01-no-write-access-branch.png',
      caption: 'Branch creation fails — suggests forking the repo',
      description:
        'When pushing a new branch fails because the user doesn\'t have write access, ' +
        'the error message explains the issue and suggests forking the repo on GitHub ' +
        'and cloning the fork instead.',
    })

    // Restore and close
    await restoreIpcHandler('git:pushNewBranch')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
  })
})

test.describe.serial('Feature: Suggest Fork — Clone Warning', () => {
  test('Step 2: Clone succeeds but warns about no write access', async () => {
    await navigateToClone()

    // Override hasWriteAccess to return false
    await overrideIpcHandler('gh:hasWriteAccess', false)

    // Fill in the clone form
    const urlInput = page.locator('input[placeholder*="github.com"]')
    await urlInput.fill('https://github.com/some-org/read-only-repo.git')

    // Click Clone to trigger the flow
    await page.locator('button:has-text("Clone"):not(:has-text("Repository"))').click()

    // Wait for the no-write-access warning and "Continue anyway" button
    await expect(page.locator('text=No write access')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('button:has-text("Continue anyway")')).toBeVisible()

    // Screenshot the dialog showing the warning
    const dialog = page.locator('.fixed.inset-0').first()
    await screenshotElement(page, dialog, path.join(SCREENSHOTS, '02-clone-no-write-access.png'))
    steps.push({
      screenshotPath: 'screenshots/02-clone-no-write-access.png',
      caption: 'Clone completes with write access warning',
      description:
        'After cloning a repo where the user has read-only access, a yellow warning ' +
        'banner appears explaining that they won\'t be able to push changes and ' +
        'suggesting they fork the repo and clone the fork instead. ' +
        'The user can click "Continue anyway (read-only)" to proceed.',
    })

    // Restore and close
    await restoreIpcHandler('gh:hasWriteAccess')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
  })
})
