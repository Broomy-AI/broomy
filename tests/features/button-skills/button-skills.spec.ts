/**
 * Feature Documentation: Button Skills (Claude Code Command Integration)
 *
 * Documents the action button system that sends agent-agnostic inline prompts
 * from .broomy/commands.json to the active agent terminal.
 *
 * Run with: pnpm test:feature-docs button-skills
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
      title: 'Button Skills: Claude Code Command Integration',
      description:
        'Broomy UI actions (Commit, Push to Main, Create PR, Resolve Conflicts, Review, Plan Issue) ' +
        'send agent-agnostic inline prompts defined in .broomy/commands.json. ' +
        'Actions can have per-agent prompt overrides for agent-specific behavior.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: Button Skills', () => {
  test('Step 1: Navigate to Source Control view', async () => {
    await openSourceControl()

    const explorer = page.locator('[data-panel-id="explorer"]')
    await screenshotElement(page, explorer, path.join(SCREENSHOTS, '01-source-control-view.png'), {
      maxHeight: 600,
    })
    steps.push({
      screenshotPath: 'screenshots/01-source-control-view.png',
      caption: 'Source Control view showing working changes',
      description:
        'The Source Control tab in the explorer panel displays git status, ' +
        'action buttons (Commit, Sync, Push to Main, Create PR), and branch information. ' +
        'These buttons send inline prompts from .broomy/commands.json.',
    })
  })

  test('Step 2: Action buttons area', async () => {
    const explorer = page.locator('[data-panel-id="explorer"]')
    await screenshotElement(page, explorer, path.join(SCREENSHOTS, '02-action-buttons.png'), {
      maxHeight: 400,
    })
    steps.push({
      screenshotPath: 'screenshots/02-action-buttons.png',
      caption: 'Action buttons in working changes view',
      description:
        'Each action button (Commit, Push to Main, Create PR, Resolve Conflicts) sends ' +
        'the inline prompt defined in .broomy/commands.json. Actions can have per-agent ' +
        'prompt overrides for agent-specific behavior.',
    })
  })

  test('Step 3: Terminal showing agent interaction', async () => {
    const terminalArea = page.locator('.xterm').first()
    await expect(terminalArea).toBeVisible()

    await screenshotElement(page, terminalArea, path.join(SCREENSHOTS, '03-agent-terminal.png'))
    steps.push({
      screenshotPath: 'screenshots/03-agent-terminal.png',
      caption: 'Agent terminal receives skill-aware commands',
      description:
        'When a UI button is clicked, the action system sends the inline prompt from ' +
        '.broomy/commands.json to the agent terminal. If the action has a per-agent override ' +
        'matching the active agent type, that override prompt is used instead.',
    })
  })
})
