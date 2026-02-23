/**
 * Feature Documentation: Better Default Branch Names
 *
 * Shows the improved branch name generation when creating a branch from a
 * GitHub issue. Common English words are stripped, producing cleaner names
 * like "dark-mode-toggle-settings-panel" instead of
 * "42-add-support-for-the-dark-mode-toggle-in-the-user-settings-panel".
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

  // Wait for app to fully initialize
  await page.waitForTimeout(3000)
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'Better Default Branch Names',
      description:
        'When creating a branch from a GitHub issue, the branch name is now generated ' +
        'by stripping common English words (the, of, for, in, etc.) from the issue title. ' +
        'This produces cleaner, more meaningful branch names — e.g. ' +
        '"Add support for the dark mode toggle in the user settings panel" becomes ' +
        '"dark-mode-toggle-settings-panel" instead of the old ' +
        '"42-add-support-for-the".',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)

  if (electronApp) {
    await electronApp.close()
  }
})

test.describe.serial('Feature: Better Default Branch Names', () => {
  test('Step 1: Open new session dialog and browse issues', async () => {
    // Click "+ New Session" to open dialog
    const newSessionBtn = page.locator('button:has-text("+ New Session")')
    await expect(newSessionBtn).toBeVisible()
    await newSessionBtn.click()
    await page.waitForTimeout(500)

    // Click Issues button
    const issuesBtn = page.locator('button:has-text("Issues")')
    await expect(issuesBtn).toBeVisible()
    await issuesBtn.click()
    await page.waitForTimeout(1000)

    // Issues view should show mock issues with long titles
    await expect(page.locator('text=dark mode toggle')).toBeVisible()

    const dialog = page.locator('.bg-bg-secondary.rounded-lg.shadow-xl')
    await screenshotElement(page, dialog, path.join(SCREENSHOTS, '01-issues-list.png'))
    steps.push({
      screenshotPath: 'screenshots/01-issues-list.png',
      caption: 'Issues list with verbose issue titles',
      description:
        'Two issues with long, natural-language titles: ' +
        '"Add support for the dark mode toggle in the user settings panel" and ' +
        '"Fix the crash that happens when clicking on an empty notification list". ' +
        'Previously these would produce branch names like "42-add-support-for-the" (truncated at 4 words).',
    })
  })

  test('Step 2: Select an issue — see the cleaned-up branch name', async () => {
    // Click on issue #42
    const issue = page.locator('button:has-text("dark mode toggle")')
    await issue.click()
    await page.waitForTimeout(500)

    // Should now be in NewBranchView with the issue shown
    await expect(page.locator('text=Issue #42')).toBeVisible()

    // The branch name should have common words stripped
    const input = page.locator('input[placeholder="feature/my-feature"]')
    const branchValue = await input.inputValue()

    // Should NOT have the issue number prefix
    expect(branchValue).not.toMatch(/^42-/)
    // Should NOT contain filler words
    expect(branchValue).not.toContain('support')
    expect(branchValue).not.toContain('-the-')
    expect(branchValue).not.toContain('-for-')
    expect(branchValue).not.toContain('-in-')
    // Should contain the meaningful words
    expect(branchValue).toContain('toggle')
    expect(branchValue).toContain('settings')

    const dialog = page.locator('.bg-bg-secondary.rounded-lg.shadow-xl')
    await screenshotElement(page, dialog, path.join(SCREENSHOTS, '02-cleaned-branch-name.png'))
    steps.push({
      screenshotPath: 'screenshots/02-cleaned-branch-name.png',
      caption: 'Common words stripped — only meaningful terms remain',
      description:
        'The full issue title is "Add support for the dark mode toggle in the user settings panel". ' +
        `The generated branch name is "${branchValue}" — common words like ` +
        '"add", "support", "for", "the", "in", and "user" have been removed, ' +
        'leaving only the domain-specific terms.',
    })
  })

  test('Step 3: Select a different issue to see another example', async () => {
    // Go back to issues list
    const backBtn = page.locator('button:has(svg path[d="M15 19l-7-7 7-7"])')
    await backBtn.first().click()
    await page.waitForTimeout(500)

    // Click the second issue
    const issue = page.locator('button:has-text("empty notification list")')
    await expect(issue).toBeVisible()
    await issue.click()
    await page.waitForTimeout(500)

    const input = page.locator('input[placeholder="feature/my-feature"]')
    const branchValue = await input.inputValue()

    // Should strip filler words
    expect(branchValue).not.toMatch(/^17-/)
    expect(branchValue).not.toContain('-that-')
    expect(branchValue).not.toContain('-when-')
    expect(branchValue).not.toContain('-on-')
    // Should keep meaningful words
    expect(branchValue).toContain('crash')
    expect(branchValue).toContain('notification')

    const dialog = page.locator('.bg-bg-secondary.rounded-lg.shadow-xl')
    await screenshotElement(page, dialog, path.join(SCREENSHOTS, '03-second-issue-branch.png'))
    steps.push({
      screenshotPath: 'screenshots/03-second-issue-branch.png',
      caption: 'Another verbose title reduced to its key terms',
      description:
        'The issue title "Fix the crash that happens when clicking on an empty notification list" ' +
        `becomes "${branchValue}". Words like "fix", "the", "that", "happens", "when", ` +
        '"clicking", "on", "an", and "empty" are filtered out as common English words.',
    })
  })
})
