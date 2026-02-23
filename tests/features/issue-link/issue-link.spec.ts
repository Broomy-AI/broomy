/**
 * Feature Documentation: Issue Link in Source Control
 *
 * Shows the full flow: creating a session from a GitHub issue via the new
 * session dialog, then seeing the issue link in the source control banner.
 * When a PR exists, the PR link replaces the issue link.
 *
 * Run with: pnpm test:feature-docs
 */
import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
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
      title: 'Issue Link in Source Control',
      description:
        'When a session is created from a GitHub issue, the source control banner shows a clickable ' +
        'link to the issue with its title. Once a PR is opened for the branch, the PR link replaces ' +
        'the issue link, since the PR provides more detail and links back to the issue.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)

  if (electronApp) {
    await electronApp.close()
  }
})

/** Helper to open explorer panel and switch to source control tab */
async function openSourceControl(page: Page): Promise<void> {
  // Ensure explorer is open via toolbar button
  const explorerButton = page.locator('button:has-text("Explorer")')
  const explorerClasses = await explorerButton.getAttribute('class').catch(() => '')
  if (!explorerClasses?.includes('bg-accent')) {
    await explorerButton.click()
    await page.waitForTimeout(300)
  }

  // Switch to source control tab via store
  await page.evaluate(() => {
    const store = (window as Record<string, unknown>).__sessionStore as {
      getState: () => { activeSessionId: string; setExplorerFilter: (id: string, filter: string) => void }
    }
    if (!store) return
    const state = store.getState()
    state.setExplorerFilter(state.activeSessionId, 'source-control')
  })
  await page.waitForTimeout(1000)
}

test.describe.serial('Feature: Issue Link in Source Control', () => {
  test('Step 1: Open new session dialog and click Issues', async () => {
    // Click "+ New Session" button
    const newSessionButton = page.locator('button:has-text("+ New Session")')
    await newSessionButton.click()
    await page.waitForTimeout(500)

    // The new session dialog should appear with the repo list
    const dialog = page.locator('.fixed.inset-0.z-50 > div')
    await expect(dialog).toBeVisible()

    // Find the Issues button for the demo-project repo
    const issuesButton = dialog.locator('button:has-text("Issues")')
    await expect(issuesButton).toBeVisible()

    await screenshotElement(page, dialog, path.join(SCREENSHOTS, '01-new-session-dialog.png'))
    steps.push({
      screenshotPath: 'screenshots/01-new-session-dialog.png',
      caption: 'New session dialog with Issues button',
      description:
        'The new session dialog shows managed repos. Each repo has an "Issues" button ' +
        'that fetches GitHub issues assigned to you.',
    })

    // Click Issues
    await issuesButton.click()
    await page.waitForTimeout(500)
  })

  test('Step 2: Issues list — select an issue', async () => {
    const dialog = page.locator('.fixed.inset-0.z-50 > div')

    // The issues list should show mock issues
    const issueRow = dialog.locator('button:has-text("#42")')
    await expect(issueRow).toBeVisible()

    // Verify the issue title is shown
    await expect(dialog.locator('text=Add user authentication')).toBeVisible()

    await screenshotElement(page, dialog, path.join(SCREENSHOTS, '02-issues-list.png'))
    steps.push({
      screenshotPath: 'screenshots/02-issues-list.png',
      caption: 'Issues list with assignee\'s open issues',
      description:
        'The issues view lists open GitHub issues assigned to you. Each shows the issue number, ' +
        'title, and labels. Click an issue to create a branch for it.',
    })

    // Select the issue
    await issueRow.click()
    await page.waitForTimeout(500)
  })

  test('Step 3: New branch view — issue details carried through', async () => {
    const dialog = page.locator('.fixed.inset-0.z-50 > div')

    // Should now be on the new branch view with issue details
    const issueInfo = dialog.locator('text=Issue #42')
    await expect(issueInfo).toBeVisible()
    await expect(dialog.locator('text=Add user authentication')).toBeVisible()

    await screenshotElement(page, dialog, path.join(SCREENSHOTS, '03-new-branch-from-issue.png'))
    steps.push({
      screenshotPath: 'screenshots/03-new-branch-from-issue.png',
      caption: 'New branch view with issue context',
      description:
        'The new branch form shows the issue details at the top and pre-fills a branch name ' +
        'derived from the issue title. The issue number, title, and URL will be saved with the session.',
    })

    // Close dialog without creating (we'll use the pre-existing sessions for the next steps)
    // Press Escape twice: first goes back to home view, second closes the dialog
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)

    // Ensure the dialog overlay is gone
    const overlay = page.locator('.fixed.inset-0.z-50')
    await expect(overlay).not.toBeVisible()
  })

  test('Step 4: Source control shows issue link (no PR yet)', async () => {
    // The first session (broomy) is on main branch → prStatus returns null
    // It has issueNumber: 42, issueTitle, issueUrl set → should show issue link
    const broomySession = page.locator('.cursor-pointer:has-text("broomy")')
    await expect(broomySession).toBeVisible()
    await broomySession.click()
    await page.waitForTimeout(500)

    await openSourceControl(page)

    // The issue chip should be visible in the explorer panel with title
    const explorer = page.locator('[data-panel-id="explorer"]')
    const issueBadge = explorer.locator('span', { hasText: /^ISSUE$/ })
    await expect(issueBadge).toBeVisible()

    const issueLink = explorer.locator('button', { hasText: '#42: Add user authentication' })
    await expect(issueLink).toBeVisible()

    await screenshotElement(page, explorer, path.join(SCREENSHOTS, '04-issue-link-no-pr.png'), {
      maxHeight: 300,
    })
    steps.push({
      screenshotPath: 'screenshots/04-issue-link-no-pr.png',
      caption: 'Issue link with title shown when no PR exists',
      description:
        'The "broomy" session was created from issue #42 "Add user authentication". Since no PR ' +
        'has been opened yet, the source control banner displays an ISSUE badge with a clickable ' +
        'link showing the issue number and title.',
    })
  })

  test('Step 5: PR replaces issue link once opened', async () => {
    // Switch to backend-api which is on feature/auth → has a mock PR
    // It also has issueNumber: 15, but the PR should take priority
    const backendSession = page.locator('.cursor-pointer:has-text("backend-api")')
    await backendSession.click()
    await page.waitForTimeout(500)

    await openSourceControl(page)

    // PR badge should be visible instead of issue
    const explorer = page.locator('[data-panel-id="explorer"]')
    const prBadge = explorer.locator('span', { hasText: /^OPEN$/ })
    await expect(prBadge).toBeVisible()

    // Issue badge should NOT be visible
    const issueBadge = explorer.locator('span', { hasText: /^ISSUE$/ })
    await expect(issueBadge).not.toBeVisible()

    // PR link should show
    const prLink = explorer.locator('button', { hasText: '#123' })
    await expect(prLink).toBeVisible()

    await screenshotElement(page, explorer, path.join(SCREENSHOTS, '05-pr-replaces-issue.png'), {
      maxHeight: 300,
    })
    steps.push({
      screenshotPath: 'screenshots/05-pr-replaces-issue.png',
      caption: 'PR link replaces issue link once a PR exists',
      description:
        'The "backend-api" session was also created from an issue (#15), but a PR (#123) has been ' +
        'opened. The PR link takes priority over the issue link, since the PR provides more detail ' +
        'and links back to the issue.',
    })
  })
})
