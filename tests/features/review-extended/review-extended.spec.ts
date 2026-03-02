/**
 * Feature Documentation: Extended Review Panel
 *
 * Demonstrates the three new sections added to the Review panel:
 * Automated Checks, Agent Analyses, and Screenshot Walkthrough.
 * Also shows how to configure checks in repo settings.
 *
 * Run with: pnpm test:feature-docs review-extended
 */
import { test, expect, resetApp } from '../_shared/electron-fixture'
import type { Page, Locator } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { scrollToVisible, screenshotClip } from '../_shared/screenshot-helpers'
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
      title: 'Extended Review Panel',
      description:
        'The Review panel has been extended with three new optional sections: ' +
        'Automated Checks (run lint, typecheck, tests as a sequence of commands with expandable output), ' +
        'Agent Analyses (security, accessibility reviews via sub-agent), ' +
        'and Screenshot Walkthrough (agent-generated HTML walkthrough). ' +
        'Each section is enabled and configured per-repo in Settings.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

/**
 * Screenshot the visible area of a panel, anchored at the top of `anchorLocator`.
 * Captures from the anchor element's top edge down to `height` pixels,
 * using the panel's full width for the clip.
 */
async function screenshotFromAnchor(
  p: Page,
  panel: Locator,
  anchorLocator: Locator,
  filePath: string,
  height: number,
) {
  const panelBox = await panel.boundingBox()
  const anchorBox = await anchorLocator.boundingBox()
  if (!panelBox || !anchorBox) throw new Error(`Elements not found for screenshot: ${filePath}`)

  const padding = 4
  await screenshotClip(p, {
    x: Math.max(0, panelBox.x - padding),
    y: Math.max(0, anchorBox.y - padding),
    width: panelBox.width + padding * 2,
    height,
  }, filePath)
}

/** Set up a review session with PR data */
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
            repoId: 'repo-1',
            prNumber: 42,
            prTitle: 'Add user authentication',
            prUrl: 'https://github.com/user/demo-project/pull/42',
            prBaseBranch: 'main',
            sessionType: 'review',
          }
        }
        return s
      }),
    })
  })

  // Click first session
  const firstSession = p.locator('[data-panel-id="sidebar"] div.cursor-pointer').first()
  await firstSession.click()
}

/** Enable extended features on all repos */
async function enableExtendedFeatures(p: Page) {
  await p.evaluate(() => {
    const store = (window as Record<string, unknown>).__repoStore as {
      getState: () => { repos: Record<string, unknown>[] }
      setState: (state: Record<string, unknown>) => void
    }
    if (!store) return

    const repos = store.getState().repos
    store.setState({
      repos: repos.map((r: Record<string, unknown>) => ({
        ...r,
        checksEnabled: true,
        checkCommands: { lint: 'pnpm lint', typecheck: 'pnpm typecheck', test: 'pnpm test:unit' },
        enabledAnalyses: ['security', 'accessibility'],
        walkthroughEnabled: true,
      })),
    })
  })
}

