/**
 * Feature Documentation: Inline diff/file comments
 *
 * Drives the real end-to-end flow on a source file — hover a line to reveal the
 * "+" over the line number, click it to open the inline comment box, type and
 * add the comment, see it accumulate in the docked Comments panel, and submit
 * it to the agent — capturing a screenshot at each step.
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
        'Hovering a line shows a "+" over its line number (the gutter never grows); clicking it ' +
        'opens an inline comment box that pushes the following lines down. Comments accumulate in ' +
        'a collapsible, resizable panel docked at the bottom of the explorer, and a single ' +
        '"Submit" sends them all to the agent as one numbered feedback block.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: Inline diff/file comments', () => {
  const fileViewer = () => page.locator('[data-panel-id="fileViewer"]')
  const explorer = () => page.locator('[data-panel-id="explorer"]')

  test('Step 1: Hover a source line to reveal the "+" over its line number', async () => {
    await page.locator('button[title*="Explorer"]').click()
    await explorer().locator('button[title="Files"]').click()
    await explorer().locator('text=src').first().click()
    await explorer().locator('text=index.ts').first().click()

    await expect(fileViewer().locator('.monaco-editor').first()).toBeVisible({ timeout: 10000 })
    await expect(fileViewer().locator('.view-lines')).toBeVisible({ timeout: 5000 })
    // Wait for the line-number gutter to have real geometry before hovering it.
    await expect.poll(async () => {
      const b = await fileViewer().locator('.margin .line-numbers').first().boundingBox()
      return b ? b.height : 0
    }, { timeout: 8000 }).toBeGreaterThan(0)

    // Hover the line-number gutter (two moves so Monaco registers it); the "+"
    // appears only over the gutter, never over the code text.
    const ln = await fileViewer().locator('.margin .line-numbers').first().boundingBox()
    if (!ln) throw new Error('no line-numbers')
    const gx = ln.x + ln.width / 2
    const gy = ln.y + 40
    await page.mouse.move(gx - 8, gy)
    await page.mouse.move(gx, gy)
    await expect(fileViewer().locator('button[aria-label^="Comment on line"]')).toBeVisible({ timeout: 5000 })

    await screenshotElement(page, fileViewer(), path.join(SCREENSHOTS, '01-plus-affordance.png'), { maxHeight: 320 })
    steps.push({
      screenshotPath: 'screenshots/01-plus-affordance.png',
      caption: 'Hovering a line shows a blue "+" in place of its line number',
      description:
        'The affordance appears over the line number — the gutter width never changes (no glyph ' +
        'margin). This works on any source file; hover any line and the "+" follows.',
    })
  })

  test('Step 2: Click the "+" to open the inline comment box', async () => {
    await fileViewer().locator('button[aria-label^="Comment on line"]').click()
    const textarea = fileViewer().locator('textarea[placeholder="Add a comment..."]')
    await expect(textarea).toBeVisible({ timeout: 5000 })
    await textarea.click()
    await textarea.fill('Is this the right default?')

    await screenshotElement(page, fileViewer(), path.join(SCREENSHOTS, '02-comment-box.png'), { maxHeight: 360 })
    steps.push({
      screenshotPath: 'screenshots/02-comment-box.png',
      caption: 'The comment box opens under the line and pushes the following lines down',
      description:
        'The box reserves its own space (the lines after it move down — no overlap) and is fully ' +
        'editable: click in, type, then Add (or ⌘/Ctrl+Enter). Escape or Cancel dismisses it.',
    })
  })

  test('Step 3: Add the comment — it appears in the docked Comments panel', async () => {
    await fileViewer().locator('button[aria-label="Add comment"]').click()
    const dockRow = explorer().locator('button', { hasText: /index\.ts:\d+/ })
    await expect(dockRow.first()).toBeVisible({ timeout: 5000 })

    await screenshotElement(page, explorer(), path.join(SCREENSHOTS, '03-comment-in-dock.png'), { maxHeight: 700 })
    steps.push({
      screenshotPath: 'screenshots/03-comment-in-dock.png',
      caption: 'The comment accumulates as a one-line summary in the Comments dock',
      description:
        'Each row shows file:line and the comment text, links back to that line, and can be edited ' +
        'or resolved. The dock is collapsible and resizable, and lives at the bottom of the ' +
        'explorer across all tabs and every session.',
    })
  })

  test('Step 4: Submit sends all comments to the agent and clears the list', async () => {
    const submitButton = explorer().getByRole('button', { name: /Submit \d+ comment/ })
    await expect(submitButton).toBeEnabled()
    await submitButton.click()
    await expect(explorer().getByText('No comments yet. Hover a line in a file and click + to add one.')).toBeVisible({ timeout: 5000 })

    await screenshotElement(page, page.locator('[data-panel-id="agent"]').first(), path.join(SCREENSHOTS, '04-submitted-to-agent.png'), { maxHeight: 360 }).catch(() => {})
    steps.push({
      screenshotPath: 'screenshots/04-submitted-to-agent.png',
      caption: 'Submitting pastes the numbered feedback block into the agent terminal',
      description:
        'The pending comments are formatted as one numbered block ("1.) file:line: \\"quoted\\" ...") ' +
        'and sent to the agent, then cleared from the dock.',
    })
  })
})
