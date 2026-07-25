/**
 * E2E coverage for the docked Comments panel.
 *
 * Verifies that the CommentsDock (src/renderer/panels/explorer/CommentsDock.tsx)
 * renders in the Explorer for a normal, non-review session (proving the panel is
 * ungated to all sessions, not just reviews), and that its header toggles the
 * body open/closed with the expected empty state when there are no comments.
 */
import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'
import { dockerArgs } from './electron-launch-args'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let electronApp: ElectronApplication
let page: Page

test.beforeAll(async () => {
  electronApp = await electron.launch({
    args: [...dockerArgs, path.join(__dirname, '..', 'out', 'main', 'index.js')],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      E2E_TEST: 'true',
      E2E_HEADLESS: process.env.E2E_HEADLESS ?? 'true',
    },
  })
  page = await electronApp.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector('#root > div', { timeout: 10000 })
  // Wait for sessions to load
  await page.waitForSelector('.cursor-pointer', { timeout: 10000 })
})

test.afterAll(async () => {
  if (electronApp) await electronApp.close()
})

test.describe('Comments Dock', () => {
  test('is present, ungated, on a normal (non-review) session', async () => {
    // The first mock session ("broomy") is a normal session, not a review session.
    const broomySession = page.locator('.cursor-pointer:has-text("broomy")')
    await expect(broomySession).toBeVisible()
    await broomySession.click()

    // Open the Explorer panel.
    const explorerBtn = page.locator('button[title*="Explorer"]')
    const explorerPanel = page.locator('[data-panel-id="explorer"]')
    if (!(await explorerPanel.isVisible())) {
      await explorerBtn.click()
    }
    await expect(explorerPanel).toBeVisible()

    // The Comments header is present even though this is not a review session.
    const commentsHeader = explorerPanel.getByRole('button', { name: /^Comments/ })
    await expect(commentsHeader).toBeVisible({ timeout: 10000 })
  })

  test('clicking the header toggles the body collapsed/expanded', async () => {
    const explorerPanel = page.locator('[data-panel-id="explorer"]')
    const commentsHeader = explorerPanel.getByRole('button', { name: /^Comments/ })
    const emptyState = explorerPanel.getByText('No comments yet. Hover a line in a file and click + to add one.')

    // Expanded by default: chevron points down and the empty state is visible.
    await expect(commentsHeader).toContainText('▼')
    await expect(emptyState).toBeVisible()

    // Collapse: chevron flips up and the body disappears.
    await commentsHeader.click()
    await expect(commentsHeader).toContainText('▲')
    await expect(emptyState).not.toBeVisible()

    // Expand again: back to the empty state.
    await commentsHeader.click()
    await expect(commentsHeader).toContainText('▼')
    await expect(emptyState).toBeVisible()
  })
})
