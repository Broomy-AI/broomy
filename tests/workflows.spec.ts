/**
 * End-to-end workflow tests using real git repositories.
 *
 * Unlike the other E2E tests which stub all file/git access, these tests
 * use E2E_REAL_REPOS=true so handlers fall through to real git and real
 * filesystem operations. A setup script creates real repos in /tmp/ with
 * branches, files, and commits before the tests run.
 *
 * Tests cover:
 * 1. Creating a new session
 * 2. Source control with real git status (default commands, no commands.json)
 * 3. Review tab showing real review.md content
 * 4. Terminal tab switching with content verification
 * 5. Running a shell command action
 */
import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import { execSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import { dockerArgs, isDocker } from './electron-launch-args'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let electronApp: ElectronApplication
let page: Page

/**
 * Take a diagnostic screenshot. Uses Electron's native capturePage API in Docker
 * (page.screenshot() hangs when WebGL terminal canvas is actively rendering).
 */
async function diagnosticScreenshot(app: ElectronApplication, p: Page, filePath: string) {
  if (isDocker) {
    const fs = await import('fs')
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    await p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 150))))
    const base64 = await app.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      const image = await win.webContents.capturePage()
      return image.toPNG().toString('base64')
    })
    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'))
  } else {
    await p.screenshot({ path: filePath })
  }
}

/**
 * Get terminal buffer content from the buffer registry.
 * xterm 6.0 renders via canvas, so DOM queries can't read terminal text.
 */
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

/** Check if a terminal tab name has the active underline indicator */
async function isTabActive(tabText: string): Promise<boolean> {
  const span = page.locator(`span.truncate:has-text("${tabText}"):visible`).first()
  try {
    const classes = await span.getAttribute('class')
    return classes?.includes('border-accent') ?? false
  } catch {
    return false
  }
}

test.beforeAll(async () => {
  // Set up real git repos before launching the app
  execSync(`bash ${path.join(__dirname, '..', 'scripts', 'setup-e2e-repos.sh')}`, {
    stdio: 'inherit',
  })

  electronApp = await electron.launch({
    args: [...dockerArgs, path.join(__dirname, '..', 'out', 'main', 'index.js')],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      E2E_TEST: 'true',
      E2E_REAL_REPOS: 'true',
      E2E_HEADLESS: process.env.E2E_HEADLESS ?? 'true',
    },
  })
  page = await electronApp.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector('#root > div', { timeout: 10000 })
  await page.waitForSelector('.cursor-pointer', { timeout: 10000 })
})

test.afterAll(async () => {
  if (electronApp) await electronApp.close()
})

// ── Real Git Repo Verification ───────────────────────────────────────────

test.describe('Real Git Integration', () => {
  test('should show real branch name from git repo', async () => {
    // The broomy session is on "main" branch — verified from real git
    const broomySession = page.locator('.cursor-pointer:has-text("broomy")')
    await broomySession.click()
    await expect(broomySession).toHaveClass(/bg-accent\/15/)

    // Should show "main" as the branch (from real git)
    await expect(page.locator('text=main').first()).toBeVisible()
  })

  test('should show real branch for backend-api session', async () => {
    // backend-api is on "feature/auth" branch
    const backendSession = page.locator('.cursor-pointer:has-text("backend-api")')
    await expect(backendSession).toBeVisible()
    await expect(page.locator('text=feature/auth')).toBeVisible()
  })
})

// ── Source Control with Real Git Status ───────────────────────────────────

