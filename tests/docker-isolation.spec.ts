/**
 * Docker isolation E2E tests — validates Broomy runs correctly on Linux.
 *
 * Takes screenshots of every key feature to confirm rendering is correct.
 * Each screenshot is taken AFTER assertions confirm the expected state,
 * with a paint delay to ensure the compositor has rendered the latest frame.
 *
 * Skipped by default in playwright.config.ts; run explicitly via:
 *   npx playwright test tests/docker-isolation.spec.ts
 *
 * Or via the Docker entrypoint:
 *   ./run-linux-e2e.sh screenshots
 */

import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { dockerArgs } from './electron-launch-args'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || path.join(__dirname, '..', 'docker-output')

let electronApp: ElectronApplication
let page: Page

/**
 * Wait for the compositor to paint, then capture a screenshot via Electron's
 * native capturePage API (avoids Playwright's page.screenshot() which can hang
 * when WebGL terminal canvas is actively rendering).
 */
async function screenshot(name: string) {
  // Request an animation frame in the renderer to ensure pending paints complete,
  // then wait a bit more for the compositor to flush.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 150))))

  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
  const filePath = path.join(SCREENSHOT_DIR, `${name}.png`)
  const base64 = await electronApp.evaluate(async ({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    const image = await win.webContents.capturePage()
    return image.toPNG().toString('base64')
  })
  fs.writeFileSync(filePath, Buffer.from(base64, 'base64'))
  console.log(`  Screenshot: ${filePath}`)
}

/** Get terminal buffer content from the buffer registry. */
async function getTerminalContent(p: Page, type: 'agent' | 'user' | 'any' = 'agent'): Promise<string> {
  return p.evaluate((searchType) => {
    const registry = (window as unknown as {
      __terminalBufferRegistry?: {
        getSessionIds: () => string[]
        getBuffer: (id: string) => string | null
      }
    }).__terminalBufferRegistry
    if (!registry) return ''
    const ids = registry.getSessionIds()
    for (const id of ids) {
      const isUser = id.endsWith('-user')
      if (searchType === 'agent' && isUser) continue
      if (searchType === 'user' && !isUser) continue
      const buf = registry.getBuffer(id)
      if (buf && buf.length > 0) return buf
    }
    return ''
  }, type)
}

/** Check if a tab name span has the active underline. */
async function isTabActive(tabText: string): Promise<boolean> {
  const span = page.locator(`span.truncate:has-text("${tabText}"):visible`).first()
  const classes = await span.getAttribute('class')
  return classes?.includes('border-accent') ?? false
}

test.beforeAll(async () => {
  electronApp = await electron.launch({
    args: [...dockerArgs, path.join(__dirname, '..', 'out', 'main', 'index.js')],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      E2E_TEST: 'true',
      E2E_HEADLESS: 'true',
    },
  })

  page = await electronApp.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector('#root > div', { timeout: 15000 })
  await page.waitForSelector('.cursor-pointer', { timeout: 15000 })
})

test.afterAll(async () => {
  if (electronApp) {
    await electronApp.close()
  }
})

test.setTimeout(60000)

