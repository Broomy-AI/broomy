/**
 * Feature Documentation: Review Session Status (REVIEW / REVIEWED)
 *
 * Exercises the review status badge lifecycle in the session sidebar.
 * Review sessions show "Review" (cyan) when pending and "Reviewed" (green)
 * once the user has submitted their review.
 *
 * Run with: pnpm test:feature-docs review-status
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

/** Set the first session to be a review session with the given reviewStatus */
async function setReviewSession(p: Page, reviewStatus?: 'pending' | 'reviewed') {
  await p.evaluate((status) => {
    const store = (window as Record<string, unknown>).__sessionStore as {
      getState: () => { sessions: Record<string, unknown>[] }
      setState: (state: Record<string, unknown>) => void
    }
    if (!store) return

    const sessions = store.getState().sessions
    store.setState({
      sessions: sessions.map((s: Record<string, unknown>, i: number) => {
        if (i === 0) {
          return {
            ...s,
            sessionType: 'review',
            reviewStatus: status ?? 'pending',
            prNumber: 123,
            prTitle: 'Add dark mode support',
            prUrl: 'https://github.com/user/demo-project/pull/123',
            prBaseBranch: 'main',
          }
        }
        return s
      }),
    })
  }, reviewStatus)
}

test.beforeAll(async () => {
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true })

  ;({ page } = await resetApp())
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'Review Session Status',
      description:
        'Review sessions display a status badge indicating whether the user still needs to review the PR. ' +
        'The badge shows "Review" (cyan) when pending and transitions to "Reviewed" (green) once the user ' +
        'has submitted their review. If a review is re-requested, it reverts to "Review".',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: Review Session Status', () => {
  test('Step 1: Review session shows "Review" badge when pending', async () => {
    await setReviewSession(page, 'pending')

    // Click the first session to ensure it re-renders
    const firstSession = page.locator('.cursor-pointer').first()
    await firstSession.click()

    // The Review badge should be visible
    const reviewBadge = page.locator('span:has-text("Review")').first()
    await expect(reviewBadge).toBeVisible({ timeout: 5000 })

    // Verify the badge has cyan styling (bg-cyan-500/20)
    const classes = await reviewBadge.getAttribute('class')
    expect(classes).toContain('bg-cyan-500/20')

    const sidebar = page.locator('[data-panel-id="sidebar"]')
    await screenshotElement(page, sidebar, path.join(SCREENSHOTS, '01-review-pending.png'), {
      maxHeight: 400,
    })
    steps.push({
      screenshotPath: 'screenshots/01-review-pending.png',
      caption: 'Review session with "Review" badge (pending)',
      description:
        'The first session is a review session with pending status. The cyan "Review" badge ' +
        'indicates this PR is waiting for the user\'s review.',
    })
  })

  test('Step 2: Review session shows "Reviewed" badge after submitting review', async () => {
    await setReviewSession(page, 'reviewed')

    // Click away and back to trigger re-render
    const secondSession = page.locator('.cursor-pointer').nth(1)
    await secondSession.click()
    const firstSession = page.locator('.cursor-pointer').first()
    await firstSession.click()

    // The Reviewed badge should be visible
    const reviewedBadge = page.locator('span:has-text("Reviewed")').first()
    await expect(reviewedBadge).toBeVisible({ timeout: 5000 })

    // Verify the badge has green styling (bg-green-500/20)
    const classes = await reviewedBadge.getAttribute('class')
    expect(classes).toContain('bg-green-500/20')

    // The old "Review" badge (without "ed") should not be visible for this session
    // (there may be the "Reviewed" text which contains "Review", so check specifically)
    const sidebar = page.locator('[data-panel-id="sidebar"]')
    await screenshotElement(page, sidebar, path.join(SCREENSHOTS, '02-review-done.png'), {
      maxHeight: 400,
    })
    steps.push({
      screenshotPath: 'screenshots/02-review-done.png',
      caption: 'Review session with "Reviewed" badge (complete)',
      description:
        'After the user submits their review, the badge changes from cyan "Review" to green "Reviewed". ' +
        'This makes it easy to see at a glance which PRs still need attention.',
    })
  })

  test('Step 3: Badge reverts to "Review" when review is re-requested', async () => {
    // Simulate re-request by setting back to pending
    await setReviewSession(page, 'pending')

    // Click away and back
    const secondSession = page.locator('.cursor-pointer').nth(1)
    await secondSession.click()
    const firstSession = page.locator('.cursor-pointer').first()
    await firstSession.click()

    // The Review badge should be back
    const reviewBadge = page.locator('span:has-text("Review")').first()
    await expect(reviewBadge).toBeVisible({ timeout: 5000 })

    const classes = await reviewBadge.getAttribute('class')
    expect(classes).toContain('bg-cyan-500/20')

    const sidebar = page.locator('[data-panel-id="sidebar"]')
    await screenshotElement(page, sidebar, path.join(SCREENSHOTS, '03-review-re-requested.png'), {
      maxHeight: 400,
    })
    steps.push({
      screenshotPath: 'screenshots/03-review-re-requested.png',
      caption: 'Badge reverts to "Review" when review is re-requested',
      description:
        'If the PR author requests another review, the badge transitions back from "Reviewed" to "Review". ' +
        'This is detected automatically when switching into the session by checking GitHub\'s requested_reviewers API.',
    })
  })

  test('Step 4: Non-review sessions do not show review badges', async () => {
    // Reset first session to non-review
    await page.evaluate(() => {
      const store = (window as Record<string, unknown>).__sessionStore as {
        getState: () => { sessions: Record<string, unknown>[] }
        setState: (state: Record<string, unknown>) => void
      }
      if (!store) return

      const sessions = store.getState().sessions
      store.setState({
        sessions: sessions.map((s: Record<string, unknown>, i: number) => {
          if (i === 0) {
            return {
              ...s,
              sessionType: undefined,
              reviewStatus: undefined,
            }
          }
          return s
        }),
      })
    })

    // Click away and back to trigger re-render
    const secondSession = page.locator('.cursor-pointer').nth(1)
    await secondSession.click()
    const firstSession = page.locator('.cursor-pointer').first()
    await firstSession.click()

    // The first session card should not have Review or Reviewed badges
    const firstCard = page.locator('.cursor-pointer').first()
    const reviewBadge = firstCard.locator('span:has-text("Review")')
    await expect(reviewBadge).not.toBeVisible({ timeout: 3000 })
    const reviewedBadge = firstCard.locator('span:has-text("Reviewed")')
    await expect(reviewedBadge).not.toBeVisible({ timeout: 3000 })

    const sidebar = page.locator('[data-panel-id="sidebar"]')
    await screenshotElement(page, sidebar, path.join(SCREENSHOTS, '04-non-review-session.png'), {
      maxHeight: 400,
    })
    steps.push({
      screenshotPath: 'screenshots/04-non-review-session.png',
      caption: 'Non-review sessions do not show review badges',
      description:
        'Regular (non-review) sessions do not display the "Review" or "Reviewed" badges. ' +
        'They show standard branch status chips instead. The review badge is exclusive to review sessions.',
    })
  })
})