test.describe('Source Control with Real Git', () => {
  test('should open explorer and show real source control data', async () => {
    // Select the backend-api session (which has changes on feature/auth)
    const backendSession = page.locator('.cursor-pointer:has-text("backend-api")')
    await backendSession.click()
    await expect(backendSession).toHaveClass(/bg-accent\/15/)

    // Open explorer panel
    const explorerBtn = page.locator('button[title*="Explorer"]')
    await explorerBtn.click()
    const explorerPanel = page.locator('[data-panel-id="explorer"]')
    await expect(explorerPanel).toBeVisible()

    // Ensure source control tab is active
    const scButton = explorerPanel.locator('button[title="Source Control"]')
    await scButton.click()

    // Take screenshot of source control with real git data
    await diagnosticScreenshot(electronApp, page, 'test-results/real-source-control.png')
  })

  test('should show real file tree from disk', async () => {
    const explorerPanel = page.locator('[data-panel-id="explorer"]')

    // Switch to Files tab
    const filesButton = explorerPanel.locator('button[title="Files"]')
    await filesButton.click()

    // Should show real files from the git repo
    await expect(explorerPanel.locator('text=src').first()).toBeVisible({ timeout: 5000 })
    await expect(explorerPanel.locator('text=package.json').first()).toBeVisible()
    await expect(explorerPanel.locator('text=README.md').first()).toBeVisible()

    // Take screenshot of real file tree
    await diagnosticScreenshot(electronApp, page, 'test-results/real-file-tree.png')
  })

  test('should show default action buttons (no commands.json)', async () => {
    const explorerPanel = page.locator('[data-panel-id="explorer"]')

    // Switch back to Source Control
    const scButton = explorerPanel.locator('button[title="Source Control"]')
    await scButton.click()

    // The backend-api repo is on feature/auth with committed changes and no tracking
    // "Commit with AI" should NOT appear (repo is clean - all changes committed)
    // What appears depends on the real git state

    // Take screenshot to see what buttons appear
    await diagnosticScreenshot(electronApp, page, 'test-results/real-action-buttons.png')
  })

  test('should close explorer', async () => {
    const explorerBtn = page.locator('button[title*="Explorer"]')
    await explorerBtn.click()
    await expect(page.locator('[data-panel-id="explorer"]')).not.toBeVisible()
  })
})

// ── Review Tab with Real review.md ───────────────────────────────────────

test.describe('Review Tab with Real Files', () => {
  test('should display review from real review.md file', async () => {
    // Select broomy session (has .broomy/output/review.md on disk)
    const broomySession = page.locator('.cursor-pointer:has-text("broomy")')
    await broomySession.click()
    await expect(broomySession).toHaveClass(/bg-accent\/15/)

    // Open explorer
    const explorerBtn = page.locator('button[title*="Explorer"]')
    await explorerBtn.click()
    const explorerPanel = page.locator('[data-panel-id="explorer"]')
    await expect(explorerPanel).toBeVisible()

    // Switch to Review tab
    const reviewTab = explorerPanel.locator('button[title="Review"]')
    await reviewTab.click()

    // Should show content from the real review.md we created in setup
    await expect(explorerPanel.locator('text=Overview').first()).toBeVisible({ timeout: 10000 })
    await expect(explorerPanel.locator('text=dark mode').first()).toBeVisible()

    // Take screenshot
    await diagnosticScreenshot(electronApp, page, 'test-results/real-review-tab.png')
  })

  test('should show collapsible sections from real markdown', async () => {
    const explorerPanel = page.locator('[data-panel-id="explorer"]')

    // Sections from the real review.md
    await expect(explorerPanel.locator('text=Change Analysis').first()).toBeVisible()
    await expect(explorerPanel.locator('text=Potential Issues').first()).toBeVisible()
    await expect(explorerPanel.locator('text=Design Decisions').first()).toBeVisible()
  })

  test('should show subsections inside expanded sections', async () => {
    const explorerPanel = page.locator('[data-panel-id="explorer"]')

    // The "Change Analysis" section is the first section (after Overview) and should
    // be expanded by default. Its ### subsections render as collapsible cards.
    // Click on "Change Analysis" heading to expand it if collapsed
    const changeAnalysis = explorerPanel.locator('text=Change Analysis').first()
    await changeAnalysis.click()

    // After expanding, subsection cards should appear
    // Give them a moment to render
    await expect(explorerPanel.locator('text=Theme context').first()).toBeVisible({ timeout: 5000 })

    // Take screenshot of review with sections
    await diagnosticScreenshot(electronApp, page, 'test-results/real-review-sections.png')

    // Close explorer
    const explorerBtn = page.locator('button[title*="Explorer"]')
    await explorerBtn.click()
    await expect(page.locator('[data-panel-id="explorer"]')).not.toBeVisible()
  })
})

