import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'
import { dockerArgs } from './electron-launch-args'

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
    // Find and hover the non-Agent tab to reveal close button
    // The user tab is the one that is NOT "Agent"
    const userTab = page.locator('div.cursor-pointer:visible').filter({ hasNotText: 'Agent' }).filter({ has: page.locator('span.truncate') }).first()
    await userTab.hover()

    // Click the close button
    const closeBtn = userTab.locator('button').first()
    await closeBtn.click()

    // Should fall back to Agent tab (which becomes active)
    await expect.poll(() => isTabActive('Agent')).toBe(true)
  })
})
