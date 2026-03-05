import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let electronApp: ElectronApplication
let page: Page

test.beforeAll(async () => {
  // Launch Electron app with E2E test mode for controlled terminal behavior
  electronApp = await electron.launch({
    args: [path.join(__dirname, '..', 'out', 'main', 'index.js')],
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
    await page.waitForTimeout(300)

    // The backend session should now be selected (has bg-accent/15 class)
    await expect(backendSession).toHaveClass(/bg-accent\/15/)

    // Click back to broomy session
    const broomySession = page.locator('.cursor-pointer:has-text("broomy")')
    await broomySession.click()
    await page.waitForTimeout(300)

    await expect(broomySession).toHaveClass(/bg-accent\/15/)
  })
})

test.describe('Terminal Integration', () => {
  test('should have a terminal container', async () => {
    // The terminal container should be present
    // Wait a bit for xterm to initialize
    await page.waitForTimeout(1000)

    // Use first() since there are multiple terminals (main + user)
    const terminal = page.locator('.xterm').first()
    await expect(terminal).toBeVisible()
  })

  test('should display xterm canvas', async () => {
    await page.waitForTimeout(500)
    const xtermScreen = page.locator('.xterm-screen').first()
    await expect(xtermScreen).toBeVisible()
  })

  test('should display shell content (not error)', async () => {
    // Wait for terminal to initialize
    await page.waitForTimeout(1500)

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

    // Wait a moment
    await page.waitForTimeout(300)

    // We can't easily verify the output, but if no error, the test passes
  })

  test('should execute commands and show output', async () => {
    // Focus on the first (main) terminal
    const terminal = page.locator('.xterm-helper-textarea').first()
    await terminal.focus()

    // Type a test command with unique marker
    const testMarker = `test_${Date.now()}`
    await page.keyboard.type(`echo ${testMarker}`)
    await page.keyboard.press('Enter')

    // Wait for command to execute
    await page.waitForTimeout(500)

    // Get terminal content from the buffer registry
    const terminalText = await getTerminalContent(page, 'agent')

    // The echo output should appear in the terminal
    expect(terminalText).toContain(testMarker)
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
    await page.waitForTimeout(300)

    // Explorer panel should be visible - check for the Explorer header text inside the panel
    const explorerHeader = page.locator('text=Explorer').nth(1) // Second instance is the panel header
    await expect(explorerHeader).toBeVisible()

    // Close the panel
    await explorerButton.click()
    await page.waitForTimeout(300)

    // Panel should be closed - only one Explorer text visible (the button)
    const explorerCount = await page.locator('text=Explorer').count()
    expect(explorerCount).toBe(1)
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
    await page.waitForTimeout(300)
  })

  test('should show directory path in explorer panel', async () => {
    const explorerButton = page.locator('button:has-text("Explorer")')

    // Open the explorer panel
    await explorerButton.click()
    await page.waitForTimeout(300)

    // The demo sessions use /tmp/e2e-* directories - use partial match
    const directoryPath = page.locator('text=e2e-broomy')
    await expect(directoryPath).toBeVisible()

    // Close the panel
    await explorerButton.click()
    await page.waitForTimeout(300)
  })
})

test.describe('Button States', () => {
  test('should highlight Explorer button when panel is open', async () => {
    const explorerButton = page.locator('button:has-text("Explorer")')

    // Initially not highlighted
    let classes = await explorerButton.getAttribute('class')
    expect(classes).not.toContain('bg-accent')

    // Open panel
    await explorerButton.click()
    await page.waitForTimeout(300)

    // Should be highlighted
    classes = await explorerButton.getAttribute('class')
    expect(classes).toContain('bg-accent')

    // Close panel
    await explorerButton.click()
    await page.waitForTimeout(300)

    // No longer highlighted
    classes = await explorerButton.getAttribute('class')
    expect(classes).not.toContain('bg-accent')
  })

})

test.describe('Session Terminal Persistence', () => {
  test('should preserve terminal state when switching sessions', async () => {
    // Type something in the first session's terminal
    const terminal = page.locator('.xterm-helper-textarea').first()
    await terminal.focus()

    const uniqueMarker = `session1_${Date.now()}`
    await page.keyboard.type(`echo ${uniqueMarker}`)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(500)

    // Switch to another session
    const backendSession = page.locator('.cursor-pointer:has-text("backend-api")')
    await backendSession.click()
    await page.waitForTimeout(500)

    // Switch back to the first session
    const broomySession = page.locator('.cursor-pointer:has-text("broomy")')
    await broomySession.click()
    await page.waitForTimeout(500)

    // Verify the marker is still in the terminal buffer
    const terminalText = await getTerminalContent(page, 'agent')

    expect(terminalText).toContain(uniqueMarker)
  })
})

test.describe('E2E Shell Integration', () => {
  test('should display agent terminal with fake claude', async () => {
    // Wait for terminal to initialize and display content
    await page.waitForTimeout(1500)

    // The agent terminal should display the fake claude
    const xtermViewport = page.locator('.xterm-screen').first()
    await expect(xtermViewport).toBeVisible()

    // Get terminal content from the buffer registry
    const terminalText = await getTerminalContent(page, 'agent')

    // Agent terminal shows FAKE_CLAUDE_READY (it runs the fake claude script)
    expect(terminalText).toContain('FAKE_CLAUDE_READY')
  })

  test('should show user terminal when tab added', async () => {
    // Add a new user terminal tab via the "+" button in the tab bar
    const addTabButton = page.locator('button[title="New terminal tab"]:visible')
    await addTabButton.click()
    await page.waitForTimeout(2000)  // Wait for user terminal PTY to initialize

    // Get content from the user terminal buffer
    const terminalText = await getTerminalContent(page, 'user')

    // The user terminal shell uses "test-shell$" as its prompt in E2E mode
    expect(terminalText).toContain('test-shell$')

    // Switch back to Agent tab to restore state for subsequent tests
    const agentTab = page.locator('div.cursor-pointer:has-text("Agent"):visible').first()
    await agentTab.click()
    await page.waitForTimeout(300)
  })

})
