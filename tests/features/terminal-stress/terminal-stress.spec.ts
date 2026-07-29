/**
 * Feature Documentation: Terminal Stress Testing
 *
 * Exercises terminal rendering under stress conditions: session switching,
 * rapid tab changes, resizing, panel toggles, and scroll behavior.
 *
 * Run with: pnpm test:feature-docs terminal-stress
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

/** Wait for a terminal to be visible and have rendered content. */
async function waitForTerminalReady(p: Page) {
  const terminal = p.locator('.xterm:visible').first()
  await expect(terminal).toBeVisible()
  // Wait for xterm canvas or screen element to be rendered
  await expect(terminal.locator('.xterm-screen')).toBeVisible()
  return terminal
}

/**
 * Click a session in the sidebar, resume it if needed (sessions restore
 * paused — resumeActiveSession no-ops if it's already running, so this is
 * safe to call every time this suite switches to a session, including
 * switching back to one resumed earlier), and wait for its terminal.
 *
 * docs-site has no configured agent, so its PTY is a bare shell and prints
 * the E2E mock shell's ready marker instead of the fake agent's.
 */
async function switchToSession(p: Page, name: string) {
  const session = p.locator(`.cursor-pointer:has-text("${name}")`)
  await session.click()
  await resumeActiveSession(p, { readyMarker: name === 'docs-site' ? 'E2E_TEST_SHELL_READY' : undefined })
  await waitForTerminalReady(p)
}

