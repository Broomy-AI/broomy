/**
 * Feature Documentation: Session Switching
 *
 * Exercises the flow of switching between sessions in the sidebar,
 * capturing screenshots at each stage to document the feature.
 *
 * Run with: pnpm test:feature-docs
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

/**
 * Get terminal buffer content from the buffer registry.
 * xterm 6.0 renders via canvas, so DOM queries can't read terminal text.
 */
async function getAgentTerminalContent(p: Page): Promise<string> {
  return p.evaluate(() => {
    const registry = (window as unknown as { __terminalBufferRegistry?: { getSessionIds: () => string[]; getBuffer: (id: string) => string | null } }).__terminalBufferRegistry
    if (!registry) return ''
    for (const id of registry.getSessionIds()) {
      if (id.endsWith('-user')) continue
      const buf = registry.getBuffer(id)
      if (buf) return buf
    }
    return ''
  })
}


test.beforeAll(async () => {
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true })

  ;({ page } = await resetApp())
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'Session Switching',
      description:
        'Users can switch between coding sessions by clicking on them in the sidebar. ' +
        'Each session maintains its own terminal state, branch, and agent status. ' +
        'The active session is highlighted and its terminal is displayed in the main area.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)

})

test.describe.serial('Feature: Session Switching', () => {
  test('Step 1: Initial state — multiple sessions in sidebar', async () => {
    const sidebar = page.locator('[data-panel-id="sidebar"]')
    await expect(sidebar).toBeVisible()

    // Verify multiple sessions exist
    const broomySession = page.locator('.cursor-pointer:has-text("broomy")')
    await expect(broomySession).toBeVisible()
    const backendSession = page.locator('.cursor-pointer:has-text("backend-api")')
    await expect(backendSession).toBeVisible()

    await screenshotElement(page, sidebar, path.join(SCREENSHOTS, '01-initial-sidebar.png'), {
      maxHeight: 600,
    })
    steps.push({
      screenshotPath: 'screenshots/01-initial-sidebar.png',
      caption: 'Initial sidebar with multiple sessions, all paused',
      description:
        'The sidebar shows all active sessions. Each card displays the repo name, branch, ' +
        'agent status (Idle/Working), and a status indicator dot. Sessions always restore ' +
        'paused, which is why every card renders dimmed here — no agent or terminal is ' +
        'running yet for any of them.',
    })
  })

  test('Step 2: Resume the selected session to bring up its terminal', async () => {
    // The first session (broomy) should be selected by default
    const broomySession = page.locator('.cursor-pointer:has-text("broomy")')
    await expect(broomySession).toHaveClass(/bg-accent\/15/)

    // Sessions restore paused, so the active session's panel starts as a
    // "Resume Session" placeholder rather than a terminal. Resume it and
    // wait for the mock agent's ready banner (not a sleep) before asserting
    // the terminal is up — the initial agent command is written into the
    // freshly spawned PTY a moment after creation (see
    // src/main/handlers/pty.ts), so a screenshot taken immediately after
    // clicking Resume can catch the bare shell prompt instead.
    await page.locator('button:has-text("Resume Session"):visible').click()
    await expect.poll(() => getAgentTerminalContent(page), { timeout: 10000 })
      .toContain('FAKE_CLAUDE_READY')

    const terminalArea = page.locator('.xterm').first()
    await expect(terminalArea).toBeVisible()

    await screenshotElement(page, terminalArea, path.join(SCREENSHOTS, '02-first-session-terminal.png'))
    steps.push({
      screenshotPath: 'screenshots/02-first-session-terminal.png',
      caption: 'Resuming starts a fresh agent terminal',
      description:
        'Clicking "Resume Session" on the active session\'s placeholder spins up a fresh agent ' +
        'terminal in the main area. From here on this session stays running — switching away ' +
        'from it and back does not pause it again.',
    })
  })

  test('Step 3: Click a different session', async () => {
    const backendSession = page.locator('.cursor-pointer:has-text("backend-api")')
    await backendSession.click()

    // Backend session should now be highlighted
    await expect(backendSession).toHaveClass(/bg-accent\/15/)

    // Previous session should no longer be highlighted
    const broomySession = page.locator('.cursor-pointer:has-text("broomy")')
    const broomyClasses = await broomySession.getAttribute('class')
    expect(broomyClasses).not.toContain('bg-accent/15')

    const sidebar = page.locator('[data-panel-id="sidebar"]')
    await screenshotElement(page, sidebar, path.join(SCREENSHOTS, '03-switched-session.png'), {
      maxHeight: 600,
    })
    steps.push({
      screenshotPath: 'screenshots/03-switched-session.png',
      caption: 'After clicking backend-api, it becomes the active session',
      description:
        'The highlight has moved from "broomy" to "backend-api". Selecting a session never ' +
        'resumes it on its own — backend-api hasn\'t been resumed yet, so its main panel shows ' +
        'the paused placeholder rather than a terminal, exactly like broomy did in step 1.',
    })
  })

  test('Step 4: Switch back — terminal state preserved', async () => {
    // Switch back to broomy
    const broomySession = page.locator('.cursor-pointer:has-text("broomy")')
    await broomySession.click()

    await expect(broomySession).toHaveClass(/bg-accent\/15/)

    // Terminal pane should still be visible after switching back
    const terminalArea = page.locator('.xterm').first()
    await expect(terminalArea).toBeVisible()

    await screenshotElement(page, terminalArea, path.join(SCREENSHOTS, '04-preserved-terminal.png'))
    steps.push({
      screenshotPath: 'screenshots/04-preserved-terminal.png',
      caption: 'Switching back preserves terminal state',
      description:
        'After switching back to the "broomy" session, its terminal pane is still present. ' +
        'Terminal state is preserved across session switches.',
    })
  })
})
