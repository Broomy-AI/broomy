/**
 * Feature Documentation: Keep `main/` current (#170)
 *
 * Every session is a git worktree branched off the repo's primary `main/` clone. After a PR
 * merges, that clone silently drifts behind `origin/<default>`. This feature keeps it fresh:
 * - Merges **inside** Broomy auto fast-forward `main/` (invisible; covered by unit tests).
 * - Merges **outside** Broomy surface a one-click sync chip on the repo-group header — and a
 *   "Sync main (N behind)" item on a session card's right-click menu.
 *
 * The chip only appears when `main/` is actually behind, so this spec drives the deterministic
 * `E2E_MOCK_BEHIND_MAIN` knob to make it visible, then clicks it to fast-forward.
 *
 * Run with: pnpm test:feature-docs keep-main-current
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

test.beforeAll(async () => {
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true })
  // demo-project (repo-1) backs the first session; make its main/ 5 commits behind so the chip shows.
  ;({ page } = await resetApp({ mockBehindMain: 5 }))
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'Keep main current',
      description:
        "Broomy keeps each repo's primary main/ clone up to date so new sessions branch from current " +
        'code. A merge inside Broomy auto fast-forwards main/; a merge outside Broomy (a teammate, ' +
        'another terminal) surfaces a one-click sync chip on the repo-group header — and a matching ' +
        '"Sync main" item on a session card\'s right-click menu. Every sync is fast-forward-only, so it ' +
        'can never rewrite history or leave a merge commit.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: Keep main current', () => {
  const chip = () => page.getByRole('button', { name: /Sync main/ })

  test('Step 1: an out-of-date main/ shows a sync chip on the repo header', async () => {
    const sidebar = page.locator('[data-panel-id="sidebar"]')
    await expect(sidebar).toBeVisible()

    // The chip is a real button labelled with the exact behind-count.
    await expect(chip()).toBeVisible()
    await expect(chip()).toHaveAttribute('aria-label', /5 commits behind/)

    await screenshotElement(page, sidebar, path.join(SCREENSHOTS, '01-chip-behind.png'), { maxHeight: 600 })
    steps.push({
      screenshotPath: 'screenshots/01-chip-behind.png',
      caption: 'A “↓5” chip appears on the repo-group header when main/ is behind',
      description:
        'When a repo’s main/ clone falls behind origin (for example after a teammate merges a PR ' +
        'outside Broomy), a neutral ↓N chip appears on that repo’s group header. It reads how many ' +
        'commits behind main/ is, and its tooltip notes the sync is fast-forward-only.',
    })
  })

  test('Step 2: clicking the chip fast-forwards main/ and clears the chip', async () => {
    await chip().click()

    // A successful fast-forward zeroes the count, so the chip disappears.
    await expect(chip()).toHaveCount(0)

    const sidebar = page.locator('[data-panel-id="sidebar"]')
    await screenshotElement(page, sidebar, path.join(SCREENSHOTS, '02-chip-synced.png'), { maxHeight: 600 })
    steps.push({
      screenshotPath: 'screenshots/02-chip-synced.png',
      caption: 'One click fast-forwards main/ — the chip clears once the clone is current',
      description:
        'Clicking the chip runs a fast-forward-only update of main/ to origin. On success the ' +
        'behind-count drops to zero and the chip disappears; if the clone had diverged or sat on ' +
        'another branch, the sync is refused with a clear error instead of forcing a merge.',
    })
  })
})