test.describe('Linux Rendering Validation', () => {
  test('01 - app launches with terminal content', async () => {
    // Verify core UI elements
    const title = page.locator('text=Broomy').first()
    await expect(title).toBeVisible()

    const newSessionBtn = page.locator('button:has-text("+ New Session")')
    await expect(newSessionBtn).toBeVisible()

    // Verify all 3 demo sessions render
    await expect(page.locator('div:has-text("broomy")').first()).toBeVisible()
    await expect(page.locator('div:has-text("backend-api")').first()).toBeVisible()
    await expect(page.locator('div:has-text("docs-site")').first()).toBeVisible()

    // Verify branch names
    await expect(page.locator('text=main').first()).toBeVisible()
    await expect(page.locator('text=feature/auth')).toBeVisible()

    // Verify status indicators
    await expect(page.locator('text=Idle').first()).toBeVisible()
    await expect(page.locator('.bg-status-idle').first()).toBeVisible()

    // Verify toolbar buttons
    await expect(page.locator('button:has-text("Sessions")')).toBeVisible()
    await expect(page.locator('button:has-text("Explorer")')).toBeVisible()
    await expect(page.locator('button:has-text("File")')).toBeVisible()

    // Verify terminal renders with content (wait for fake claude)
    const xtermScreen = page.locator('.xterm-screen').first()
    await expect(xtermScreen).toBeVisible()
    await expect.poll(() => getTerminalContent(page, 'agent'), { timeout: 15000 })
      .toContain('FAKE_CLAUDE_READY')

    // Verify Agent tab is active
    expect(await isTabActive('Agent')).toBe(true)

    // Verify search box
    await expect(page.locator('input[placeholder="Search sessions..."]')).toBeVisible()

    await screenshot('01-app-launched')
  })

  test('02 - terminal accepts input and shows output', async () => {
    // Wait for fake claude to finish its animation and go idle
    await expect.poll(() => getTerminalContent(page, 'agent'), { timeout: 15000 })
      .toContain('FAKE_CLAUDE_IDLE')

    const terminal = page.locator('.xterm-helper-textarea').first()
    await terminal.focus()

    await page.keyboard.type('echo LINUX_TEST_OK')
    await page.keyboard.press('Enter')

    // Wait for the echo output AND verify it appeared
    await expect.poll(() => getTerminalContent(page, 'agent'), { timeout: 5000 })
      .toContain('LINUX_TEST_OK')

    // Verify terminal content includes the full fake claude output sequence
    const content = await getTerminalContent(page, 'agent')
    expect(content).toContain('FAKE_CLAUDE_READY')
    expect(content).toContain('Claude is thinking')
    expect(content).toContain('Done! This is a simulated Claude response.')
    expect(content).toContain('FAKE_CLAUDE_IDLE')
    expect(content).toContain('LINUX_TEST_OK')

    await screenshot('02-terminal-with-output')
  })

  test('03 - session switching shows different terminals', async () => {
    // Switch to backend-api session
    const backendSession = page.locator('.cursor-pointer:has-text("backend-api")')
    await backendSession.click()
    await expect(backendSession).toHaveClass(/bg-accent\/15/)

    // Title bar should update to show backend-api
    await expect(page.locator('text=backend-api').first()).toBeVisible()

    // Wait for the backend session's terminal to have content
    await expect.poll(() => getTerminalContent(page, 'agent'), { timeout: 10000 })
      .toBeTruthy()

    await screenshot('03-session-backend-api')

    // Switch back to broomy
    const broomySession = page.locator('.cursor-pointer:has-text("broomy")')
    await broomySession.click()
    await expect(broomySession).toHaveClass(/bg-accent\/15/)

    // Verify broomy terminal content is preserved
    await expect.poll(() => getTerminalContent(page, 'agent'), { timeout: 5000 })
      .toContain('LINUX_TEST_OK')
  })

  test('04 - explorer panel with source control', async () => {
    const explorerButton = page.locator('button:has-text("Explorer")')
    await explorerButton.click()

    // Wait for Explorer panel to be fully rendered with content inside
    const explorerPanel = page.locator('[data-panel-id="explorer"]')
    await expect(explorerPanel).toBeVisible()

    // Verify Explorer heading
    await expect(explorerPanel.locator('text=Explorer').first()).toBeVisible()

    // Default view is source control — verify changed files are listed
    await expect(explorerPanel.locator('text=Uncommitted').first()).toBeVisible({ timeout: 5000 })
    await expect(explorerPanel.locator('text=CHANGES').first()).toBeVisible()

    // Verify source control action buttons
    await expect(explorerPanel.locator('text=Commit').first()).toBeVisible()

    await screenshot('04-explorer-source-control')

    // Switch to Files view
    const filesButton = explorerPanel.locator('button[title="Files"]')
    await filesButton.click()

    // Wait for file tree to render
    const srcFolder = explorerPanel.locator('text=src').first()
    await expect(srcFolder).toBeVisible()
    await expect(explorerPanel.locator('text=package.json').first()).toBeVisible()

    await screenshot('05-explorer-files-view')

    // Close explorer
    await explorerButton.click()
    await expect(explorerPanel).not.toBeVisible()
  })

  test('06 - user terminal tab', async () => {
    // Add a user terminal tab
    const addTabButton = page.locator('button[title="New terminal tab"]:visible')
    await addTabButton.click()

    // Wait for user terminal content in the buffer registry
    await expect.poll(() => getTerminalContent(page, 'user'), { timeout: 10000 })
      .toContain('test-shell$')

    // Verify the new tab appeared
    const terminalTab = page.locator('span.truncate:has-text("Terminal"):visible').first()
    await expect(terminalTab).toBeVisible()

    // Explicitly click the Terminal tab to ensure the canvas switches
    const terminalTabClickable = page.locator('div.cursor-pointer:has-text("Terminal"):visible').first()
    await terminalTabClickable.click()

    // Verify Agent tab is no longer active
    await expect.poll(() => isTabActive('Agent')).toBe(false)

    // Wait for the xterm canvas to fully render the user terminal
    await page.waitForTimeout(500)

    await screenshot('06-user-terminal-tab')

    // Switch back to Agent tab
    const agentTab = page.locator('div.cursor-pointer:has-text("Agent"):visible').first()
    await agentTab.click()
    await expect.poll(() => isTabActive('Agent')).toBe(true)

    // Verify agent terminal content is still there
    await expect.poll(() => getTerminalContent(page, 'agent'), { timeout: 5000 })
      .toContain('FAKE_CLAUDE_IDLE')
  })

  test('07 - new session dialog', async () => {
    const newSessionBtn = page.locator('button:has-text("+ New Session")')
    await newSessionBtn.click()

    // Wait for dialog to fully render with content
    const heading = page.locator('h2:has-text("New Session")')
    await expect(heading).toBeVisible({ timeout: 5000 })

    // Verify dialog has action buttons
    await expect(page.locator('button:has-text("Clone")')).toBeVisible()
    await expect(page.locator('button:has-text("Add Repo")')).toBeVisible()
    await expect(page.locator('button:has-text("Folder")')).toBeVisible()

    // Verify demo-project repo is listed
    await expect(page.locator('text=demo-project')).toBeVisible()

    // Verify repo action buttons
    await expect(page.locator('button[title="Create a new branch worktree"]')).toBeVisible()
    await expect(page.locator('button[title="Open an existing branch"]')).toBeVisible()

    await screenshot('07-new-session-dialog')

    // Close dialog
    await page.keyboard.press('Escape')
    await expect(heading).not.toBeVisible()
  })

  test('08 - settings panel', async () => {
    const settingsButton = page.locator('button[title="Settings"]')
    await settingsButton.click()

    const settingsPanel = page.locator('[data-panel-id="settings"]')
    await expect(settingsPanel).toBeVisible()

    // Verify settings panel has agent/repo sections
    await expect(settingsPanel.locator('text=Agents').first()).toBeVisible()
    await expect(settingsPanel.locator('text=Repos').first()).toBeVisible()

    await screenshot('08-settings-panel')

    // Close settings
    await settingsButton.click()
    await expect(settingsPanel).not.toBeVisible()
  })

  test('09 - keyboard shortcuts work', async () => {
    // Cmd+2 should toggle Explorer (on Linux, Cmd maps to Meta)
    await page.keyboard.press('Meta+2')
    const explorerPanel = page.locator('[data-panel-id="explorer"]')
    await expect(explorerPanel).toBeVisible()

    await screenshot('09-keyboard-shortcut-explorer')

    // Close it
    await page.keyboard.press('Meta+2')
    await expect(explorerPanel).not.toBeVisible()
  })

  test('10 - sidebar toggle', async () => {
    const sessionsButton = page.locator('button[title*="Sessions"]')
    const sidebar = page.locator('[data-panel-id="sidebar"]')

    // Sidebar should be visible by default
    await expect(sidebar).toBeVisible()

    // Toggle sidebar off
    await sessionsButton.click()
    await expect(sidebar).not.toBeVisible()

    await screenshot('10-sidebar-hidden')

    // Toggle sidebar back on
    await sessionsButton.click()
    await expect(sidebar).toBeVisible()

    // Verify sessions are still there after toggling
    await expect(page.locator('.cursor-pointer:has-text("broomy")')).toBeVisible()
    await expect(page.locator('.cursor-pointer:has-text("backend-api")')).toBeVisible()
  })

  test('11 - final full-app screenshot', async () => {
    // Ensure we're on broomy session with clean state
    const broomySession = page.locator('.cursor-pointer:has-text("broomy")')
    await broomySession.click()
    await expect(broomySession).toHaveClass(/bg-accent\/15/)

    // Wait for terminal to have the full fake claude output visible
    await expect.poll(() => getTerminalContent(page, 'agent'), { timeout: 5000 })
      .toContain('FAKE_CLAUDE_IDLE')

    await screenshot('11-full-app-final')
  })
})
