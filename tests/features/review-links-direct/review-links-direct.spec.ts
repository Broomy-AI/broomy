/**
 * Feature Documentation: Review Links — Internal Diff View
 *
 * AI review links now use repo-relative file paths instead of GitHub URLs.
 * Clicking a link opens the file in the internal diff viewer with scroll-to-line.
 * A "Show on GitHub" button in the diff toolbar lets users jump to GitHub when needed.
 *
 * Run with: pnpm test:feature-docs review-links-direct
 */
import { test, expect, resetApp } from '../_shared/electron-fixture'
import type { ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { screenshotElement, screenshotClip, scrollToVisible } from '../_shared/screenshot-helpers'
import { generateFeaturePage, generateIndex, FeatureStep } from '../_shared/template'

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
      title: 'Review Links — Internal Diff View',
      description:
        'AI review links now reference repo-relative file paths (e.g. src/file.tsx#L12-L45) instead of ' +
        'GitHub URLs. Clicking a link opens the file directly in the internal diff viewer at the referenced ' +
        'line. A prominent "Show on GitHub" button in the diff toolbar provides easy access to GitHub ' +
        'when users need to add comments.',
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
            panelVisibility: { ...pv, explorer: true, fileViewer: true },
            showExplorer: true,
            showFileViewer: true,
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

test.describe.serial('Feature: Review Links — Internal Diff View', () => {
  test('Step 1: Review panel with repo-relative file links', async () => {
    await setupReviewSession(page)

    const overviewSection = page.locator('text=Overview')
    await expect(overviewSection).toBeVisible({ timeout: 10000 })

    // Verify that the review contains repo-relative links (not GitHub URLs)
    const linkText = page.locator('a:has-text("src/contexts/ThemeContext.tsx")')
    await expect(linkText.first()).toBeVisible({ timeout: 5000 })

    const explorer = page.locator('[data-panel-id="explorer"]')
    await screenshotElement(page, explorer, path.join(SCREENSHOTS, '01-review-with-links.png'), {
      maxHeight: 500,
    })
    steps.push({
      screenshotPath: 'screenshots/01-review-with-links.png',
      caption: 'Review panel with repo-relative file path links',
      description:
        'The AI review now uses repo-relative file paths like [src/contexts/ThemeContext.tsx:1-25] ' +
        'instead of GitHub URLs. These render as clickable links that open directly in the internal diff viewer.',
    })
  })

  test('Step 2: Click a file link to open internal diff viewer', async () => {
    // Expand Change Analysis section if collapsed
    const changeAnalysis = page.locator('button:has-text("Change Analysis")')
    if (await changeAnalysis.isVisible()) {
      await scrollToVisible(changeAnalysis)
      await changeAnalysis.click()
    }

    // Find and click a repo-relative file link
    const fileLink = page.locator('a:has-text("src/contexts/ThemeContext.tsx")').first()
    await scrollToVisible(fileLink)
    await fileLink.click()

    // Wait for the file viewer to show the file name in the toolbar
    await expect(page.getByText('ThemeContext.tsx', { exact: true })).toBeVisible({ timeout: 5000 })

    // Screenshot the full window to show both review panel and file viewer
    await page.screenshot({
      path: path.join(SCREENSHOTS, '02-link-opens-diff.png'),
    })

    steps.push({
      screenshotPath: 'screenshots/02-link-opens-diff.png',
      caption: 'Clicking a review link opens the file in the internal diff viewer',
      description:
        'Clicking a repo-relative file link in the review navigates to the file in diff mode, ' +
        'comparing against the PR base branch. The diff viewer opens immediately — much faster ' +
        'than navigating to GitHub.',
    })
  })

  test('Step 3: Show on GitHub button in diff toolbar', async () => {
    // The file viewer toolbar should now have a "Show on GitHub" button
    const githubButton = page.locator('button:has-text("Show on GitHub")')
    await expect(githubButton).toBeVisible({ timeout: 5000 })

    // Screenshot the toolbar area showing the button
    const fileViewerPanel = page.locator('[data-panel-id="fileViewer"]')
    if (await fileViewerPanel.isVisible()) {
      const box = await fileViewerPanel.boundingBox()
      if (box) {
        await screenshotClip(
          page,
          {
            x: box.x,
            y: box.y,
            width: box.width,
            height: Math.min(60, box.height),
          },
          path.join(SCREENSHOTS, '03-github-button.png'),
        )
      }
    } else {
      // Fallback: screenshot the toolbar button directly
      await screenshotElement(page, githubButton, path.join(SCREENSHOTS, '03-github-button.png'), {
        padding: 12,
      })
    }

    steps.push({
      screenshotPath: 'screenshots/03-github-button.png',
      caption: '"Show on GitHub" button in the diff viewer toolbar',
      description:
        'When viewing a diff in a review session, a prominent "Show on GitHub" button appears ' +
        'in the toolbar. Clicking it opens the specific file\'s diff on the PR page on GitHub, ' +
        'where users can add inline comments. This provides the best of both worlds: fast local ' +
        'diffs for reading, with easy access to GitHub for commenting.',
    })
  })
})
