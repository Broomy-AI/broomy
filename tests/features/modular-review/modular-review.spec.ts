/**
 * Feature Documentation: Modular Review System
 *
 * Exercises the markdown-based review panel that renders .broomy/review.md
 * with auto-collapsing headings, task list checkboxes, and GitHub link handling.
 *
 * Run with: pnpm test:feature-docs modular-review
 */
import { test, expect, resetApp } from '../_shared/electron-fixture'
import type { Page } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { screenshotElement, screenshotClip } from '../_shared/screenshot-helpers'
import { generateFeaturePage, generateIndex, FeatureStep } from '../_shared/template'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const FEATURE_DIR = __dirname
const SCREENSHOTS = path.join(FEATURE_DIR, 'screenshots')
const FEATURES_ROOT = path.join(__dirname, '..')

let page: Page
const steps: FeatureStep[] = []

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
            sessionType: 'review',
          }
        }
        return s
      }),
    })
  })

  const firstSession = p.locator('.cursor-pointer').first()
  await firstSession.click()

  // Open explorer and switch to review filter
  const explorerButton = p.locator('button[title*="Explorer"]').first()
  if (await explorerButton.isVisible()) {
    const cls = await explorerButton.getAttribute('class').catch(() => '')
    if (!cls?.includes('bg-accent')) {
      await explorerButton.click()
    }
  }

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
}

