import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'
import { dockerArgs } from './electron-launch-args'
import { resumeActiveSession } from './features/_shared/resume-helpers'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let electronApp: ElectronApplication
let page: Page

test.beforeAll(async () => {
  electronApp = await electron.launch({
    args: [...dockerArgs, path.join(__dirname, '..', 'out', 'main', 'index.js')],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      E2E_TEST: 'true',
      E2E_HEADLESS: process.env.E2E_HEADLESS ?? 'true',
    },
  })
  page = await electronApp.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector('#root > div', { timeout: 10000 })
  // Wait for sessions to load
  await page.waitForSelector('.cursor-pointer', { timeout: 10000 })
  // The active session starts paused (no agent, no terminal). Resume it so
  // these tests have something running to interact with.
  await resumeActiveSession(page)
})

test.afterAll(async () => {
  if (electronApp) await electronApp.close()
})

// Helper: check if a tab name span has the active underline
async function isTabActive(tabText: string): Promise<boolean> {
  // Active tabs have a span with border-b-2 border-accent
  const span = page.locator(`span.truncate:has-text("${tabText}"):visible`).first()
  const classes = await span.getAttribute('class')
  return classes?.includes('border-accent') ?? false
}

/**
 * Get terminal buffer content from the buffer registry.
 * xterm 6.0 renders via canvas, so DOM queries can't read terminal text.
 */
async function getTerminalContent(p: Page, type: 'agent' | 'user'): Promise<string> {
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

test.describe('Terminal Tabs', () => {
  test('should show Agent tab as active by default', async () => {
    // The Agent tab should be visible
    const agentTab = page.locator('div.cursor-pointer:has-text("Agent"):visible').first()
    await expect(agentTab).toBeVisible()

    // The Agent tab's name span should have the active indicator
    expect(await isTabActive('Agent')).toBe(true)
  })

  test('should show add tab button', async () => {
    const addBtn = page.locator('button[title="New terminal tab"]:visible')
    await expect(addBtn).toBeVisible()
  })

  test('should add a user terminal tab and show shell prompt', async () => {
    const addBtn = page.locator('button[title="New terminal tab"]:visible')
    await addBtn.click()

    // Wait for user terminal shell prompt to appear in the buffer
    await expect.poll(() => getTerminalContent(page, 'user'), { timeout: 10000 })
      .toContain('test-shell$')

    // The new tab should be active (Agent tab should not be active)
    expect(await isTabActive('Agent')).toBe(false)
  })

  test('should switch back to Agent tab', async () => {
    // Click on Agent tab
    const agentTab = page.locator('div.cursor-pointer:has-text("Agent"):visible').first()
    await agentTab.click()

    // Agent tab should be active
    await expect.poll(() => isTabActive('Agent')).toBe(true)

    // Terminal should show fake claude output
    await expect.poll(() => getTerminalContent(page, 'agent'), { timeout: 5000 })
      .toContain('FAKE_CLAUDE_READY')
  })

  test('should close a user terminal tab', async () => {
    // Scope to the terminal tablist to avoid matching sidebar session items
    const tablist = page.locator('[role="tablist"][aria-label="Terminal tabs"]')
    const userTab = tablist.locator('[role="tab"]').filter({ hasNotText: 'Agent' }).first()
    await userTab.hover()

    // Click the close button
    const closeBtn = userTab.locator('button').first()
    await closeBtn.click()

    // Should fall back to Agent tab (which becomes active)
    await expect.poll(() => isTabActive('Agent'), { timeout: 10000 }).toBe(true)
  })

  // ── #190: the agent exit banner must go away on Restart Agent, and × must dismiss it ──

  /** The active session's agent PTY id (set once its create resolves). */
  async function activeAgentPtyId(): Promise<string | undefined> {
    return page.evaluate(() => {
      const store = (window as unknown as {
        __sessionStore: { getState: () => { activeSessionId: string | null; sessions: { id: string; agentPtyId?: string }[] } }
      }).__sessionStore
      const state = store.getState()
      return state.sessions.find((s) => s.id === state.activeSessionId)?.agentPtyId
    })
  }

  /** Wait for a restarted agent: a new PTY id, and the fake agent's ready marker in its fresh buffer. */
  async function expectRestartedAgent(previousId: string): Promise<string> {
    await expect.poll(async () => {
      const id = await activeAgentPtyId()
      return !!id && id !== previousId
    }, { timeout: 10000 }).toBe(true)
    await expect.poll(() => getTerminalContent(page, 'agent'), { timeout: 10000 }).toContain('FAKE_CLAUDE_READY')
    return (await activeAgentPtyId())!
  }

  /** Deliver an exit for `ptyId` through the real preload listener, as the main process does when a PTY ends. */
  async function simulateAgentExit(ptyId: string) {
    await electronApp.evaluate(({ BrowserWindow }, id) => {
      BrowserWindow.getAllWindows()[0].webContents.send(`pty:exit:${id}`, 0)
    }, ptyId)
  }

  test('the agent exit banner goes away on Restart Agent and can be dismissed (#190)', async () => {
    const exitBanner = page.locator('[data-agent-exit-banner]:visible')
    await expect.poll(async () => !!(await activeAgentPtyId())).toBe(true)
    const firstId = (await activeAgentPtyId())!

    await simulateAgentExit(firstId)
    await expect(exitBanner).toContainText('Agent process has exited.')
    await exitBanner.getByRole('button', { name: 'Restart Agent' }).click()
    await expect(exitBanner).toHaveCount(0)
    const secondId = await expectRestartedAgent(firstId)
    await expect(exitBanner).toHaveCount(0)

    await simulateAgentExit(secondId)
    await expect(exitBanner).toBeVisible()
    await exitBanner.getByRole('button', { name: 'Dismiss' }).click()
    await expect(exitBanner).toHaveCount(0)

    // Still gone after later renders: open a temporary tab, come back to Agent, close that tab
    const userTabs = page.locator('[role="tablist"][aria-label="Terminal tabs"]').locator('[role="tab"]').filter({ hasNotText: 'Agent' })
    const userTabCount = await userTabs.count()
    await page.locator('button[title="New terminal tab"]:visible').click()
    await expect(userTabs).toHaveCount(userTabCount + 1)
    await expect.poll(() => isTabActive('Agent')).toBe(false)
    await page.locator('div.cursor-pointer:has-text("Agent"):visible').first().click()
    await expect.poll(() => isTabActive('Agent')).toBe(true)
    await expect(exitBanner).toHaveCount(0)
    const tempTab = userTabs.last()
    await tempTab.hover()
    await tempTab.getByRole('button', { name: 'Close tab' }).click()
    await expect(userTabs).toHaveCount(userTabCount)
    await expect(exitBanner).toHaveCount(0)

    // Leave a live agent behind (Agent > Restart Agent, as the menu sends it)
    await page.evaluate(() => { window.dispatchEvent(new Event('agent:restart')) })
    await expectRestartedAgent(secondId)
  })
})
