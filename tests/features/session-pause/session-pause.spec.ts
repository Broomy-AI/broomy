/**
 * Feature Documentation: Session Pause
 *
 * Exercises the flow of pausing and resuming a session: every session starts
 * paused when the app launches (no agent, no terminal, nothing running), the
 * sidebar shows a hover control to pause/resume, and the main panel shows a
 * placeholder with a "Resume Session" call to action in place of the terminal.
 *
 * Run with: pnpm test:feature-docs session-pause
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
      title: 'Session Pause',
      description:
        'Every session starts paused when the app launches or the config is reloaded — ' +
        'restoring a session never spins up an agent, a terminal, or anything it started. ' +
        'A paused session stays in the sidebar so the user can still see and select it, but its ' +
        'main panel shows a placeholder with a "Resume Session" button instead of a live terminal. ' +
        'Pausing and resuming is also available per-session from a hover control on the session card, ' +
        'and from the terminal\'s right-click context menu.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: Session Pause', () => {
  test('Step 1: Sessions restore paused — sidebar is dimmed', async () => {
    const sidebar = page.locator('[data-panel-id="sidebar"]')
    await expect(sidebar).toBeVisible()

    // All restored sessions start paused, so every card renders dimmed.
    const broomySession = page.locator('.cursor-pointer:has-text("broomy")')
    await expect(broomySession).toBeVisible()
    const broomyClasses = await broomySession.getAttribute('class')
    expect(broomyClasses).toContain('opacity-60')

    await screenshotElement(page, sidebar, path.join(SCREENSHOTS, '01-sidebar-all-paused.png'), {
      maxHeight: 500,
    })
    steps.push({
      screenshotPath: 'screenshots/01-sidebar-all-paused.png',
      caption: 'Every session restores paused',
      description:
        'On launch (or config reload) every session is paused — no agent, terminal, or ' +
        'background process runs until the user resumes it. Paused cards render dimmed ' +
        '(reduced opacity) in the sidebar so the difference is visible at a glance.',
    })
  })

  test('Step 2: Main panel shows the paused placeholder', async () => {
    // Every non-archived session renders its own placeholder (hidden via CSS
    // unless it's the active session), so scope to the one that's :visible.
    const agentPanel = page.locator('[data-panel-id="agent"]')
    await expect(agentPanel).toBeVisible()
    await expect(agentPanel.locator('div:visible', { hasText: 'Session paused' }).first()).toBeVisible()
    const resumeButton = agentPanel.locator('button:has-text("Resume Session"):visible')
    await expect(resumeButton).toBeVisible()

    await screenshotElement(page, agentPanel, path.join(SCREENSHOTS, '02-paused-placeholder.png'))
    steps.push({
      screenshotPath: 'screenshots/02-paused-placeholder.png',
      caption: 'The paused placeholder replaces the terminal',
      description:
        'Instead of the agent terminal and any user shell tabs, the active session\'s panel shows ' +
        'a message explaining nothing is running, plus a "Resume Session" button. Resuming starts ' +
        'a fresh agent — no conversation state survives a pause.',
    })
  })

  test('Step 3: Hovering a paused card reveals the resume control', async () => {
    const broomySession = page.locator('.cursor-pointer:has-text("broomy")')
    await broomySession.hover()

    const resumeIcon = broomySession.locator('button[title="Resume session"]')
    await expect(resumeIcon).toBeVisible()

    await screenshotElement(page, broomySession, path.join(SCREENSHOTS, '03-hover-resume-icon.png'))
    steps.push({
      screenshotPath: 'screenshots/03-hover-resume-icon.png',
      caption: 'Hovering a session card reveals a resume control',
      description:
        'Each session card has a hover-revealed play icon for a paused session (a pause icon once ' +
        'it is running). This lets a user resume — or pause — any session directly from the sidebar, ' +
        'without first selecting it.',
    })
  })

  test('Step 4: Resuming starts the agent and un-dims the card', async () => {
    const agentPanel = page.locator('[data-panel-id="agent"]')
    const resumeButton = agentPanel.locator('button:has-text("Resume Session"):visible')
    await resumeButton.click()

    // Agent terminal should now be running.
    const terminalArea = agentPanel.locator('.xterm:visible').first()
    await expect(terminalArea).toBeVisible({ timeout: 10000 })

    // Wait for the mock agent's ready banner so the screenshot shows agent
    // output rather than the bare shell prompt from the moment before the
    // PTY's initial command has landed.
    await expect.poll(() => page.evaluate(() => {
      const registry = (window as unknown as { __terminalBufferRegistry?: { getSessionIds: () => string[]; getBuffer: (id: string) => string | null } }).__terminalBufferRegistry
      if (!registry) return ''
      for (const id of registry.getSessionIds()) {
        if (id.endsWith('-user')) continue
        const buf = registry.getBuffer(id)
        if (buf) return buf
      }
      return ''
    }), { timeout: 10000 }).toContain('Claude is thinking')

    // The card is no longer dimmed once its session is running.
    const broomySession = page.locator('.cursor-pointer:has-text("broomy")')
    await expect.poll(async () => {
      const classes = await broomySession.getAttribute('class')
      return classes?.includes('opacity-60') ?? false
    }, { timeout: 5000 }).toBe(false)

    await screenshotElement(page, agentPanel, path.join(SCREENSHOTS, '04-resumed-terminal.png'))
    steps.push({
      screenshotPath: 'screenshots/04-resumed-terminal.png',
      caption: 'Resuming replaces the placeholder with a live terminal',
      description:
        'Clicking "Resume Session" spins up a fresh agent terminal for the session. The sidebar ' +
        'card returns to full opacity now that the session is active again.',
    })
  })

  test('Step 5: Pausing from the sidebar dims the card and tears down the terminal', async () => {
    const broomySession = page.locator('.cursor-pointer:has-text("broomy")')
    await broomySession.hover()

    const pauseIcon = broomySession.locator('button[title="Pause session"]')
    await expect(pauseIcon).toBeVisible()
    await pauseIcon.click()

    // The card dims again and the agent panel falls back to the placeholder.
    await expect(broomySession).toHaveClass(/opacity-60/)
    const agentPanel = page.locator('[data-panel-id="agent"]')
    await expect(agentPanel.locator('div:visible', { hasText: 'Session paused' }).first()).toBeVisible()

    await screenshotElement(page, broomySession, path.join(SCREENSHOTS, '05-paused-again.png'))
    steps.push({
      screenshotPath: 'screenshots/05-paused-again.png',
      caption: 'Pausing tears down everything the session started',
      description:
        'Pausing from the sidebar hover control (or the terminal\'s right-click menu) immediately ' +
        'kills the agent terminal, any user shell tabs, and — for isolated sessions — stops the dev ' +
        'container, then dims the card again.',
    })
  })
})
