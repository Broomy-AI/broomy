/**
 * Feature Documentation: Remove .claude/commands dependency
 *
 * Documents that the commands setup flow no longer creates .claude/commands/
 * skill files. Actions use agent-agnostic inline prompts from commands.json.
 *
 * Run with: pnpm test:feature-docs remove-claude-commands
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
      title: 'Remove .claude/commands Dependency',
      description:
        'The commands setup flow no longer creates .claude/commands/ skill files. ' +
        'All actions use agent-agnostic inline prompts defined in .broomy/commands.json. ' +
        'The setup dialog only creates commands.json and .broomy/.gitignore. ' +
        'The "Plan Issue" button is now a regular action in commands.json rather than ' +
        'a special-case component with its own dispatch logic.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: Remove .claude/commands', () => {
  test('Step 1: Source control view with action buttons', async () => {
    await openSourceControl()

    const explorer = page.locator('[data-panel-id="explorer"]')
    await screenshotElement(page, explorer, path.join(SCREENSHOTS, '01-source-control-actions.png'), {
      maxHeight: 500,
    })
    steps.push({
      screenshotPath: 'screenshots/01-source-control-actions.png',
      caption: 'Action buttons send inline prompts from commands.json',
      description:
        'The source control view shows action buttons defined in .broomy/commands.json. ' +
        'Each button sends an agent-agnostic inline prompt directly to the agent terminal. ' +
        'No .claude/commands/ skill files are needed.',
    })
  })

  test('Step 2: Setup dialog lists only commands.json and .gitignore', async () => {
    // Click the "Set up" button on the banner to open the setup dialog
    const setupButton = page.locator('button:has-text("Set up")').first()
    await expect(setupButton).toBeVisible()
    await setupButton.click()

    // Wait for the dialog to appear
    const dialog = page.locator('.fixed.inset-0 .bg-bg-secondary')
    await expect(dialog).toBeVisible()

    await screenshotElement(page, dialog, path.join(SCREENSHOTS, '02-setup-dialog.png'))
    steps.push({
      screenshotPath: 'screenshots/02-setup-dialog.png',
      caption: 'Setup dialog creates only commands.json and .gitignore',
      description:
        'The setup dialog lists what will be created: .broomy/commands.json (action definitions) ' +
        'and .broomy/.gitignore (ignores generated output). Previously, it also created ' +
        '.claude/commands/ skill files and .broomy/prompts/ — those are no longer needed.',
    })

    // Close the dialog
    await page.locator('button:has-text("Cancel")').first().click()
    await dialog.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {})
  })

  test('Step 3: Click action button and see inline prompt in terminal', async () => {
    // Click the "Commit with AI" button to trigger an inline prompt
    const commitButton = page.locator('button:has-text("Commit with AI")').first()
    await expect(commitButton).toBeVisible()
    await commitButton.click()

    // Wait for the prompt to appear in the terminal
    const terminalArea = page.locator('.xterm').first()
    await expect(terminalArea).toBeVisible()
    // Wait for terminal content to update after the prompt is sent
    await expect(page.locator('.xterm-rows')).toBeVisible()

    await screenshotElement(page, terminalArea, path.join(SCREENSHOTS, '03-inline-prompt.png'))
    steps.push({
      screenshotPath: 'screenshots/03-inline-prompt.png',
      caption: 'Agent receives inline prompt directly from commands.json',
      description:
        'Clicking "Commit with AI" sends the inline prompt text directly to the agent terminal. ' +
        'Previously, for Claude Code agents with a matching .claude/commands/broomy-action-commit.md ' +
        'file, the UI sent "/broomy-action-commit" as a slash command instead. Now all agents ' +
        'receive the same inline prompt, with optional per-agent overrides in commands.json.',
    })
  })
})
