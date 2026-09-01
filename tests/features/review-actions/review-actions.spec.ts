/**
 * Feature Documentation: Review Panel Actions
 *
 * Exercises the Explain button on review issues, the Comment button
 * with inline comment form, and the Draft Response Plan button.
 *
 * Run with: pnpm test:feature-docs review-actions
 */
import { test, expect, resetApp } from '../_shared/electron-fixture'
import type { ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { screenshotElement, screenshotClip, scrollToVisible } from '../_shared/screenshot-helpers'
import { generateFeaturePage, generateIndex, FeatureStep } from '../_shared/template'
import { resumeActiveSession } from '../_shared/resume-helpers'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const FEATURE_DIR = __dirname
const SCREENSHOTS = path.join(FEATURE_DIR, 'screenshots')
const FEATURES_ROOT = path.join(__dirname, '..')

let electronApp: ElectronApplication
let page: Page
const steps: FeatureStep[] = []

test.beforeAll(async () => {
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true })
  ;({ electronApp, page } = await resetApp())
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'Review Panel Actions',
      description:
        'The review panel now includes interactive action buttons on each issue: ' +
        'Explain asks the agent to provide a detailed analysis, Comment opens an inline ' +
        'form to add a draft PR comment, and Draft Response Plan asks the agent to help ' +
        'plan responses to all review findings.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

/** Set up the first session as a review session and navigate to the review tab */
async function setupReviewSession(p: Page) {
  await p.evaluate(() => {
    const store = (window as Record<string, unknown>).__sessionStore as {
      getState: () => { sessions: Record<string, unknown>[] }
      setState: (state: Record<string, unknown>) => void
    }
    if (!store) return

    const sessions = store.getState().sessions
    store.setState({
      sessions: sessions.map((s: Record<string, unknown>, i: number) => {
        if (i === 0) {
          const pv = (s.panelVisibility || {}) as Record<string, boolean>
          return {
            ...s,
            panelVisibility: { ...pv, explorer: true },
            prNumber: 123,
            prTitle: 'Add dark mode support',
            prUrl: 'https://github.com/user/demo-project/pull/123',
            prBaseBranch: 'main',
            sessionType: 'default',
            agentPtyId: 'mock-agent-pty',
          }
        }
        return s
      }),
    })
  })

  const firstSession = p.locator('.cursor-pointer').first()
  await firstSession.click()

  // Sessions restore paused — resume it so the Explain/Comment actions
  // below have an agent terminal to actually send to.
  await resumeActiveSession(p)

  await p.evaluate(() => {
    const store = (window as Record<string, unknown>).__sessionStore as {
      getState: () => {
        activeSessionId: string
        setExplorerFilter: (id: string, filter: string) => void
        setPanelVisibility: (id: string, panelId: string, visible: boolean) => void
      }
    }
    if (!store) return
    const state = store.getState()
    state.setPanelVisibility(state.activeSessionId, 'explorer', true)
    state.setExplorerFilter(state.activeSessionId, 'review')
  })
  await expect(p.locator('text=Overview')).toBeVisible({ timeout: 10000 })
}

test.describe.serial('Feature: Review Panel Actions', () => {
  // Pre-existing, unrelated to session-pause: this spec documents a
  // "Potential Issues" list with per-issue Explain/Comment buttons and a
  // "Draft Response Plan" button. None of that exists in the current
  // source (no "Explain" button, no explain-prompt.md/response-plan-prompt.md
  // anywhere in src/). It's been superseded by the CommentsDock system
  // (see src/renderer/panels/explorer/CommentsDock.tsx and the
  // diff-comments feature-doc: hover a source line, click "+", add an
  // inline comment, submit to agent). Confirmed by actually running this
  // spec (as asked) — Step 1 fails at the very first UI assertion
  // ("Explain" button not found), independent of pause. Rewriting this to
  // document CommentsDock instead is a real (and non-trivial) piece of
  // work and a product decision about what replaced this UI, not a
  // pause-fallout fix — flagged in the task-8 report rather than
  // attempted here.
  test.skip(true, 'Documents a review-issue Explain/Comment/Draft-Response-Plan UI that no longer exists in the app (superseded by CommentsDock) — pre-existing, unrelated to session-pause')


  test('Step 1: Review panel with issues showing Explain and Comment buttons', async () => {
    await setupReviewSession(page)

    const issuesSection = page.locator('button:has-text("Potential Issues")')
    await scrollToVisible(issuesSection)
    await issuesSection.click()

    // Wait for the Explain button to appear and scroll it into view
    const explainBtn = page.locator('button:has-text("Explain")').first()
    await expect(explainBtn).toBeVisible({ timeout: 5000 })
    await scrollToVisible(explainBtn)

    // Capture just the Potential Issues area with buttons visible
    const explorer = page.locator('[data-panel-id="explorer"]')
    const explorerBox = await explorer.boundingBox()
    const btnBox = await explainBtn.boundingBox()
    if (explorerBox && btnBox) {
      // Capture from the Potential Issues header down to below the buttons
      const captureTop = Math.max(explorerBox.y, btnBox.y - 150)
      const captureBottom = Math.min(explorerBox.y + explorerBox.height, btnBox.y + btnBox.height + 20)
      await screenshotClip(page, {
        x: explorerBox.x,
        y: captureTop,
        width: explorerBox.width,
        height: captureBottom - captureTop,
      }, path.join(SCREENSHOTS, '01-issues-with-buttons.png'))
    }
    steps.push({
      screenshotPath: 'screenshots/01-issues-with-buttons.png',
      caption: 'Potential issues with Explain and Comment action buttons',
      description:
        'Each potential issue shows "Explain" and "Comment" buttons at the bottom of the issue. ' +
        'Explain sends the issue details to the agent for analysis. Comment opens an inline form ' +
        'to add a draft PR comment at the issue\'s file location.',
    })
  })

  test('Step 2: Click Explain button — prompt sent to agent', async () => {
    const explainBtn = page.locator('button:has-text("Explain")').first()
    await explainBtn.click()

    // The agent terminal should be focused (tab switches to agent)
    // Wait for the terminal tab to switch
    await expect(page.locator('[data-panel-id="agent"]')).toBeVisible({ timeout: 3000 })

    const explorer = page.locator('[data-panel-id="explorer"]')
    await screenshotElement(page, explorer, path.join(SCREENSHOTS, '02-explain-clicked.png'), {
      maxHeight: 500,
    })
    steps.push({
      screenshotPath: 'screenshots/02-explain-clicked.png',
      caption: 'After clicking Explain — prompt written and agent command sent',
      description:
        'Clicking Explain writes a detailed prompt to .broomy/explain-prompt.md ' +
        'containing the issue title, severity, description, and locations. ' +
        'The agent terminal receives a command to read and follow the prompt.',
    })

    // Navigate back to review tab
    await page.evaluate(() => {
      const store = (window as Record<string, unknown>).__sessionStore as {
        getState: () => {
          activeSessionId: string
          setExplorerFilter: (id: string, filter: string) => void
        }
      }
      if (!store) return
      const state = store.getState()
      state.setExplorerFilter(state.activeSessionId, 'review')
    })
    await expect(page.locator('text=Overview')).toBeVisible({ timeout: 10000 })
  })

  test('Step 3: Click Comment button — inline comment form', async () => {
    const issuesSection = page.locator('button:has-text("Potential Issues")')
    await scrollToVisible(issuesSection)

    // Expand issues if collapsed
    const explainBtn = page.locator('button:has-text("Explain")').first()
    if (!await explainBtn.isVisible()) {
      await issuesSection.click()
    }

    const commentBtn = page.locator('button:has-text("Comment")').first()
    await scrollToVisible(commentBtn)
    await commentBtn.click()

    // The inline comment form should appear
    const commentInput = page.locator('input[placeholder="Type your comment..."]')
    await expect(commentInput).toBeVisible({ timeout: 3000 })

    await commentInput.fill('This looks like a false positive — the validation happens upstream in the middleware.')

    // Scroll the comment input into view and capture that area
    await scrollToVisible(commentInput)
    const explorer = page.locator('[data-panel-id="explorer"]')
    const explorerBox = await explorer.boundingBox()
    const inputBox = await commentInput.boundingBox()
    if (explorerBox && inputBox) {
      const captureTop = Math.max(explorerBox.y, inputBox.y - 150)
      const captureBottom = Math.min(explorerBox.y + explorerBox.height, inputBox.y + inputBox.height + 30)
      await screenshotClip(page, {
        x: explorerBox.x,
        y: captureTop,
        width: explorerBox.width,
        height: captureBottom - captureTop,
      }, path.join(SCREENSHOTS, '03-comment-form.png'))
    }
    steps.push({
      screenshotPath: 'screenshots/03-comment-form.png',
      caption: 'Inline comment form with typed response',
      description:
        'Clicking Comment reveals a compact inline form below the issue. ' +
        'The comment is saved to .broomy/comments.json and appears in the ' +
        'Pending Comments section, ready to be pushed as a draft review.',
    })
  })

  test('Step 4: Submit comment — appears in Pending Comments', async () => {
    const addBtn = page.locator('button:has-text("Add")').first()
    await addBtn.click()

    // Comment form should close
    const commentInput = page.locator('input[placeholder="Type your comment..."]')
    await expect(commentInput).not.toBeVisible({ timeout: 3000 })

    // Pending Comments section should now be visible
    const pendingSection = page.locator('button:has-text("Pending Comments")')
    await scrollToVisible(pendingSection)

    const explorer = page.locator('[data-panel-id="explorer"]')
    const explorerBox = await explorer.boundingBox()
    if (explorerBox) {
      const captureHeight = Math.min(explorerBox.height, 500)
      await screenshotClip(
        page,
        {
          x: explorerBox.x,
          y: explorerBox.y + explorerBox.height - captureHeight,
          width: explorerBox.width,
          height: captureHeight,
        },
        path.join(SCREENSHOTS, '04-comment-submitted.png'),
      )
    }
    steps.push({
      screenshotPath: 'screenshots/04-comment-submitted.png',
      caption: 'Comment submitted and visible in Pending Comments',
      description:
        'After submitting, the comment appears in the Pending Comments section ' +
        'with its file location and body text. The Push button count updates ' +
        'to reflect the new unpushed comment.',
    })
  })

  test('Step 5: Draft Response Plan button', async () => {
    // Scroll to top to see the header
    const scrollContainer = page.locator('[data-panel-id="explorer"] .overflow-y-auto').first()
    await scrollContainer.evaluate(el => { el.scrollTop = 0 })

    const draftBtn = page.locator('button:has-text("Draft Response Plan")')
    await expect(draftBtn).toBeVisible({ timeout: 5000 })

    const explorer = page.locator('[data-panel-id="explorer"]')
    await screenshotElement(page, explorer, path.join(SCREENSHOTS, '05-draft-response-plan.png'), {
      maxHeight: 300,
    })
    steps.push({
      screenshotPath: 'screenshots/05-draft-response-plan.png',
      caption: 'Draft Response Plan button in the review header',
      description:
        'The "Draft Response Plan" button appears when viewing your own PR and there are new ' +
        'reviewer comments since your last push. Clicking it writes a structured prompt to ' +
        '.broomy/response-plan-prompt.md that asks the agent to discuss which issues to address, ' +
        'then create a plan in .broomy/plan.md.',
    })
  })
})