/** Open explorer panel and switch to review filter */
async function openReviewInExplorer(p: Page) {
  const explorerButton = p.locator('button[title*="Explorer"]').first()
  if (await explorerButton.isVisible()) {
    const cls = await explorerButton.getAttribute('class').catch(() => '')
    if (!cls?.includes('bg-accent')) {
      await explorerButton.click()
      await expect(explorerButton).toHaveClass(/bg-accent/, { timeout: 5000 })
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
  await expect(p.locator('text=Overview')).toBeVisible({ timeout: 10000 })
}

test.describe.serial('Feature: Extended Review Panel', () => {
  test('Step 1: Open repo settings and configure automated checks', async () => {
    // Open Settings panel
    const settingsBtn = page.locator('button[title*="Settings"]')
    await settingsBtn.click()
    const settingsPanel = page.locator('[data-panel-id="settings"]')
    await expect(settingsPanel).toBeVisible()

    // Click the gear icon on the repo to open RepoSettingsEditor
    const editRepoBtn = settingsPanel.locator('button[title="Edit repo settings"]').first()
    await scrollToVisible(editRepoBtn)
    await editRepoBtn.click()

    // Wait for the editor to appear
    const saveBtn = settingsPanel.locator('button:has-text("Save")')
    await expect(saveBtn).toBeVisible({ timeout: 5000 })

    // Scroll down to the "Automated Checks" section
    const checksHeading = settingsPanel.getByText('Automated Checks', { exact: true })
    await scrollToVisible(checksHeading)

    // Enable the checks checkbox
    const checksCheckbox = settingsPanel.locator('label').filter({ hasText: 'Enable automated checks' })
    await checksCheckbox.click()

    // Wait for the command inputs to appear
    const lintInput = settingsPanel.locator('input[placeholder="npm run lint"]')
    await expect(lintInput).toBeVisible({ timeout: 3000 })

    // Fill in check commands
    await lintInput.fill('pnpm lint')
    const typecheckInput = settingsPanel.locator('input[placeholder="npm run typecheck"]')
    await typecheckInput.fill('pnpm typecheck')
    const testInput = settingsPanel.locator('input[placeholder="npm run test"]')
    await testInput.fill('pnpm test:unit')

    // Scroll the last input into view so all three command fields are visible
    await scrollToVisible(testInput)

    // Screenshot anchored at the "Automated Checks" heading
    await screenshotFromAnchor(page, settingsPanel, checksHeading,
      path.join(SCREENSHOTS, '01-settings-checks-config.png'), 300)
    steps.push({
      screenshotPath: 'screenshots/01-settings-checks-config.png',
      caption: 'Configuring automated checks in repo settings',
      description:
        'The repo settings editor now has an "Automated Checks" section. Enable it to configure ' +
        'commands for lint, typecheck, and test. Each command runs sequentially when "Run Checks" ' +
        'is clicked in the review panel. Custom checks can also be added.',
    })

    // Close settings
    const cancelBtn = settingsPanel.locator('button:has-text("Cancel")')
    await cancelBtn.click()
    await settingsBtn.click()
  })

  test('Step 2: Open repo settings and configure analyses and walkthrough', async () => {
    // Re-open settings
    const settingsBtn = page.locator('button[title*="Settings"]')
    await settingsBtn.click()
    const settingsPanel = page.locator('[data-panel-id="settings"]')
    await expect(settingsPanel).toBeVisible()

    const editRepoBtn = settingsPanel.locator('button[title="Edit repo settings"]').first()
    await scrollToVisible(editRepoBtn)
    await editRepoBtn.click()

    const saveBtn = settingsPanel.locator('button:has-text("Save")')
    await expect(saveBtn).toBeVisible({ timeout: 5000 })

    // Scroll to Agent Analyses section
    const analysesHeading = settingsPanel.getByText('Agent Analyses', { exact: true })
    await scrollToVisible(analysesHeading)

    // Enable security analysis
    const securityLabel = settingsPanel.locator('label').filter({ hasText: 'Security Review' })
    await securityLabel.click()

    // Enable accessibility analysis
    const a11yLabel = settingsPanel.locator('label').filter({ hasText: 'Accessibility Review' })
    await a11yLabel.click()

    // Scroll to walkthrough section
    const walkthroughHeading = settingsPanel.getByText('Screenshot Walkthrough', { exact: true })
    await scrollToVisible(walkthroughHeading)

    const walkthroughCheckbox = settingsPanel.locator('label').filter({ hasText: 'Enable walkthrough generation' })
    await walkthroughCheckbox.click()

    // Screenshot anchored at "Agent Analyses" heading — captures analyses + walkthrough
    await screenshotFromAnchor(page, settingsPanel, analysesHeading,
      path.join(SCREENSHOTS, '02-settings-analyses-walkthrough.png'), 350)
    steps.push({
      screenshotPath: 'screenshots/02-settings-analyses-walkthrough.png',
      caption: 'Configuring agent analyses and walkthrough in repo settings',
      description:
        'Below the checks config, "Agent Analyses" lets you enable security and accessibility reviews ' +
        'that run as sub-agent tasks. "Screenshot Walkthrough" enables a section where the agent generates ' +
        'a Playwright-based HTML walkthrough viewable in-app.',
    })

    // Cancel and close
    const cancelBtn = settingsPanel.locator('button:has-text("Cancel")')
    await cancelBtn.click()
    await settingsBtn.click()
  })

  test('Step 3: Review panel shows Checks section with Run Checks button', async () => {
    await setupReviewSession(page)
    await enableExtendedFeatures(page)
    await openReviewInExplorer(page)

    const explorer = page.locator('[data-panel-id="explorer"]')

    // Scroll to the Checks section
    const checksHeader = explorer.getByRole('button', { name: 'Checks', exact: true })
    await scrollToVisible(checksHeader)
    await expect(checksHeader).toBeVisible({ timeout: 5000 })

    // Ensure Run Checks button is visible
    const runChecksBtn = explorer.getByRole('button', { name: 'Run Checks' })
    await scrollToVisible(runChecksBtn)
    await expect(runChecksBtn).toBeVisible({ timeout: 3000 })

    // Screenshot anchored at the Checks section header
    await screenshotFromAnchor(page, explorer, checksHeader,
      path.join(SCREENSHOTS, '03-checks-section.png'), 250)
    steps.push({
      screenshotPath: 'screenshots/03-checks-section.png',
      caption: 'Checks section in the review panel with Run Checks button',
      description:
        'The Checks section lists the configured commands (lint, typecheck, test). ' +
        'Click "Run Checks" to execute them sequentially. Each check shows a status icon ' +
        '(pending circle, spinner, checkmark, or X) and its duration. Click a completed check ' +
        'to expand and see the full terminal output.',
    })
  })

  test('Step 4: Analyses section with per-analysis Run buttons', async () => {
    const explorer = page.locator('[data-panel-id="explorer"]')

    // Scroll to the Analyses section
    const analysesHeader = explorer.getByRole('button', { name: 'Analyses', exact: true })
    await scrollToVisible(analysesHeader)
    await expect(analysesHeader).toBeVisible({ timeout: 5000 })

    // Verify analysis cards are visible
    const securityCard = explorer.locator('text=Security Review')
    await scrollToVisible(securityCard)

    // Screenshot anchored at the Analyses section header
    await screenshotFromAnchor(page, explorer, analysesHeader,
      path.join(SCREENSHOTS, '04-analyses-section.png'), 300)
    steps.push({
      screenshotPath: 'screenshots/04-analyses-section.png',
      caption: 'Agent Analyses section with Security and Accessibility reviews',
      description:
        'The Analyses section shows enabled analysis types. Each has a "Run" button that sends ' +
        'a prompt to the agent, which writes results to .broomy/analyses/. The panel polls for ' +
        'results and displays findings inline with severity badges and file location links. ' +
        '"Run All" triggers every enabled analysis at once.',
    })
  })

  test('Step 5: Walkthrough section with Generate button', async () => {
    const explorer = page.locator('[data-panel-id="explorer"]')

    // Scroll to the Walkthrough section
    const walkthroughHeader = explorer.getByRole('button', { name: 'Walkthrough', exact: true })
    await scrollToVisible(walkthroughHeader)
    await expect(walkthroughHeader).toBeVisible({ timeout: 5000 })

    // Verify generate button visible
    const generateBtn = explorer.getByRole('button', { name: 'Generate Walkthrough' })
    await scrollToVisible(generateBtn)

    // Screenshot anchored at the Walkthrough section header
    await screenshotFromAnchor(page, explorer, walkthroughHeader,
      path.join(SCREENSHOTS, '05-walkthrough-section.png'), 200)
    steps.push({
      screenshotPath: 'screenshots/05-walkthrough-section.png',
      caption: 'Walkthrough section with Generate Walkthrough button',
      description:
        'The Walkthrough section lets you ask the agent to create a Playwright-based screenshot ' +
        'walkthrough. Once generated, the HTML file appears at .broomy/walkthrough.html and can ' +
        'be viewed in-app using the new HTML Viewer (webview-based file viewer plugin).',
    })
  })
})
