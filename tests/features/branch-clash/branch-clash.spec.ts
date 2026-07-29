/**
 * Feature Documentation: Branch Name Clash Handling
 *
 * Shows what happens when a user tries to create a new branch whose name already
 * exists (locally or on the remote). The new-branch worktree op never reuses or
 * clobbers the existing branch/worktree; instead the session fails cleanly with a
 * clear "already exists" message on its card, rather than a confusing
 * non-fast-forward error or a silently advanced remote branch.
 *
 * The failure surfaces on the initializing session's card in the sidebar (a
 * background state that this dialog-flow walkthrough documents rather than
 * screenshots), so this spec captures the New Branch form and describes the outcome.
 *
 * Run with: pnpm test:feature-docs branch-clash
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

async function navigateToNewBranch() {
  await page.locator('button:has-text("+ New Session")').click()
  await expect(page.locator('h2:has-text("New Session")')).toBeVisible()
  await page.locator('button[title="Create a new branch worktree"]').click()
  await expect(page.locator('h2:has-text("New Branch")')).toBeVisible()
}

test.beforeAll(async () => {
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true })
  ;({ page } = await resetApp())
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'Branch Name Clash Handling',
      description:
        'When creating a new branch whose name already exists (locally or on the remote), ' +
        'Broomy never reuses or clobbers the existing branch/worktree. The new session fails ' +
        'cleanly with a clear "already exists" message on its card instead of a confusing ' +
        'non-fast-forward error — open the existing session for that branch, or pick a different name.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: Branch Name Clash', () => {
  test('Step 1: New Branch form — a clashing name fails cleanly', async () => {
    await navigateToNewBranch()

    const branchInput = page.locator('input[placeholder*="feature/"]')
    await branchInput.fill('fix/lint')

    const dialog = page.locator('.fixed.inset-0').first()
    await screenshotElement(page, dialog, path.join(SCREENSHOTS, '01-new-branch-form.png'))
    steps.push({
      screenshotPath: 'screenshots/01-new-branch-form.png',
      caption: 'New Branch dialog with a branch name entered',
      description:
        'The user enters a branch name and clicks Create Branch. If that name already exists — ' +
        'as a local branch, or on the remote — the new-branch worktree op refuses rather than ' +
        'reusing or clobbering it: the worktree is created detached for a brand-new branch only, ' +
        'and the push uses an empty-lease so it can never advance an existing remote branch. The ' +
        'session then fails cleanly on its sidebar card with an "already exists" message, and no ' +
        'pre-existing branch, worktree, or remote ref is touched.',
    })

    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
  })
})
