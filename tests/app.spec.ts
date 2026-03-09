import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'
import { dockerArgs } from './electron-launch-args'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let electronApp: ElectronApplication
let page: Page

test.beforeAll(async () => {
  // Launch Electron app with E2E test mode for controlled terminal behavior
  electronApp = await electron.launch({
    args: [...dockerArgs, path.join(__dirname, '..', 'out', 'main', 'index.js')],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      E2E_TEST: 'true',
      // Pass through E2E_HEADLESS to control window visibility
      E2E_HEADLESS: process.env.E2E_HEADLESS ?? 'true',
    },
  })

  // Get the first window
  page = await electronApp.firstWindow()

  // Wait for the app to be ready
  await page.waitForLoadState('domcontentloaded')

  // Wait for React to render
  await page.waitForSelector('#root > div', { timeout: 10000 })
  // Wait for sessions to load (sidebar renders session cards with cursor-pointer)
  await page.waitForSelector('.cursor-pointer', { timeout: 10000 })
})

test.afterAll(async () => {
  if (electronApp) {
    await electronApp.close()
  }
})

/**
 * Get terminal buffer content from the buffer registry.
 * xterm 6.0 renders via canvas, so DOM queries can't read terminal text.
 * The buffer registry exposes serialized content from each terminal.
 *
 * @param type - 'agent' to get the first agent buffer, 'user' for user terminal, 'any' for first non-empty
 */
