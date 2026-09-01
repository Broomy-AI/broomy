/**
 * Feature Documentation: Agent Auto-Enter
 *
 * Demonstrates that UI buttons (e.g. "Commit") now automatically submit
 * the command to the agent terminal — no manual Enter press needed.
 *
 * Run with: pnpm test:feature-docs agent-autoenter
 */
import { test, expect, resetApp } from '../_shared/electron-fixture'
import type { Page } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { screenshotElement } from '../_shared/screenshot-helpers'
import { generateFeaturePage, generateIndex, FeatureStep } from '../_shared/template'
import { resumeActiveSession } from '../_shared/resume-helpers'

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
      title: 'Agent Auto-Enter',
      description:
        'When UI buttons send commands to the agent terminal (Commit, Create PR, Push to Main, etc.), ' +
        'the command is now automatically submitted. Previously the user had to press Enter manually after clicking ' +
        'a button — this removes that unnecessary friction.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: Agent Auto-Enter', () => {
  test('Step 1: Open the source control panel with the Commit button', async () => {
    // The active session restores paused, with no agent terminal to send a
    // command to. Resume it before "Commit" is exercised in step 2.
    await resumeActiveSession(page)

    // Open the explorer panel via toolbar button
    const explorerButton = page.locator('button[title*="Explorer"]').first()
    await expect(explorerButton).toBeVisible({ timeout: 5000 })
    const cls = await explorerButton.getAttribute('class').catch(() => '')
    if (!cls?.includes('bg-accent')) {
      await explorerButton.click()
      await expect(explorerButton).toHaveClass(/bg-accent/, { timeout: 5000 })
    }

    const explorer = page.locator('[data-panel-id="explorer"]')
    await expect(explorer).toBeVisible({ timeout: 5000 })

    // Switch to the Source Control tab
    const scTab = page.locator('[title="Source Control"]')
    await scTab.click()

    // Wait for the source control view to load
    const commitButton = page.getByText('Commit', { exact: true })
    await expect(commitButton).toBeVisible({ timeout: 5000 })

    await screenshotElement(page, explorer, path.join(SCREENSHOTS, '01-source-control-panel.png'), {
      maxHeight: 600,
    })
    steps.push({
      screenshotPath: 'screenshots/01-source-control-panel.png',
      caption: 'Source control panel with the Commit button',
      description:
        'The explorer panel showing the source control view (the session\'s agent terminal has ' +
        'already been resumed so it is ready to receive a command). The "Commit" button sends a ' +
        'commit prompt to the agent terminal.',
    })
  })

  test('Step 2: Click Commit — command is sent and submitted automatically', async () => {
    // Click the Commit button
    const commitButton = page.getByText('Commit', { exact: true })
    await commitButton.click()

    // The agent terminal tab should now be active (sendAgentPrompt switches to it)
    const terminalArea = page.locator('[data-panel-id="agent"]')
    await expect(terminalArea).toBeVisible({ timeout: 5000 })

    // Wait for the xterm content to render after the command is written
    const xtermContent = terminalArea.locator('.xterm-rows').first()
    await expect(xtermContent).toBeVisible({ timeout: 5000 })

    await screenshotElement(page, terminalArea, path.join(SCREENSHOTS, '02-agent-terminal-command.png'))
    steps.push({
      screenshotPath: 'screenshots/02-agent-terminal-command.png',
      caption: 'Agent terminal received and submitted the command automatically',
      description:
        'After clicking "Commit", the terminal tab switches to the agent terminal and the ' +
        'command is written and submitted (Enter is sent automatically). No manual keypress needed.',
    })
  })
})
