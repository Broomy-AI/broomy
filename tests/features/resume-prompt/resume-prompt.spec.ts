/**
 * Feature Documentation: Resume Prompt
 *
 * Exercises the resume prompt banner that appears on restored sessions,
 * suggesting users resume their previous agent conversation.
 *
 * Run with: pnpm test:feature-docs resume-prompt
 */
import { test, expect, resetApp } from '../_shared/electron-fixture'
import type { Page } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { screenshotElement, screenshotRegion } from '../_shared/screenshot-helpers'
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
      title: 'Resume Prompt',
      description:
        'When Broomy restarts, sessions are restored but agent terminals start fresh. ' +
        'A dismissible banner appears above any agent terminal suggesting the user resume ' +
        'their previous conversation by running /resume.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: Resume Prompt', () => {
  test('Step 1: Resume banner visible on restored session', async () => {
    // The first session (broomy) uses Claude Code as agent
    // Sessions loaded from config have isRestored: true, so the resume banner should appear
    const banner = page.locator('text=Resume your previous conversation?')
    await expect(banner).toBeVisible({ timeout: 10000 })

    const terminalPanel = page.locator('[data-panel-id="terminal"]')
    await screenshotElement(page, terminalPanel, path.join(SCREENSHOTS, '01-resume-banner.png'), {
      maxHeight: 400,
    })
    steps.push({
      screenshotPath: 'screenshots/01-resume-banner.png',
      caption: 'Resume banner appears on a restored session',
      description:
        'When Broomy restarts and loads sessions from config, a blue banner appears above the ' +
        'agent terminal. It shows "Resume your previous conversation?" with a clickable link ' +
        'to run /resume.',
    })
  })

  test('Step 2: Banner shows the resume command', async () => {
    // Verify the banner shows the correct command
    const resumeLink = page.locator('text=Run /resume')
    await expect(resumeLink).toBeVisible()

    await screenshotElement(page, resumeLink, path.join(SCREENSHOTS, '02-resume-command.png'))
    steps.push({
      screenshotPath: 'screenshots/02-resume-command.png',
      caption: 'The banner shows the /resume command',
      description:
        'The resume banner includes a clickable link that shows the /resume command ' +
        'that will be sent to the agent terminal.',
    })
  })

  test('Step 3: Dismiss the banner', async () => {
    // Click the dismiss button (×)
    const dismissButton = page.locator('button[aria-label="Dismiss"]')
    await expect(dismissButton).toBeVisible()
    await dismissButton.click()

    // Banner should be gone
    const banner = page.locator('text=Resume your previous conversation?')
    await expect(banner).not.toBeVisible()

    const terminalPanel = page.locator('[data-panel-id="terminal"]')
    await screenshotElement(page, terminalPanel, path.join(SCREENSHOTS, '03-banner-dismissed.png'), {
      maxHeight: 400,
    })
    steps.push({
      screenshotPath: 'screenshots/03-banner-dismissed.png',
      caption: 'After dismissing, the banner disappears',
      description:
        'Clicking the × button dismisses the banner. The terminal returns to its normal ' +
        'appearance without the resume suggestion.',
    })
  })

  test('Step 4: No banner on session without agent', async () => {
    // Switch to docs-site session (agentId: null, no agent terminal)
    const docsSession = page.locator('.cursor-pointer:has-text("docs-site")')
    await expect(docsSession).toBeVisible()
    await docsSession.click()

    // Should not show resume banner
    const banner = page.locator('text=Resume your previous conversation?')
    await expect(banner).not.toBeVisible()

    const terminalPanel = page.locator('[data-panel-id="terminal"]')
    await screenshotElement(page, terminalPanel, path.join(SCREENSHOTS, '04-no-banner.png'), {
      maxHeight: 400,
    })
    steps.push({
      screenshotPath: 'screenshots/04-no-banner.png',
      caption: 'No banner on sessions without an agent',
      description:
        'Sessions that have no agent do not show the resume banner, since there is ' +
        'no agent terminal to resume.',
    })
  })
})