async function getTerminalContent(p: Page, type: 'agent' | 'user' | 'any' = 'agent'): Promise<string> {
  return p.evaluate((searchType) => {
    const registry = (window as unknown as { __terminalBufferRegistry?: { getSessionIds: () => string[]; getBuffer: (id: string) => string | null } }).__terminalBufferRegistry
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

test.describe('Broomy App', () => {
  test('should display the app title', async () => {
    const title = page.locator('text=Broomy').first()
    await expect(title).toBeVisible()
  })

  test('should display the New Session button', async () => {
    const newSessionBtn = page.locator('button:has-text("+ New Session")')
    await expect(newSessionBtn).toBeVisible()
  })

  test('should display demo sessions in the sidebar', async () => {
    // Check for demo sessions (sessions are now divs, not buttons)
    const broomySession = page.locator('div:has-text("broomy")').first()
    await expect(broomySession).toBeVisible()

    const backendSession = page.locator('div:has-text("backend-api")').first()
    await expect(backendSession).toBeVisible()

    const docsSession = page.locator('div:has-text("docs-site")').first()
    await expect(docsSession).toBeVisible()
  })

  test('should show status indicators for sessions', async () => {
    // Sessions start as idle, so look for idle status indicators
    const idleStatus = page.locator('text=Idle').first()
    await expect(idleStatus).toBeVisible()

    // Look for status dot indicators
    const statusDot = page.locator('.bg-status-idle').first()
    await expect(statusDot).toBeVisible()
  })

  test('should show branch names for sessions', async () => {
    const mainBranch = page.locator('text=main').first()
    await expect(mainBranch).toBeVisible()

    const featureBranch = page.locator('text=feature/auth')
    await expect(featureBranch).toBeVisible()
  })

  test('should switch between sessions', async () => {
    // Click on backend-api session (session items are divs with cursor-pointer)
    const backendSession = page.locator('.cursor-pointer:has-text("backend-api")')
    await backendSession.click()

    // The backend session should now be selected (has bg-accent/15 class)
    await expect(backendSession).toHaveClass(/bg-accent\/15/)

    // Click back to broomy session
    const broomySession = page.locator('.cursor-pointer:has-text("broomy")')
    await broomySession.click()

    await expect(broomySession).toHaveClass(/bg-accent\/15/)
  })
})

test.describe('Terminal Integration', () => {
  test('should have a terminal container', async () => {
    // Use first() since there are multiple terminals (main + user)
    const terminal = page.locator('.xterm').first()
    await expect(terminal).toBeVisible()
  })

  test('should display xterm canvas', async () => {
    const xtermScreen = page.locator('.xterm-screen').first()
    await expect(xtermScreen).toBeVisible()
  })

  test('should display shell content (not error)', async () => {
    // Wait for terminal buffer to have content
    await expect.poll(() => getTerminalContent(page, 'agent'), { timeout: 10000 }).toBeTruthy()

    // Get terminal content from the buffer registry (xterm 6.0 renders via canvas)
    const terminalText = await getTerminalContent(page, 'agent')

    // Terminal should NOT show the error message
    expect(terminalText).not.toContain('Failed to start terminal')

    // Terminal should show some shell-like content
    expect(terminalText.length).toBeGreaterThan(0)
  })

  test('should be able to focus and type in terminal', async () => {
    // Focus on the first (main) terminal
    const terminal = page.locator('.xterm-helper-textarea').first()
    await terminal.focus()

    // Type a simple command
    await page.keyboard.type('echo hello')

    // We can't easily verify the output, but if no error, the test passes
  })

  test('should execute commands and show output', async () => {
    // Wait for fake claude script to finish its output so typed text won't be garbled
    await expect.poll(() => getTerminalContent(page, 'agent'), { timeout: 15000 })
      .toContain('FAKE_CLAUDE_IDLE')

    // Focus on the first (main) terminal
    const terminal = page.locator('.xterm-helper-textarea').first()
    await terminal.focus()

    // Type a test command with unique marker
    const testMarker = 'EXEC_CHECK'
    await page.keyboard.type(`echo ${testMarker}`)
    await page.keyboard.press('Enter')

    // Wait for the echo output to appear in the terminal buffer
    await expect.poll(() => getTerminalContent(page, 'agent'), { timeout: 5000 })
      .toContain(testMarker)
  })
})

test.describe('Layout', () => {
  test('should have correct layout structure', async () => {
    // Title bar - look for the app title text
    const titleBar = page.locator('text=Broomy').first()
    await expect(titleBar).toBeVisible()

    // Sidebar - contains session list with "+ New Session" button
    const newSessionBtn = page.locator('button:has-text("+ New Session")')
    await expect(newSessionBtn).toBeVisible()

    // Main content area - look for the terminal area
    const terminalArea = page.locator('.xterm').first()
    await expect(terminalArea).toBeVisible()
  })
})

test.describe('Explorer Panel', () => {
  test('should toggle Explorer panel', async () => {
    const explorerButton = page.locator('button:has-text("Explorer")')

    // Open the Explorer panel
    await explorerButton.click()

    // Explorer panel should be visible
    const explorerPanel = page.locator('[data-panel-id="explorer"]')
    await expect(explorerPanel).toBeVisible()

    // Close the panel
    await explorerButton.click()

    // Panel should be closed
    await expect(explorerPanel).not.toBeVisible()
  })

  test('should show file tree placeholder items', async () => {
    const explorerButton = page.locator('button:has-text("Explorer")')

    // Open the explorer panel
    await explorerButton.click()
    const explorerPanel = page.locator('[data-panel-id="explorer"]')
    await expect(explorerPanel).toBeVisible()

    // Switch to Files filter (default is source-control)
    const filesButton = explorerPanel.locator('button[title="Files"]')
    await filesButton.click()

    // Check for placeholder file items (scoped to explorer panel to avoid matching hidden per-session instances)
    const srcFolder = explorerPanel.locator('text=src').first()
    const packageJson = explorerPanel.locator('text=package.json').first()

    await expect(srcFolder).toBeVisible()
    await expect(packageJson).toBeVisible()

    // Close the panel
    await explorerButton.click()
    await expect(explorerPanel).not.toBeVisible()
  })

  test('should show directory path in explorer panel', async () => {
    const explorerButton = page.locator('button:has-text("Explorer")')

    // Open the explorer panel
    await explorerButton.click()
    const explorerPanel = page.locator('[data-panel-id="explorer"]')
    await expect(explorerPanel).toBeVisible()

    // The demo sessions use /tmp/e2e-* directories - scope to explorer panel
    const directoryPath = explorerPanel.locator('text=e2e-broomy')
    await expect(directoryPath).toBeVisible()

    // Close the panel
    await explorerButton.click()
    await expect(explorerPanel).not.toBeVisible()
  })
})

test.describe('Button States', () => {
  test('should highlight Explorer button when panel is open', async () => {
    const explorerButton = page.locator('button:has-text("Explorer")')

    // Initially not highlighted
    await expect(explorerButton).not.toHaveClass(/bg-accent/)

    // Open panel
    await explorerButton.click()
    await expect(explorerButton).toHaveClass(/bg-accent/)

    // Close panel
    await explorerButton.click()
    await expect(explorerButton).not.toHaveClass(/bg-accent/)
  })

})

test.describe('Session Terminal Persistence', () => {
  test('should preserve terminal state when switching sessions', async () => {
    // Wait for fake claude output to finish (FAKE_CLAUDE_IDLE marks completion)
    await expect.poll(() => getTerminalContent(page, 'agent'), { timeout: 15000 })
      .toContain('FAKE_CLAUDE_IDLE')

    // Now type a marker after the script has gone idle — output won't be garbled by spinner
    const terminal = page.locator('.xterm-helper-textarea').first()
    await terminal.focus()

    const uniqueMarker = 'PERSIST_CHECK'
    await page.keyboard.type(`echo ${uniqueMarker}`)
    await page.keyboard.press('Enter')

    // Wait for the marker to appear in terminal buffer
    await expect.poll(() => getTerminalContent(page, 'agent'), { timeout: 5000 })
      .toContain(uniqueMarker)

    // Switch to another session
    const backendSession = page.locator('.cursor-pointer:has-text("backend-api")')
    await backendSession.click()
    await expect(backendSession).toHaveClass(/bg-accent\/15/)

    // Switch back to the first session
    const broomySession = page.locator('.cursor-pointer:has-text("broomy")')
    await broomySession.click()
    await expect(broomySession).toHaveClass(/bg-accent\/15/)

    // Verify the marker is still in the terminal buffer
    await expect.poll(() => getTerminalContent(page, 'agent'), { timeout: 5000 })
      .toContain(uniqueMarker)
  })
})

test.describe('E2E Shell Integration', () => {
  test('should display agent terminal with fake claude', async () => {
    // The agent terminal should display the fake claude
    const xtermViewport = page.locator('.xterm-screen').first()
    await expect(xtermViewport).toBeVisible()

    // Wait for FAKE_CLAUDE_READY to appear in the terminal buffer
    await expect.poll(() => getTerminalContent(page, 'agent'), { timeout: 10000 })
      .toContain('FAKE_CLAUDE_READY')
  })

  test('should show user terminal when tab added', async () => {
    // Add a new user terminal tab via the "+" button in the tab bar
    const addTabButton = page.locator('button[title="New terminal tab"]:visible')
    await addTabButton.click()

    // Wait for user terminal shell prompt to appear in the buffer
    await expect.poll(() => getTerminalContent(page, 'user'), { timeout: 10000 })
      .toContain('test-shell$')

    // Switch back to Agent tab to restore state for subsequent tests
    const agentTab = page.locator('div.cursor-pointer:has-text("Agent"):visible').first()
    await agentTab.click()
  })

})
