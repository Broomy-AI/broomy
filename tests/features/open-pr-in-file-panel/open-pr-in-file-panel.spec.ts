/**
 * Feature Documentation: Open PR in File Panel
 *
 * Clicking the PR number in the source control banner opens the PR URL
 * in the file panel's embedded webview instead of the system browser.
 *
 * Run with: pnpm test:feature-docs open-pr-in-file-panel
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
      title: 'Open PR in File Panel',
      description:
        'When a session has an open pull request, clicking the PR link in the source control ' +
        'banner opens it in the file panel\'s embedded browser instead of the system browser. ' +
        'This keeps the user inside Broomy, just like code review links.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

/** Helper to open explorer panel and switch to source control tab */
async function openSourceControl(page: Page): Promise<void> {
  const explorerButton = page.locator('button:has-text("Explorer")')
  const explorerClasses = await explorerButton.getAttribute('class').catch(() => '')
  if (!explorerClasses?.includes('bg-accent')) {
    await explorerButton.click()
    await expect(page.locator('[data-panel-id="explorer"]')).toBeVisible()
  }

  await page.evaluate(() => {
    const store = (window as Record<string, unknown>).__sessionStore as {
      getState: () => { activeSessionId: string; setExplorerFilter: (id: string, filter: string) => void }
    }
    if (!store) return
    const state = store.getState()
    state.setExplorerFilter(state.activeSessionId, 'source-control')
  })
  await expect(page.locator('[data-panel-id="explorer"]').getByText(/^Changes \(/)).toBeVisible()
}

test.describe.serial('Feature: Open PR in File Panel', () => {
  test('Step 1: PR link visible in source control banner', async () => {
    // Switch to backend-api session which is on feature/auth → has mock PR #123
    const backendSession = page.locator('.cursor-pointer:has-text("backend-api")')
    await backendSession.click()

    await openSourceControl(page)

    const explorer = page.locator('[data-panel-id="explorer"]')
    const prBadge = explorer.locator('span', { hasText: /^OPEN$/ })
    await expect(prBadge).toBeVisible()

    const prLink = explorer.locator('button', { hasText: '#123' })
    await expect(prLink).toBeVisible()

    await screenshotElement(page, explorer, path.join(SCREENSHOTS, '01-pr-link-in-banner.png'), {
      maxHeight: 300,
    })
    steps.push({
      screenshotPath: 'screenshots/01-pr-link-in-banner.png',
      caption: 'PR link shown in source control banner',
      description:
        'The "backend-api" session is on a feature branch with an open PR (#123). ' +
        'The source control banner shows the PR state badge and a clickable link.',
    })
  })

  test('Step 2: Clicking PR link opens it in the file panel webview', async () => {
    const explorer = page.locator('[data-panel-id="explorer"]')
    const prLink = explorer.locator('button', { hasText: '#123' })

    // Click the PR link — should open in file panel, not external browser
    await prLink.click()

    // The file viewer panel should become visible with the PR URL
    const fileViewer = page.locator('[data-panel-id="fileViewer"]')
    await expect(fileViewer).toBeVisible({ timeout: 5000 })

    // The webview navigation bar should show the GitHub PR URL (in the font-mono URL bar)
    const urlBar = fileViewer.locator('.font-mono', { hasText: 'https://github.com/user/demo-project/pull/123' })
    await expect(urlBar).toBeVisible({ timeout: 5000 })

    // openExternal should NOT have been called (the PR opens inline)
    // We can't directly assert this in E2E, but the URL bar proves it opened in-app

    await page.screenshot({
      path: path.join(SCREENSHOTS, '02-pr-in-file-panel.png'),
    })
    steps.push({
      screenshotPath: 'screenshots/02-pr-in-file-panel.png',
      caption: 'PR opens in the file panel\'s embedded browser',
      description:
        'Clicking the PR link opens it in the file panel webview with navigation controls ' +
        '(back, forward, reload) and an "Open in browser" button. The user stays inside Broomy ' +
        'instead of being sent to the system browser.',
    })
  })
})
