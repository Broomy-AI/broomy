/**
 * Feature Documentation: Waiting / Approved PR Review Status
 *
 * Documents the two new session status chips — WAITING (a reviewer was
 * requested but hasn't responded yet) and APPROVED (the PR has cleared its
 * review bar) — and the per-repo approval-policy setting that decides when
 * "waiting" becomes "approved".
 *
 * The chips are derived from live GitHub review data, which the E2E harness
 * mocks as empty. To document the visual states deterministically, this spec
 * drives the exposed Zustand store (window.__sessionStore) the same way the
 * app's PR-refresh code does: set the branch to an open-PR state, then apply a
 * review state. Nothing here bypasses the real derivation — computeStatusChip
 * still decides the final chip from those inputs.
 *
 * It targets NON-active sessions (backend-api, docs-site) on purpose: git
 * polling only fetches git status for the active session, so only the active
 * session's branchStatus gets recomputed. Non-active sessions keep the injected
 * open-PR state, which keeps the screenshots stable.
 *
 * Run with: pnpm test:feature-docs waiting-status
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

/**
 * Drive the exposed store to put a named session into an open-PR review state.
 * Mirrors what the PR-refresh code does: set branchStatus to 'open', optionally
 * flag feedback, then apply the derived review state. computeStatusChip turns
 * these inputs into the final chip.
 */
async function setReviewState(
  name: string,
  reviewState: 'none' | 'waiting' | 'approved',
  opts: { hasFeedback?: boolean } = {},
) {
  await page.evaluate(
    ({ name, reviewState, hasFeedback }) => {
      const store = (window as unknown as { __sessionStore: { getState: () => any } }).__sessionStore
      const st = store.getState()
      const sess = st.sessions.find((s: { name: string }) => s.name === name)
      if (!sess) throw new Error(`session not found: ${name}`)
      st.updateBranchStatus(sess.id, 'open')
      st.updateChecksStatus(sess.id, 'passed')
      st.updateFeedbackStatus(sess.id, Boolean(hasFeedback))
      st.updateReviewState(sess.id, reviewState)
    },
    { name, reviewState, hasFeedback: opts.hasFeedback ?? false },
  )
}