test.beforeAll(async () => {
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true })

  ;({ page } = await resetApp())
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'Modular Review System',
      description:
        'The review system uses markdown-driven reviews where the agent writes ' +
        '.broomy/review.md with auto-collapsing headings and GFM task list checkboxes. ' +
        'GitHub links open in an embedded webview. Teams can customize the review process ' +
        'by editing the review action in .broomy/commands.json.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: Modular Review System', () => {
  test('Step 1: Review panel header with PR info and Generate button', async () => {
    await setupReviewSession(page)

    // Wait for the review panel to render
    const generateBtn = page.locator('button:has-text("Generate Review"), button:has-text("Regenerate Review")')
    await expect(generateBtn).toBeVisible({ timeout: 10000 })

    // PR title should be visible
    const prTitle = page.locator('text=Add dark mode support')
    await expect(prTitle).toBeVisible({ timeout: 5000 })

    // PR number link should be visible
    const prLink = page.locator('button[title="Open PR on GitHub"]')
    await expect(prLink).toBeVisible({ timeout: 5000 })

    const explorer = page.locator('[data-panel-id="explorer"]')
    await screenshotElement(page, explorer, path.join(SCREENSHOTS, '01-review-header.png'), {
      maxHeight: 200,
    })
    steps.push({
      screenshotPath: 'screenshots/01-review-header.png',
      caption: 'Review panel header with PR title, number link, and Generate button',
      description:
        'The review panel header shows the PR title ("Add dark mode support"), ' +
        'a clickable PR number link (#123), and a Generate Review button. ' +
        'The button triggers the agent to write a markdown review.',
    })
  })

  test('Step 2: Markdown review with collapsible sections', async () => {
    // Wait for the review markdown to load (mock data provides it)
    const overviewSection = page.locator('button:has-text("Overview")')
    await expect(overviewSection).toBeVisible({ timeout: 10000 })

    // Verify multiple sections exist
    const changeAnalysis = page.locator('button:has-text("Change Analysis")')
    await expect(changeAnalysis).toBeVisible({ timeout: 5000 })

    const potentialIssues = page.locator('button:has-text("Potential Issues")')
    await expect(potentialIssues).toBeVisible({ timeout: 5000 })

    const designDecisions = page.locator('button:has-text("Design Decisions")')
    await expect(designDecisions).toBeVisible({ timeout: 5000 })

    const explorer = page.locator('[data-panel-id="explorer"]')
    await screenshotElement(page, explorer, path.join(SCREENSHOTS, '02-collapsible-sections.png'), {
      maxHeight: 600,
    })
    steps.push({
      screenshotPath: 'screenshots/02-collapsible-sections.png',
      caption: 'Review rendered as collapsible markdown sections',
      description:
        'The markdown review is split on ## headings into collapsible sections: ' +
        'Overview, Change Analysis, Potential Issues, and Design Decisions. ' +
        'Sections with incomplete checkboxes (- [ ]) stay expanded automatically.',
    })
  })

  test('Step 3: Task list checkboxes showing progress', async () => {
    // Expand the Change Analysis section to see checkboxes
    const changeAnalysis = page.locator('button:has-text("Change Analysis")')
    const isExpanded = await changeAnalysis.locator('svg').evaluate((el) => {
      return el.style.transform === 'rotate(90deg)' || el.classList.contains('rotate-90')
    }).catch(() => false)

    if (!isExpanded) {
      await changeAnalysis.click()
    }

    // Wait for checkbox content to be visible after expanding
    const checkboxItem = page.locator('text=Reviewed file structure')
    await expect(checkboxItem).toBeVisible({ timeout: 5000 })

    // The change analysis section should show completed checkboxes
    const explorer = page.locator('[data-panel-id="explorer"]')
    const scrollContainer = explorer.locator('.overflow-y-auto').first()
    await scrollContainer.evaluate(el => { el.scrollTop = 0 })

    // Screenshot the expanded section
    const explorerBox = await explorer.boundingBox()
    if (explorerBox) {
      await screenshotClip(
        page,
        {
          x: explorerBox.x,
          y: explorerBox.y,
          width: explorerBox.width,
          height: Math.min(explorerBox.height, 500),
        },
        path.join(SCREENSHOTS, '03-task-checkboxes.png'),
      )
    }
    steps.push({
      screenshotPath: 'screenshots/03-task-checkboxes.png',
      caption: 'GFM task list checkboxes showing review progress',
      description:
        'The review uses standard GFM task checkboxes: [x] for completed checks ' +
        'and [ ] for in-progress items. The agent writes these incrementally ' +
        'and the UI polls and re-renders as the review progresses.',
    })
  })

  test('Step 4: Potential Issues section with incomplete checkboxes stays expanded', async () => {
    // The Potential Issues section has a `- [ ]` item, so it should default to expanded
    const potentialIssues = page.locator('button:has-text("Potential Issues")')
    await expect(potentialIssues).toBeVisible()

    // Scroll to Potential Issues section
    const explorer = page.locator('[data-panel-id="explorer"]')
    const scrollContainer = explorer.locator('.overflow-y-auto').first()

    // Scroll down to find the Potential Issues section
    await scrollContainer.evaluate(el => { el.scrollTop = el.scrollHeight / 2 })
    await potentialIssues.scrollIntoViewIfNeeded()

    const explorerBox = await explorer.boundingBox()
    if (explorerBox) {
      await screenshotClip(
        page,
        {
          x: explorerBox.x,
          y: explorerBox.y + Math.max(0, explorerBox.height - 400),
          width: explorerBox.width,
          height: Math.min(explorerBox.height, 400),
        },
        path.join(SCREENSHOTS, '04-incomplete-expanded.png'),
      )
    }
    steps.push({
      screenshotPath: 'screenshots/04-incomplete-expanded.png',
      caption: 'Sections with incomplete checkboxes stay expanded',
      description:
        'The Potential Issues section contains an incomplete checkbox (- [ ]) ' +
        'so it defaults to expanded, drawing attention to items that still need review. ' +
        'Completed sections can be collapsed to reduce noise.',
    })
  })

  test('Step 5: Regenerate Review button after review exists', async () => {
    // Scroll back to top to see the header
    const explorer = page.locator('[data-panel-id="explorer"]')
    const scrollContainer = explorer.locator('.overflow-y-auto').first()
    await scrollContainer.evaluate(el => { el.scrollTop = 0 })

    // The button should now say "Regenerate Review" since review data exists
    const regenBtn = page.locator('button:has-text("Regenerate Review")')
    await expect(regenBtn).toBeVisible({ timeout: 5000 })

    await screenshotElement(page, explorer, path.join(SCREENSHOTS, '05-regenerate-button.png'), {
      maxHeight: 120,
    })
    steps.push({
      screenshotPath: 'screenshots/05-regenerate-button.png',
      caption: 'Button changes to "Regenerate Review" when a review exists',
      description:
        'Once a review has been generated, the button label changes to "Regenerate Review". ' +
        'Clicking it sends the agent new instructions to re-run the review process, ' +
        'which can be customized via the review action in .broomy/commands.json.',
    })
  })
})
