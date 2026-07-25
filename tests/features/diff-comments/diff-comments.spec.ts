/**
 * Feature Documentation: Inline diff/file comments
 *
 * Walks through the accumulated-comments workflow: the collapsible "Comments"
 * dock pinned to the bottom of the explorer (available on every session), its
 * collapse/expand affordance, and the file viewer where line comments are
 * created by hovering the gutter and clicking the "+".
 *
 * Run with: pnpm test:feature-docs diff-comments
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
  ;({ page } = await resetApp())
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'Inline diff/file comments',
      description:
        'Reviewers can leave line-level comments on any file or diff without opening a PR. ' +
        'Comments accumulate in a collapsible, resizable panel docked at the bottom of the ' +
        'explorer — available on every session, not just review sessions. A single "Submit" ' +
        'sends every pending comment to the agent as one numbered feedback block, then clears ' +
        'the list.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: Inline diff/file comments', () => {
  test('Step 1: The Comments dock is pinned to the bottom of the explorer', async () => {
    const explorerBtn = page.locator('button[title*="Explorer"]')
    await explorerBtn.click()
    const explorerPanel = page.locator('[data-panel-id="explorer"]')
    await expect(explorerPanel).toBeVisible()

    // The dock is present on a normal (non-review) session, proving it is ungated.
    const commentsHeader = explorerPanel.getByRole('button', { name: /^Comments/ })
    await expect(commentsHeader).toBeVisible()
    await expect(explorerPanel.getByText(/No comments yet/i)).toBeVisible()

    await screenshotElement(page, explorerPanel, path.join(SCREENSHOTS, '01-comments-dock.png'), {
      maxHeight: 700,
    })
    steps.push({
      screenshotPath: 'screenshots/01-comments-dock.png',
      caption: 'The "Comments" dock sits at the bottom of the explorer',
      description:
        'On any session, the explorer has a docked "Comments" section pinned below the tab ' +
        'content. With nothing added yet it shows an empty-state hint. As you leave comments ' +
        'they accumulate here as one-line summaries, each linking back to its file and line.',
    })
  })

  test('Step 2: The dock collapses so it never dominates the explorer', async () => {
    const explorerPanel = page.locator('[data-panel-id="explorer"]')
    const commentsHeader = explorerPanel.getByRole('button', { name: /^Comments/ })

    await commentsHeader.click()
    // Collapsed: the body/empty-state is gone and the chevron flips to ▲.
    await expect(explorerPanel.getByText(/No comments yet/i)).toHaveCount(0)
    await expect(commentsHeader).toContainText('▲')

    await screenshotElement(page, explorerPanel, path.join(SCREENSHOTS, '02-dock-collapsed.png'), {
      maxHeight: 700,
    })
    steps.push({
      screenshotPath: 'screenshots/02-dock-collapsed.png',
      caption: 'Collapsing the dock frees up space for navigation',
      description:
        'Clicking the "Comments" header collapses it to a thin bar (chevron flips to ▲), so it ' +
        'stays out of the way while you browse files. The dock is also resizable by dragging its ' +
        'top edge. Click the header again to expand it.',
    })

    // Re-expand for the next step.
    await commentsHeader.click()
    await expect(explorerPanel.getByText(/No comments yet/i)).toBeVisible()
  })

  test('Step 3: Comments are created from the file/diff viewer gutter', async () => {
    const explorerPanel = page.locator('[data-panel-id="explorer"]')

    // Open a file so the viewer (where comments are made) is visible.
    await explorerPanel.locator('button[title="Files"]').click()
    await explorerPanel.locator('text=README.md').first().click()

    const fileViewer = page.locator('[data-panel-id="fileViewer"]')
    await expect(fileViewer).toBeVisible({ timeout: 10000 })
    await expect(fileViewer.locator('text=README.md').first()).toBeVisible()

    await screenshotElement(page, fileViewer, path.join(SCREENSHOTS, '03-file-viewer.png'), {
      maxHeight: 700,
    })
    steps.push({
      screenshotPath: 'screenshots/03-file-viewer.png',
      caption: 'Hover a line in the file or diff viewer to comment',
      description:
        'Opening a file (or a diff) shows the code with a comment gutter. Hovering any line ' +
        'reveals a blue "+" in the gutter; clicking it opens an inline comment box right under ' +
        'that line. Adding a comment drops a one-line summary into the Comments dock, and once ' +
        'you have a few, "Submit" sends them all to the agent as a single numbered feedback block.',
    })
  })
})
