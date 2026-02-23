/**
 * Feature Documentation: PR Description & Comments in Review Panel
 *
 * Exercises the flow of viewing PR description and GitHub comments
 * within the Review panel, capturing screenshots at each stage.
 *
 * Run with: pnpm test:feature-docs
 */
import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
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
      title: 'PR Description & Comments',
      description:
        'When reviewing a PR, the Review panel now shows the PR description fetched from GitHub ' +
        'and all PR comments (both top-level discussion comments and inline review comments) ' +
        'with threaded replies, relative timestamps, and clickable file location links.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)

  if (electronApp) {
    await electronApp.close()
  }
})

/** Ensure the explorer panel is visible and switch to the review tab */
async function openReviewInExplorer(p: Page) {
  // Ensure explorer panel is open via toolbar
  const explorerButton = p.locator('button[title*="Explorer"]').first()
  if (await explorerButton.isVisible()) {
    const cls = await explorerButton.getAttribute('class').catch(() => '')
    if (!cls?.includes('bg-accent')) {
      await explorerButton.click()
      await p.waitForTimeout(300)
    }
  }

  // Set explorer visible + review filter via store
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
  await p.waitForTimeout(500)
}

test.describe.serial('Feature: PR Description & Comments', () => {
  test('Step 1: Set up a session with PR data and navigate to Review tab', async () => {
    // Set prNumber on the first session so the review panel fetches PR data
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

    // Click the first session
    const firstSession = page.locator('.cursor-pointer').first()
    await firstSession.click()
    await page.waitForTimeout(500)

    // Open review tab in explorer
    await openReviewInExplorer(page)
    await page.waitForTimeout(2000)

    // Screenshot the explorer panel with review tab and PR header
    const explorer = page.locator('[data-panel-id="explorer"]')
    await expect(explorer).toBeVisible({ timeout: 5000 })
    await screenshotElement(page, explorer, path.join(SCREENSHOTS, '01-review-tab-pr-header.png'), {
      maxHeight: 300,
    })
    steps.push({
      screenshotPath: 'screenshots/01-review-tab-pr-header.png',
      caption: 'Review tab showing PR title and number',
      description:
        'The Review tab in the Explorer panel displays the PR title ("Add dark mode support") in the header ' +
        'and a clickable #123 link that opens the PR on GitHub. The "Generate Review" button triggers AI review generation.',
    })
  })

  test('Step 2: Full review with PR description and AI analysis', async () => {
    // E2E mock returns review.json data automatically — wait for it to load
    const overviewSection = page.locator('text=Overview')
    await expect(overviewSection).toBeVisible({ timeout: 10000 })

    // PR Description should also be visible (fetched from mock gh:prDescription)
    const prDescSection = page.locator('text=PR Description')
    await expect(prDescSection).toBeVisible({ timeout: 5000 })

    // Screenshot the full review content
    const explorer = page.locator('[data-panel-id="explorer"]')
    await screenshotElement(page, explorer, path.join(SCREENSHOTS, '02-full-review-with-description.png'), {
      maxHeight: 800,
    })
    steps.push({
      screenshotPath: 'screenshots/02-full-review-with-description.png',
      caption: 'Full review with PR Description alongside AI analysis',
      description:
        'The PR Description section (fetched from GitHub) appears alongside the AI-generated Overview, ' +
        'Change Patterns, Potential Issues, and Design Decisions. This gives reviewers both the author\'s ' +
        'intent and the AI\'s structured analysis in one scrollable view.',
    })
  })

  test('Step 3: PR Description section detail', async () => {
    // Scroll to make PR Description visible
    const scrollContainer = page.locator('[data-panel-id="explorer"] .overflow-y-auto').first()
    await scrollContainer.evaluate(el => el.scrollTop = 0)
    await page.waitForTimeout(300)

    // Find the PR Description text content
    const descContent = page.locator('text=This PR adds dark mode support')
    await expect(descContent).toBeVisible({ timeout: 5000 })

    const explorer = page.locator('[data-panel-id="explorer"]')
    await screenshotElement(page, explorer, path.join(SCREENSHOTS, '03-pr-description-detail.png'), {
      maxHeight: 500,
    })
    steps.push({
      screenshotPath: 'screenshots/03-pr-description-detail.png',
      caption: 'PR Description with markdown-style content from GitHub',
      description:
        'The PR description is fetched directly from GitHub and displayed in a collapsible section. ' +
        'It shows the full description including the changelog: "Added theme toggle component", ' +
        '"Updated CSS variables", and "Persisted preference in localStorage".',
    })
  })

  test('Step 4: PR Comments section with threaded replies', async () => {
    // Make the window taller so we have room to show the full PR Comments section
    await page.setViewportSize({ width: 1400, height: 1200 })
    await page.waitForTimeout(500)

    const scrollContainer = page.locator('[data-panel-id="explorer"] .overflow-y-auto').first()

    // Scroll to bottom so the PR Comments header is visible
    await scrollContainer.evaluate(el => el.scrollTop = el.scrollHeight)
    await page.waitForTimeout(300)

    // Find PR Comments header and click to expand (it defaults to collapsed)
    const prCommentsBtn = page.locator('button:has-text("PR Comments")')
    await expect(prCommentsBtn).toBeVisible({ timeout: 5000 })
    await prCommentsBtn.click()
    await page.waitForTimeout(500)

    // Scroll again to ensure expanded comments are fully visible
    await scrollContainer.evaluate(el => el.scrollTop = el.scrollHeight)
    await page.waitForTimeout(300)

    // Screenshot from the PR Comments header downward
    const headerBox = await prCommentsBtn.boundingBox()
    const explorerBox = await page.locator('[data-panel-id="explorer"]').boundingBox()
    if (headerBox && explorerBox) {
      const y = Math.max(0, headerBox.y - 8)
      const bottom = explorerBox.y + explorerBox.height
      await screenshotClip(
        page,
        {
          x: explorerBox.x,
          y,
          width: explorerBox.width,
          height: bottom - y,
        },
        path.join(SCREENSHOTS, '04-pr-comments.png'),
      )
    }

    // Restore viewport size
    await page.setViewportSize({ width: 1400, height: 900 })
    await page.waitForTimeout(300)
    steps.push({
      screenshotPath: 'screenshots/04-pr-comments.png',
      caption: 'PR Comments aggregated from GitHub',
      description:
        'The PR Comments section aggregates both top-level discussion comments and inline review comments ' +
        'from GitHub. Each comment shows the author name, a relative timestamp, and the comment body. ' +
        'Inline review comments include a clickable file location link (e.g., "index.ts:10"). ' +
        'The count badge shows the total number of comments.',
    })
  })

  test('Step 5: Collapsible sections for organizing review content', async () => {
    // Scroll back to top
    const scrollContainer = page.locator('[data-panel-id="explorer"] .overflow-y-auto').first()
    await scrollContainer.evaluate(el => el.scrollTop = 0)
    await page.waitForTimeout(300)

    // Click PR Description header to collapse it
    const prDescHeader = page.locator('button:has-text("PR Description")').first()
    if (await prDescHeader.isVisible()) {
      await prDescHeader.click()
      await page.waitForTimeout(300)
    }

    const explorer = page.locator('[data-panel-id="explorer"]')
    await screenshotElement(page, explorer, path.join(SCREENSHOTS, '05-collapsible-sections.png'), {
      maxHeight: 600,
    })
    steps.push({
      screenshotPath: 'screenshots/05-collapsible-sections.png',
      caption: 'Collapsible sections keep the review organized',
      description:
        'All sections — PR Description, Overview, Change Patterns, Potential Issues, Design Decisions, ' +
        'and PR Comments — are collapsible. This lets reviewers focus on the most relevant parts ' +
        'and collapse sections they\'ve already read.',
    })
  })
})
