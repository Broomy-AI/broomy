/**
 * Feature Documentation: PR Review Filter Modes
 *
 * Exercises the Team / Mine / All filter tabs in the "PRs to Review" view of the
 * new session dialog, capturing screenshots at each stage to document the feature.
 *
 * Run with: pnpm test:feature-docs pr-review-filter-modes
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

const dialogLocator = () => page.locator('.fixed.inset-0.z-50 > div')

test.beforeAll(async () => {
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true })

  ;({ page } = await resetApp())
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'PR Review Filter Modes',
      description:
        'The "PRs to Review" view in the new session dialog lists pull requests through one of ' +
        'three filters, selectable from a tab strip in the header. "Team" (the default) shows ' +
        'PRs where a review was requested from you or from any team you belong to. "Mine" narrows ' +
        'that to requests addressed to you directly. "All" drops the review-request filter and ' +
        'lists every open PR. The chosen filter is remembered per repo, so each repo reopens in ' +
        'the mode you last used there.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: PR Review Filter Modes', () => {
  test('Step 1: Team mode is the default', async () => {
    await page.locator('button:has-text("+ New Session")').click()

    const dialog = dialogLocator()
    await expect(dialog).toBeVisible()

    await dialog.locator('button[title="Review pull requests"]').click()

    // Team mode lists review requests, so the unrelated open PR is absent
    await expect(dialog.locator('text=Add dark mode support').first()).toBeVisible()
    await expect(dialog.locator('text=Bump dependencies')).toHaveCount(0)

    await expect(dialog.locator('[role="tab"]:has-text("Team")')).toHaveAttribute('aria-selected', 'true')

    await screenshotElement(page, dialog, path.join(SCREENSHOTS, '01-team-mode.png'))
    steps.push({
      screenshotPath: 'screenshots/01-team-mode.png',
      caption: 'The view opens in Team mode',
      description:
        'A Team / Mine / All tab strip sits under the header, with Team selected. The subtitle ' +
        'reads "Requested for review". The list shows PRs where a review was requested from you ' +
        'or from a team you belong to — the behavior this view has always had.',
    })
  })

  test('Step 2: Mine mode narrows to direct requests', async () => {
    const dialog = dialogLocator()

    await dialog.locator('[role="tab"]:has-text("Mine")').click()

    await expect(dialog.locator('[role="tab"]:has-text("Mine")')).toHaveAttribute('aria-selected', 'true')
    await expect(dialog.locator('text=Requested from you directly')).toBeVisible()

    await screenshotElement(page, dialog, path.join(SCREENSHOTS, '02-mine-mode.png'))
    steps.push({
      screenshotPath: 'screenshots/02-mine-mode.png',
      caption: 'Mine mode shows only PRs assigned to you personally',
      description:
        'Selecting Mine refetches using GitHub\'s user-review-requested qualifier, which excludes ' +
        'requests routed through a team. The subtitle updates to "Requested from you directly".',
    })
  })

  test('Step 3: All mode lists every open PR', async () => {
    const dialog = dialogLocator()

    await dialog.locator('[role="tab"]:has-text("All")').click()

    await expect(dialog.locator('[role="tab"]:has-text("All")')).toHaveAttribute('aria-selected', 'true')

    // No review request exists for this PR, so it appears only in All mode
    await expect(dialog.locator('text=Bump dependencies').first()).toBeVisible()

    await screenshotElement(page, dialog, path.join(SCREENSHOTS, '03-all-mode.png'))
    steps.push({
      screenshotPath: 'screenshots/03-all-mode.png',
      caption: 'All mode adds open PRs nobody asked you to review',
      description:
        'All mode drops the review-request filter entirely. "Bump dependencies" — an open PR with ' +
        'no review request — now appears alongside the two PRs the other modes showed.',
    })
  })

  test('Step 4: The chosen mode is remembered', async () => {
    const dialog = dialogLocator()

    // Leave and re-enter the view
    await page.keyboard.press('Escape')
    await expect(dialog.locator('h2:has-text("New Session")')).toBeVisible()
    await dialog.locator('button[title="Review pull requests"]').click()

    await expect(dialog.locator('[role="tab"]:has-text("All")')).toHaveAttribute('aria-selected', 'true')
    await expect(dialog.locator('text=Bump dependencies').first()).toBeVisible()

    await screenshotElement(page, dialog, path.join(SCREENSHOTS, '04-mode-remembered.png'))
    steps.push({
      screenshotPath: 'screenshots/04-mode-remembered.png',
      caption: 'Reopening the view restores the last-used mode',
      description:
        'The filter is saved on the repo, so returning to this view — in this app run or a later ' +
        'one — reopens in All mode rather than resetting to Team. Each repo remembers its own choice.',
    })
  })
})