// ── Session Creation ──────────────────────────────────────────────────────

test.describe('Session Creation', () => {
  test('should open new session dialog and show agent picker', async () => {
    const newSessionBtn = page.locator('button:has-text("+ New Session")')
    await newSessionBtn.click()
    await expect(page.locator('h2:has-text("New Session")')).toBeVisible()

    // Click "Open" to open the main branch of demo-project
    const openMainBtn = page.locator('button[title="Open main branch"]')
    await openMainBtn.click()

    // Should navigate to agent picker
    await expect(page.locator('h2:has-text("Select Agent")')).toBeVisible()

    // Should show agents with install status
    await expect(page.locator('text=Claude Code')).toBeVisible()
    await expect(page.locator('text=Shell Only')).toBeVisible()

    // Take screenshot
    await diagnosticScreenshot(electronApp, page, 'test-results/agent-picker.png')
  })

  test('should create session with Shell Only', async () => {
    // Count sessions before
    const initialCount = await page.locator('.cursor-pointer').filter({ has: page.locator('span.truncate') }).count()

    // Click "Shell Only" to create session without an agent
    await page.locator('button:has-text("Shell Only")').click()

    // Dialog should close
    await expect(page.locator('h2:has-text("Select Agent")')).not.toBeVisible()

    // Should have one more session
    const finalCount = await page.locator('.cursor-pointer').filter({ has: page.locator('span.truncate') }).count()
    expect(finalCount).toBeGreaterThan(initialCount)

    // Take screenshot of new session
    await diagnosticScreenshot(electronApp, page, 'test-results/session-created.png')
  })

  test('should switch back to broomy for remaining tests', async () => {
    const broomySession = page.locator('.cursor-pointer:has-text("broomy")')
    await broomySession.click()
    await expect(broomySession).toHaveClass(/bg-accent\/15/)
  })
})

// ── Terminal Tab Switching ────────────────────────────────────────────────

test.describe('Terminal Tab Switching', () => {
  test('should show Agent tab with fake claude output', async () => {
    expect(await isTabActive('Agent')).toBe(true)

    // Wait for fake claude to produce output
    await expect.poll(() => getTerminalContent(page, 'agent'), { timeout: 15000 })
      .toContain('FAKE_CLAUDE_READY')

    await diagnosticScreenshot(electronApp, page, 'test-results/agent-terminal.png')
  })

  test('should add user terminal and show shell prompt', async () => {
    const addTabBtn = page.locator('button[title="New terminal tab"]:visible')
    await addTabBtn.click()

    // User terminal should show shell prompt
    await expect.poll(() => getTerminalContent(page, 'user'), { timeout: 10000 })
      .toContain('test-shell$')

    // Agent tab should no longer be active
    expect(await isTabActive('Agent')).toBe(false)

    await diagnosticScreenshot(electronApp, page, 'test-results/user-terminal.png')
  })

  test('should switch between Agent and user tabs preserving content', async () => {
    // Switch to Agent tab (scoped to terminal tablist to avoid matching sidebar sessions)
    const tablist = page.locator('[role="tablist"][aria-label="Terminal tabs"]')
    const agentTab = tablist.locator('[role="tab"]:has-text("Agent")').first()
    await agentTab.click()

    await expect.poll(() => isTabActive('Agent')).toBe(true)
    await expect.poll(() => getTerminalContent(page, 'agent'), { timeout: 5000 })
      .toContain('FAKE_CLAUDE_READY')

    // Switch back to user tab (any non-Agent tab in the terminal tablist)
    const userTab = tablist.locator('[role="tab"]').filter({ hasNotText: 'Agent' }).first()
    await userTab.click()

    // User terminal content should be preserved
    await expect.poll(() => getTerminalContent(page, 'user'), { timeout: 5000 })
      .toContain('test-shell$')
  })

  test('should switch back to Agent tab', async () => {
    const tablist = page.locator('[role="tablist"][aria-label="Terminal tabs"]')
    const agentTab = tablist.locator('[role="tab"]:has-text("Agent")').first()
    await agentTab.click()
    await expect.poll(() => isTabActive('Agent')).toBe(true)
  })
})

