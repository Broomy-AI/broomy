import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let electronApp: ElectronApplication
let page: Page

test.beforeAll(async () => {
  // Build the app first
  execSync('pnpm build', { cwd: path.join(__dirname, '..'), stdio: 'inherit' })

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

  test('should toggle Explorer panel', async () => {
    const filesButton = page.locator('button:has-text("Explorer")')
    await expect(filesButton).toBeVisible()

    // Click to toggle on
    await filesButton.click()
    await page.waitForTimeout(300)

    // Check for explorer panel content (Explorer header appears when panel is open)
    const explorerHeader = page.locator('text=Explorer').nth(1) // Second one is in the panel
    await expect(explorerHeader).toBeVisible()

    // Toggle off
    await filesButton.click()
    await page.waitForTimeout(300)

    // Panel should be gone - check that Explorer header (second instance) is not visible
    const explorerHeaders = await page.locator('text=Explorer').count()
    expect(explorerHeaders).toBe(1) // Only the button remains
  })

  test('should toggle Terminal panel', async () => {
    const terminalButton = page.locator('button:has-text("Terminal")').first()
    await expect(terminalButton).toBeVisible()

    // Get initial state - check if button is highlighted (blue)
    const initialClasses = await terminalButton.getAttribute('class')
    const wasActive = initialClasses?.includes('bg-accent')

    // Click to toggle
    await terminalButton.click()
    await page.waitForTimeout(300)

    // Click again to restore state
    await terminalButton.click()
    await page.waitForTimeout(300)
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

    // Get terminal content from the first (main) terminal
    const terminalText = await page.evaluate(() => {
      const viewport = document.querySelector('.xterm-rows')
      return viewport?.textContent || ''
    })

    // Terminal should NOT show the error message
    expect(terminalText).not.toContain('Failed to start terminal')

    // Terminal should show some shell-like content
    // (could be a prompt, or the working directory)
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

    // Get terminal content from the first terminal
    const terminalText = await page.evaluate(() => {
      const viewport = document.querySelector('.xterm-rows')
      return viewport?.textContent || ''
    })

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

  test('should have status color indicators', async () => {
    // All sessions start as idle, so check for idle indicators
    const idleIndicator = page.locator('.bg-status-idle').first()
    await expect(idleIndicator).toBeVisible()
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
    await page.waitForTimeout(300)

    // Check for placeholder file items
    const srcFolder = page.locator('text=src').first()
    const packageJson = page.locator('text=package.json')

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

  test('should highlight Terminal button when panel is open', async () => {
    const terminalButton = page.locator('button:has-text("Terminal")').first()

    // Get initial state
    let classes = await terminalButton.getAttribute('class')
    const initiallyActive = classes?.includes('bg-accent')

    // Toggle state
    await terminalButton.click()
    await page.waitForTimeout(300)

    // State should be opposite now
    classes = await terminalButton.getAttribute('class')
    if (initiallyActive) {
      expect(classes).not.toContain('bg-accent')
    } else {
      expect(classes).toContain('bg-accent')
    }

    // Toggle back
    await terminalButton.click()
    await page.waitForTimeout(300)
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

    // Verify the marker is still in the terminal
    const terminalText = await page.evaluate(() => {
      const viewport = document.querySelector('.xterm-rows')
      return viewport?.textContent || ''
    })

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

    // Get terminal content from the agent terminal
    const terminalText = await page.evaluate(() => {
      const viewport = document.querySelector('.xterm-rows')
      return viewport?.textContent || ''
    })

    // Agent terminal shows FAKE_CLAUDE_READY (it runs the fake claude script)
    expect(terminalText).toContain('FAKE_CLAUDE_READY')
  })

  test('should show user terminal when toggled', async () => {
    // Toggle the user terminal to be visible
    const terminalButton = page.locator('button:has-text("Terminal")').first()
    await terminalButton.click()
    await page.waitForTimeout(1500)  // Wait for terminal to initialize

    const terminalText = await page.evaluate(() => {
      const viewports = document.querySelectorAll('.xterm-rows')
      return Array.from(viewports).map(v => v.textContent || '').join('\n')
    })

    // The user terminal shell uses "test-shell$" as its prompt
    expect(terminalText).toContain('test-shell$')

    // Toggle it back off to restore state
    await terminalButton.click()
    await page.waitForTimeout(300)
  })
})
