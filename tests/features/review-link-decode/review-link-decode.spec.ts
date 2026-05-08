/**
 * Feature Documentation: Review Links — URL-Encoded Path Decoding
 *
 * ReactMarkdown URL-encodes link `href` attributes per the CommonMark spec.
 * That meant a review link to "src/components/Theme Toggle.tsx" arrived in
 * the click handler as "src/components/Theme%20Toggle.tsx" and the file
 * viewer header displayed the escaped form. This walkthrough exercises a
 * review link with a space in the filename and shows that the file viewer
 * now opens at the unescaped path.
 *
 * Run with: pnpm test:feature-docs review-link-decode
 */
import { test, expect, resetApp } from '../_shared/electron-fixture'
import type { Page } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { screenshotElement, scrollToVisible } from '../_shared/screenshot-helpers'
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
  ;({ page } = await resetApp())
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'Review Links — URL-Encoded Path Decoding',
      description:
        'Review markdown is rendered by ReactMarkdown, which URL-encodes link hrefs per the ' +
        'CommonMark spec. A link to "src/components/Theme Toggle.tsx" arrives as ' +
        '"src/components/Theme%20Toggle.tsx" in the click handler. The review link parser now ' +
        'decodes the path before opening the file, so the file viewer shows the real filename ' +
        'instead of the percent-escaped form.',
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

test.describe.serial('Feature: Review Links — URL-Encoded Path Decoding', () => {
  test('Step 1: Review panel renders link to a path containing a space', async () => {
    await setupReviewSession(page)

    // The spaced link lives inside a sub-section under "Change Analysis".
    // Expand the parent section first if its sub-section toggle isn't visible yet.
    const subsectionToggle = page.locator('button:has-text("Toggle component with spaced filename")').first()
    if (!(await subsectionToggle.isVisible().catch(() => false))) {
      const changeAnalysis = page.locator('button:has-text("Change Analysis")').first()
      await scrollToVisible(changeAnalysis)
      await changeAnalysis.click()
    }
    await scrollToVisible(subsectionToggle)
    await subsectionToggle.click()

    // The link text retains the space — ReactMarkdown only encodes the href, not the visible text
    const spacedLink = page.locator('a:has-text("src/components/Theme Toggle.tsx")').first()
    await scrollToVisible(spacedLink)
    await expect(spacedLink).toBeVisible()

    // Confirm the underlying href is URL-encoded — this is the form the click handler receives
    const href = await spacedLink.getAttribute('href')
    expect(href).toContain('Theme%20Toggle.tsx')

    await screenshotElement(page, spacedLink, path.join(SCREENSHOTS, '01-review-link-with-space.png'), {
      padding: 12,
    })
    steps.push({
      screenshotPath: 'screenshots/01-review-link-with-space.png',
      caption: 'Review link to a file path containing a space',
      description:
        'The visible link text is "src/components/Theme Toggle.tsx", but ReactMarkdown encodes ' +
        'the href to "src/components/Theme%20Toggle.tsx" per the CommonMark spec. Before this ' +
        'fix, the encoded form leaked into the file viewer.',
    })
  })

  test('Step 2: Clicking the link opens the file viewer with the decoded path', async () => {
    const spacedLink = page.locator('a:has-text("src/components/Theme Toggle.tsx")').first()
    await scrollToVisible(spacedLink)
    await spacedLink.click()

    // The file viewer toolbar shows the basename — should be "Theme Toggle.tsx", NOT "Theme%20Toggle.tsx"
    await expect(page.getByText('Theme Toggle.tsx', { exact: true })).toBeVisible({ timeout: 5000 })

    // And the relative path next to it should not contain percent-encoding either
    const fileViewer = page.locator('[data-panel-id="fileViewer"]')
    await expect(fileViewer).toBeVisible()
    await expect(fileViewer.getByText('src/components/Theme Toggle.tsx')).toBeVisible({ timeout: 5000 })
    await expect(fileViewer.locator('text=%20')).toHaveCount(0)

    await page.screenshot({ path: path.join(SCREENSHOTS, '02-file-viewer-decoded-path.png') })
    steps.push({
      screenshotPath: 'screenshots/02-file-viewer-decoded-path.png',
      caption: 'File viewer header shows the unescaped filename',
      description:
        'After clicking the link, the file viewer toolbar displays "Theme Toggle.tsx" and ' +
        '"src/components/Theme Toggle.tsx" — the decoded form. No "%20" appears anywhere in ' +
        'the header. parseFileLink in ReviewPanel.tsx decodes the URL-encoded href before ' +
        'navigating, so downstream consumers (file viewer, recent files, session state) all ' +
        'see real filesystem paths.',
    })
  })
})