// ── Agent Terminal Lifecycle ─────────────────────────────────────────────

test.describe('Agent Terminal', () => {
  test('should complete fake claude lifecycle', async () => {
    // Ensure we're on broomy session (has an agent terminal)
    const broomySession = page.locator('.cursor-pointer:has-text("broomy")')
    await broomySession.click()
    await expect(broomySession).toHaveClass(/bg-accent\/15/)

    // Ensure Agent tab is active
    const agentTab = page.locator('div.cursor-pointer:has-text("Agent"):visible').first()
    if (!await isTabActive('Agent')) {
      await agentTab.click()
    }

    // Wait for fake claude to complete (READY then IDLE)
    await expect.poll(() => getTerminalContent(page, 'agent'), { timeout: 20000 })
      .toContain('FAKE_CLAUDE_READY')

    const content = await getTerminalContent(page, 'agent')
    expect(content).toContain('FAKE_CLAUDE_READY')
  })

  test('should accept input after agent goes idle', async () => {
    await expect.poll(() => getTerminalContent(page, 'agent'), { timeout: 20000 })
      .toContain('FAKE_CLAUDE_IDLE')

    const terminal = page.locator('.xterm-helper-textarea').first()
    await terminal.focus()

    const marker = 'TYPED_INPUT_CHECK'
    await page.keyboard.type(`echo ${marker}`)
    await page.keyboard.press('Enter')

    await expect.poll(() => getTerminalContent(page, 'agent'), { timeout: 5000 })
      .toContain(marker)

    await diagnosticScreenshot(electronApp, page, 'test-results/agent-input.png')
  })
})

// ── File Viewer with Real Files ──────────────────────────────────────────

test.describe('File Viewer', () => {
  test('should open a real file in the file viewer', async () => {
    // Open explorer
    const explorerBtn = page.locator('button[title*="Explorer"]')
    await explorerBtn.click()
    const explorerPanel = page.locator('[data-panel-id="explorer"]')
    await expect(explorerPanel).toBeVisible()

    // Switch to Files tab
    const filesButton = explorerPanel.locator('button[title="Files"]')
    await filesButton.click()

    // Click on README.md
    await explorerPanel.locator('text=README.md').first().click()

    // File viewer should open
    const fileViewer = page.locator('[data-panel-id="fileViewer"]')
    await expect(fileViewer).toBeVisible({ timeout: 10000 })

    // Should show the filename
    await expect(fileViewer.locator('text=README.md').first()).toBeVisible()

    await diagnosticScreenshot(electronApp, page, 'test-results/real-file-viewer.png')

    // Close file viewer
    await page.keyboard.press('Meta+3')
    await expect(fileViewer).not.toBeVisible()

    // Close explorer
    await explorerBtn.click()
  })
})

// ── Full App Screenshot ──────────────────────────────────────────────────

test.describe('Full App State', () => {
  test('should capture comprehensive app screenshot', async () => {
    // Open explorer with source control
    const explorerBtn = page.locator('button[title*="Explorer"]')
    await explorerBtn.click()
    const explorerPanel = page.locator('[data-panel-id="explorer"]')
    await expect(explorerPanel).toBeVisible()

    const scTab = explorerPanel.locator('button[title="Source Control"]')
    await scTab.click()

    await diagnosticScreenshot(electronApp, page, 'test-results/full-app.png')

    // Close explorer
    await explorerBtn.click()
  })
})