test.beforeAll(async () => {
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true })
  ;({ page } = await resetApp())
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'Waiting / Approved PR Review Status',
      description:
        'Two new status chips tell you where a PR sits in review. WAITING means a reviewer has ' +
        'been requested but has not commented or requested changes yet. APPROVED means the PR has ' +
        'cleared its review bar and is ready to merge. A per-repo setting decides whether "approved" ' +
        'requires just one approval or every requested reviewer. The chips share a single derivation ' +
        'so the sidebar and the source-control bar always agree, and they never override an ' +
        'actionable FEEDBACK or FAILED state.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: Waiting / Approved PR Review Status', () => {
  test('Step 1: Baseline — sessions in the sidebar', async () => {
    const sidebar = page.locator('[data-panel-id="sidebar"]')
    await expect(sidebar).toBeVisible()

    const broomySession = sidebar.locator('.cursor-pointer:has-text("broomy")')
    await expect(broomySession).toBeVisible()
    const backendSession = sidebar.locator('.cursor-pointer:has-text("backend-api")')
    await expect(backendSession).toBeVisible()

    await screenshotElement(page, sidebar, path.join(SCREENSHOTS, '01-baseline-sidebar.png'), {
      maxHeight: 600,
    })
    steps.push({
      screenshotPath: 'screenshots/01-baseline-sidebar.png',
      caption: 'The session sidebar before any review has been requested',
      description:
        'Each session card carries a PR-lifecycle status chip. This walkthrough shows the two new ' +
        'chips that describe where a PR sits in review.',
    })
  })

  test('Step 2: WAITING — a reviewer has been asked but has not responded', async () => {
    await setReviewState('backend-api', 'waiting')

    const sidebar = page.locator('[data-panel-id="sidebar"]')
    const waitingChip = sidebar.locator('text=WAITING')
    await expect(waitingChip).toBeVisible()

    const backendCard = sidebar.locator('.cursor-pointer:has-text("backend-api")')
    await screenshotElement(page, backendCard, path.join(SCREENSHOTS, '02-waiting-chip.png'))
    steps.push({
      screenshotPath: 'screenshots/02-waiting-chip.png',
      caption: 'A muted WAITING chip appears once review has been requested',
      description:
        'When a PR is open and at least one reviewer has been requested — but no one has left a ' +
        'comment or requested changes, and the approval bar is not yet met — the session shows a ' +
        'neutral WAITING chip. It reads "the ball is in someone else\'s court."',
    })
  })

  test('Step 3: APPROVED — the PR has cleared its review bar', async () => {
    await setReviewState('docs-site', 'approved')

    const sidebar = page.locator('[data-panel-id="sidebar"]')
    const approvedChip = sidebar.locator('text=APPROVED')
    await expect(approvedChip).toBeVisible()

    // Both chips are visible together — a nice contrast of the two states.
    await screenshotElement(page, sidebar, path.join(SCREENSHOTS, '03-waiting-and-approved.png'), {
      maxHeight: 600,
    })
    steps.push({
      screenshotPath: 'screenshots/03-waiting-and-approved.png',
      caption: 'WAITING and APPROVED shown side by side',
      description:
        'Once the approval threshold is met (and there is still no feedback), the chip turns to a ' +
        'green APPROVED — visually distinct from the blue "PR OPEN" chip so "ready to merge" stands ' +
        'out. Here "backend-api" is still WAITING while "docs-site" is APPROVED.',
    })
  })

  test('Step 4: Feedback outranks approval', async () => {
    // A reviewer comments / requests changes on the approved PR.
    await setReviewState('docs-site', 'approved', { hasFeedback: true })

    const sidebar = page.locator('[data-panel-id="sidebar"]')
    const feedbackChip = sidebar.locator('text=FEEDBACK')
    await expect(feedbackChip).toBeVisible()

    const docsCard = sidebar.locator('.cursor-pointer:has-text("docs-site")')
    await screenshotElement(page, docsCard, path.join(SCREENSHOTS, '04-feedback-precedence.png'))
    steps.push({
      screenshotPath: 'screenshots/04-feedback-precedence.png',
      caption: 'A new comment flips APPROVED back to FEEDBACK',
      description:
        'The review chips never hide something actionable. The precedence is ' +
        'feedback > failed > approved > waiting > open, so the moment a reviewer comments or ' +
        'requests changes, the chip becomes FEEDBACK — even if the PR had been approved.',
    })
  })

  test('Step 5: Per-repo approval policy setting', async () => {
    const settingsButton = page.locator('button[title^="Settings"]')
    await settingsButton.click()
    const settingsPanel = page.locator('[data-panel-id="settings"]')
    await expect(settingsPanel).toBeVisible({ timeout: 5000 })

    await expect(settingsPanel.locator('text=Repositories')).toBeVisible()
    // Open a repo's settings screen (repo nav rows carry data-testid="nav-repo-<id>").
    const repoRow = settingsPanel.locator('[data-testid^="nav-repo-"]').first()
    await repoRow.click()

    // The new control from this feature.
    const policyLabel = settingsPanel.locator('text=Waiting status clears when')
    await expect(policyLabel).toBeVisible({ timeout: 3000 })

    await screenshotElement(page, settingsPanel, path.join(SCREENSHOTS, '05-approval-policy-setting.png'), {
      maxHeight: 700,
    })
    steps.push({
      screenshotPath: 'screenshots/05-approval-policy-setting.png',
      caption: 'Repo settings: choose when WAITING becomes APPROVED',
      description:
        'Each repository chooses its approval rule under "Waiting status clears when": ' +
        '"At least one reviewer approves" (the default) or "All requested reviewers approve". ' +
        'Teams that require unanimous sign-off keep the WAITING chip until every requested reviewer ' +
        'has approved.',
    })
  })
})