test.beforeAll(async () => {
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true })
  ;({ page } = await resetApp())
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'Terminal Stress Testing',
      description:
        'Validates terminal rendering stability under stress: session switching, ' +
        'rapid tab changes, window resizing, panel toggles, and scroll behavior. ' +
        'Uses xterm.js 6.0 with canvas renderer.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: Terminal Stress', () => {
  test('Step 1: Basic rendering — terminal shows content', async () => {
    // Sessions restore paused — resume the initially active one before
    // stress-testing its terminal.
    await resumeActiveSession(page)
    const terminalArea = await waitForTerminalReady(page)

    await screenshotElement(page, terminalArea, path.join(SCREENSHOTS, '01-basic-rendering.png'))
    steps.push({
      screenshotPath: 'screenshots/01-basic-rendering.png',
      caption: 'Terminal renders content after startup',
      description:
        'The session has been resumed (sessions restore paused). The xterm.js 6.0 terminal is ' +
        'visible and rendering output from the agent process. The canvas renderer handles ' +
        'terminal output.',
    })
  })

  test('Step 2: Session switching — switch away and back', async () => {
    // docs-site, not backend-api: backend-api's mock agentId ('aider') isn't
    // a configured default agent, so its terminal can never start (see
    // task-8 report — pre-existing, unrelated to session-pause). docs-site
    // has no agent at all, which is still a real second terminal to
    // switch to and stress.
    await switchToSession(page, 'docs-site')

    const terminalArea = await waitForTerminalReady(page)
    await screenshotElement(page, terminalArea, path.join(SCREENSHOTS, '02-switched-session.png'))
    steps.push({
      screenshotPath: 'screenshots/02-switched-session.png',
      caption: 'Terminal content after switching to and resuming docs-site',
      description:
        'After clicking docs-site in the sidebar and resuming it (it also restores paused), its ' +
        'terminal is visible with content intact.',
    })

    await switchToSession(page, 'broomy')

    await screenshotElement(page, terminalArea, path.join(SCREENSHOTS, '03-switched-back.png'))
    steps.push({
      screenshotPath: 'screenshots/03-switched-back.png',
      caption: 'Terminal content preserved after switching back',
      description:
        'Switching back to the original (already-resumed, still-running) session shows the ' +
        'terminal content is preserved. Using visibility:hidden instead of display:none ensures ' +
        'fitAddon measurements stay valid.',
    })
  })

  test('Step 3: Rapid session switching — multiple times quickly', async () => {
    const sessionNames = ['docs-site', 'broomy', 'docs-site', 'broomy']

    for (const name of sessionNames) {
      const session = page.locator(`.cursor-pointer:has-text("${name}")`)
      await session.click()
      // Minimal wait — just ensure click registered
      await expect(page.locator(`.cursor-pointer:has-text("${name}")`)).toHaveClass(/bg-accent/)
      // Both sessions were already resumed in step 2 — resumeActiveSession
      // no-ops here, so this doesn't add the readiness wait back into what
      // is meant to be a rapid, minimal-wait switch.
      await resumeActiveSession(page, { readyMarker: name === 'docs-site' ? 'E2E_TEST_SHELL_READY' : undefined })
    }

    const terminalArea = await waitForTerminalReady(page)

    await screenshotElement(page, terminalArea, path.join(SCREENSHOTS, '04-rapid-switching.png'))
    steps.push({
      screenshotPath: 'screenshots/04-rapid-switching.png',
      caption: 'Terminal stable after rapid session switching',
      description:
        'After rapidly switching between two already-running sessions 4 times in quick ' +
        'succession, the terminal renders correctly without scroll desync or visual glitches.',
    })
  })

  test('Step 4: Terminal tab switching — Agent and User tabs', async () => {
    const addTabButton = page.locator('button[title="New terminal tab"]:visible').first()
    const terminalArea = page.locator('.xterm:visible').first()

    if (await addTabButton.isVisible()) {
      await addTabButton.click()

      // Wait for new tab to be created (default name is "Terminal N")
      const userTab = page.locator('span:has-text("Terminal"):visible').first()
      await expect(userTab).toBeVisible()

      // Switch back to Agent tab
      const agentTab = page.locator('div.cursor-pointer:has-text("Agent"):visible').first()
      await agentTab.click()
      await expect(terminalArea).toBeVisible()

      await screenshotElement(page, terminalArea, path.join(SCREENSHOTS, '05-tab-switching.png'))
      steps.push({
        screenshotPath: 'screenshots/05-tab-switching.png',
        caption: 'Terminal renders correctly after tab switching',
        description:
          'After adding a user terminal tab and switching back to the Agent tab, ' +
          'both terminals maintain their content and render properly.',
      })
    } else {
      await screenshotElement(page, terminalArea, path.join(SCREENSHOTS, '05-tab-switching.png'))
      steps.push({
        screenshotPath: 'screenshots/05-tab-switching.png',
        caption: 'Terminal renders in single-tab mode',
        description: 'Terminal tab bar is present and the Agent tab renders correctly.',
      })
    }
  })

  test('Step 5: Resize stress — resize window multiple times', async () => {
    const originalSize = page.viewportSize()!

    // Resize smaller
    await page.setViewportSize({ width: 900, height: 600 })
    await expect(page.locator('.xterm:visible').first()).toBeVisible()

    // Resize larger
    await page.setViewportSize({ width: 1600, height: 1000 })
    await expect(page.locator('.xterm:visible').first()).toBeVisible()

    // Back to a medium size
    await page.setViewportSize({ width: 1200, height: 800 })
    const terminalArea = await waitForTerminalReady(page)

    await screenshotElement(page, terminalArea, path.join(SCREENSHOTS, '06-resize-stress.png'))
    steps.push({
      screenshotPath: 'screenshots/06-resize-stress.png',
      caption: 'Terminal re-fits correctly after multiple resizes',
      description:
        'After resizing the window from 900x600 to 1600x1000 to 1200x800, ' +
        'the terminal re-fits correctly each time via the ResizeObserver + fitAddon.',
    })

    // Restore original size
    await page.setViewportSize(originalSize)
    await expect(page.locator('.xterm:visible').first()).toBeVisible()
  })

  test('Step 6: Panel toggle — explorer open/close', async () => {
    const explorerToggle = page.locator('[data-panel-id="explorer"]')
    const terminalArea = page.locator('.xterm:visible').first()

    if (await explorerToggle.isVisible()) {
      await explorerToggle.click()
      await expect(terminalArea).toBeVisible()

      await screenshotElement(page, terminalArea, path.join(SCREENSHOTS, '07-panel-toggle-open.png'))
      steps.push({
        screenshotPath: 'screenshots/07-panel-toggle-open.png',
        caption: 'Terminal resizes when explorer panel opens',
        description:
          'Opening the explorer panel causes the terminal to resize. ' +
          'The fitAddon recalculates dimensions and content is preserved.',
      })

      await explorerToggle.click()
      await expect(terminalArea).toBeVisible()

      await screenshotElement(page, terminalArea, path.join(SCREENSHOTS, '08-panel-toggle-closed.png'))
      steps.push({
        screenshotPath: 'screenshots/08-panel-toggle-closed.png',
        caption: 'Terminal expands back when explorer panel closes',
        description: 'Closing the explorer panel restores the terminal to full width.',
      })
    } else {
      await screenshotElement(page, terminalArea, path.join(SCREENSHOTS, '07-panel-toggle-open.png'))
      steps.push({
        screenshotPath: 'screenshots/07-panel-toggle-open.png',
        caption: 'Terminal with panel area',
        description: 'Terminal renders correctly alongside other panels.',
      })
    }
  })

  test('Step 7: Scroll to top and back', async () => {
    await switchToSession(page, 'broomy')

    const terminalContainer = page.locator('.xterm:visible').first()
    await terminalContainer.click()

    // Scroll up in the terminal using keyboard
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('PageUp')
    }
    // Wait for scroll state to settle
    await expect(terminalContainer).toBeVisible()

    // Check for scroll-to-bottom button
    const scrollButton = page.locator('button:has-text("Go to End")')
    const hasScrollButton = await scrollButton.isVisible().catch(() => false)

    await screenshotElement(page, terminalContainer, path.join(SCREENSHOTS, '09-scrolled-up.png'))
    steps.push({
      screenshotPath: 'screenshots/09-scrolled-up.png',
      caption: hasScrollButton ? 'Scrolled up with "Go to End" button visible' : 'Scrolled up in terminal',
      description:
        'After pressing PageUp several times, the terminal scrolls back through history. ' +
        `${hasScrollButton ? 'The "Go to End" button appears to allow quick return to the bottom.' : 'The terminal shows scrollback content.'}`,
    })

    // Scroll back to bottom
    if (hasScrollButton) {
      await scrollButton.click()
    } else {
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press('PageDown')
      }
    }
    await expect(terminalContainer).toBeVisible()

    await screenshotElement(page, terminalContainer, path.join(SCREENSHOTS, '10-scrolled-bottom.png'))
    steps.push({
      screenshotPath: 'screenshots/10-scrolled-bottom.png',
      caption: 'Back at bottom of terminal output',
      description:
        'After scrolling back to the bottom, the terminal shows the latest output. ' +
        'The scroll button disappears and auto-following resumes.',
    })
  })

  test('Step 8: Multiple sessions remain stable', async () => {
    const sessionNames = ['broomy', 'docs-site']
    for (const name of sessionNames) {
      const session = page.locator(`.cursor-pointer:has-text("${name}")`)
      if (await session.isVisible()) {
        await session.click()
        await expect(session).toHaveClass(/bg-accent/)
        await resumeActiveSession(page, { readyMarker: name === 'docs-site' ? 'E2E_TEST_SHELL_READY' : undefined })
      }
    }

    await switchToSession(page, 'broomy')

    const terminalArea = await waitForTerminalReady(page)
    await screenshotElement(page, terminalArea, path.join(SCREENSHOTS, '11-final-stable.png'))
    steps.push({
      screenshotPath: 'screenshots/11-final-stable.png',
      caption: 'All sessions stable after full stress test',
      description:
        'After running through all stress scenarios — session switching, rapid switching, ' +
        'tab switching, resizing, panel toggles, and scrolling — all terminals remain stable ' +
        'and render correctly.',
    })
  })
})
