/**
 * Feature Documentation: Modular Actions (commands.json)
 *
 * Documents the configurable action button system in source control.
 * Actions are defined in .broomy/commands.json and shown based on git state.
 * Falls back to built-in defaults when no commands.json exists.
 *
 * Run with: pnpm test:feature-docs modular-actions
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

/** Navigate the explorer panel to the source-control tab */
async function openSourceControl() {
  const explorerButton = page.locator('[data-panel-id="explorer-toggle"], [title*="Explorer"]').first()
  if (await explorerButton.isVisible()) {
    const cls = await explorerButton.getAttribute('class').catch(() => '')
    if (!cls?.includes('bg-accent')) {
      await explorerButton.click()
      await expect(page.locator('[data-panel-id="explorer"]')).toBeVisible()
    }
  }

  await page.evaluate(() => {
    const store = (window as Record<string, unknown>).__sessionStore as {
      getState: () => { activeSessionId: string; setExplorerFilter: (id: string, filter: string) => void }
    }
    if (!store) return
    const state = store.getState()
    state.setExplorerFilter(state.activeSessionId, 'source-control')
  })
  await expect(page.locator('[data-panel-id="explorer"]')).toBeVisible()
}

test.beforeAll(async () => {
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true })
  ;({ page } = await resetApp())
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'Modular Actions: Configurable Source Control Buttons',
      description:
        'Source control action buttons (Sync, Push, Create PR, etc.) are defined in ' +
        '.broomy/commands.json. Each action has showWhen conditions that control visibility ' +
        'based on git state (has changes, has tracking branch, branch status). When no ' +
        'commands.json exists, built-in defaults are used and a setup banner offers to ' +
        'create the config files.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: Modular Actions', () => {
  test('Step 1: Source control with default action buttons', async () => {
    await openSourceControl()
    // Wait for content to render
    await page.locator('[data-panel-id="explorer"]').waitFor({ state: 'attached' })

    const explorer = page.locator('[data-panel-id="explorer"]')
    await expect(explorer).toBeVisible()

    await screenshotElement(page, explorer, path.join(SCREENSHOTS, '01-source-control-default.png'), {
      maxHeight: 600,
    })
    steps.push({
      screenshotPath: 'screenshots/01-source-control-default.png',
      caption: 'Source control view with default action buttons',
      description:
        'When no .broomy/commands.json exists, the source control panel shows built-in ' +
        'default action buttons. A blue banner at the top indicates "No commands.json — ' +
        'actions use built-in defaults" with a "Set up" button. The action buttons are ' +
        'filtered by git state — only actions relevant to the current branch status appear.',
    })
  })

  test('Step 2: Setup banner and action buttons close-up', async () => {
    // Look for the setup banner
    const banner = page.locator('text=No commands.json').first()
    const bannerVisible = await banner.isVisible().catch(() => false)

    if (bannerVisible) {
      // Screenshot just the banner area
      const bannerContainer = banner.locator('xpath=ancestor::div[contains(@class, "border-b")]').first()
      await screenshotElement(page, bannerContainer, path.join(SCREENSHOTS, '02-setup-banner.png'))
      steps.push({
        screenshotPath: 'screenshots/02-setup-banner.png',
        caption: 'Commands setup banner',
        description:
          'The blue info banner appears when no .broomy/commands.json file exists in the ' +
          'repository. It shows "No commands.json — actions use built-in defaults" with ' +
          'a "Set up" button that opens the setup dialog.',
      })
    } else {
      // If banner isn't visible, take a screenshot of the explorer anyway
      const explorer = page.locator('[data-panel-id="explorer"]')
      await screenshotElement(page, explorer, path.join(SCREENSHOTS, '02-setup-banner.png'), {
        maxHeight: 300,
      })
      steps.push({
        screenshotPath: 'screenshots/02-setup-banner.png',
        caption: 'Source control action buttons',
        description:
          'Action buttons are shown in a vertical stack. Each button is filtered by ' +
          'showWhen conditions based on the current git state.',
      })
    }
  })

  test('Step 3: Open the commands setup dialog', async () => {
    const setupButton = page.locator('button:has-text("Set up")').first()
    const setupVisible = await setupButton.isVisible().catch(() => false)

    if (setupVisible) {
      await setupButton.click()
      // Wait for dialog to appear
      await page.locator('text=Set up Broomy Actions').waitFor({ state: 'visible', timeout: 3000 }).catch(() => {})

      const dialog = page.locator('text=Set up Broomy Actions').locator('xpath=ancestor::div[contains(@class, "bg-bg-secondary")]').first()
      const dialogVisible = await dialog.isVisible().catch(() => false)

      if (dialogVisible) {
        await screenshotElement(page, dialog, path.join(SCREENSHOTS, '03-setup-dialog.png'))
        steps.push({
          screenshotPath: 'screenshots/03-setup-dialog.png',
          caption: 'Commands setup dialog',
          description:
            'The setup dialog explains what commands.json does and lists the files that ' +
            'will be created: .broomy/commands.json (action definitions), .broomy/prompts/ ' +
            '(editable prompt templates) and ' +
            '.broomy/.gitignore (ignores generated output). If the repo has a legacy .broomy/ ' +
            'entry in .gitignore, a warning offers to remove it.',
        })

        // Close the dialog
        const cancelButton = page.locator('button:has-text("Cancel")').first()
        await cancelButton.click()
        await page.locator('text=Set up Broomy Actions').waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {})
      }
    }

    // If we couldn't open the dialog, skip this step gracefully
    if (steps.length < 3) {
      const explorer = page.locator('[data-panel-id="explorer"]')
      await screenshotElement(page, explorer, path.join(SCREENSHOTS, '03-setup-dialog.png'), {
        maxHeight: 400,
      })
      steps.push({
        screenshotPath: 'screenshots/03-setup-dialog.png',
        caption: 'Source control with action buttons',
        description:
          'The action buttons area shows buttons filtered by showWhen conditions. ' +
          'Actions can be of type "shell" (run a git command) or "agent" (send a ' +
          'prompt to the AI agent terminal).',
      })
    }
  })

  test('Step 4: Switch to a feature branch session', async () => {
    // Switch to session 2 (backend-api on feature/auth branch) to see different actions
    await page.evaluate(() => {
      const store = (window as Record<string, unknown>).__sessionStore as {
        getState: () => { sessions: { id: string }[]; setActiveSession: (id: string) => void }
      }
      if (!store) return
      const state = store.getState()
      const session2 = state.sessions.find((s: { id: string }) => s.id === '2')
      if (session2) state.setActiveSession(session2.id)
    })

    await page.locator('[data-panel-id="explorer"]').waitFor({ state: 'attached' })
    await openSourceControl()
    await page.locator('[data-panel-id="explorer"]').waitFor({ state: 'attached' })

    const explorer = page.locator('[data-panel-id="explorer"]')
    await screenshotElement(page, explorer, path.join(SCREENSHOTS, '04-feature-branch.png'), {
      maxHeight: 600,
    })
    steps.push({
      screenshotPath: 'screenshots/04-feature-branch.png',
      caption: 'Action buttons on a feature branch',
      description:
        'On a feature branch, different actions become visible based on showWhen ' +
        'conditions. For example, "Approve and Merge" only shows when there is an open PR ' +
        'with passing checks, while "Create PR" shows when there is no existing PR. The ' +
        'action set adapts to the current git state automatically.',
    })
  })

  test('Step 5: File change list in source control', async () => {
    // Switch back to session 1 to show the file list
    await page.evaluate(() => {
      const store = (window as Record<string, unknown>).__sessionStore as {
        getState: () => { sessions: { id: string }[]; setActiveSession: (id: string) => void }
      }
      if (!store) return
      const state = store.getState()
      const session1 = state.sessions.find((s: { id: string }) => s.id === '1')
      if (session1) state.setActiveSession(session1.id)
    })

    await page.locator('[data-panel-id="explorer"]').waitFor({ state: 'attached' })
    await openSourceControl()
    await page.locator('[data-panel-id="explorer"]').waitFor({ state: 'attached' })

    const explorer = page.locator('[data-panel-id="explorer"]')
    await screenshotElement(page, explorer, path.join(SCREENSHOTS, '05-file-list.png'), {
      maxHeight: 600,
    })
    steps.push({
      screenshotPath: 'screenshots/05-file-list.png',
      caption: 'Changed files with staging controls',
      description:
        'Below the action buttons, the source control view shows changed files ' +
        'with individual stage/unstage controls. The commit area lets you write a ' +
        'message and commit staged files. Actions of type "agent" send prompts to ' +
        'the AI agent, while "shell" actions execute git commands directly.',
    })
  })
})
