import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let electronApp: ElectronApplication
let page: Page

/**
 * These tests reproduce the original failures from the first test run.
 * They use direct DOM manipulation (setting viewport.scrollTop) which
 * is what happens when something other than a wheel/touch/keyboard event
 * changes the scroll position (e.g., layout reflow, resize, xterm internal).
 *
 * The original bug: setting viewport.scrollTop = 0 had no effect because
 * the onRender auto-correct saw isFollowing=true and snapped back to bottom.
 */

async function getScrollState(page: Page) {
  return page.evaluate(() => {
    const viewport = document.querySelector('.xterm-viewport') as HTMLElement | null
    if (!viewport) return null
    return {
      scrollTop: viewport.scrollTop,
      scrollHeight: viewport.scrollHeight,
      clientHeight: viewport.clientHeight,
      isAtBottom: viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 5,
      hasScrollback: viewport.scrollHeight > viewport.clientHeight + 5,
    }
  })
}

async function getTerminalText(page: Page) {
  return page.evaluate(() => {
    const viewport = document.querySelector('.xterm-rows')
    return viewport?.textContent || ''
  })
}

async function scrollViewportTo(page: Page, scrollTop: number) {
  await page.evaluate((top) => {
    const viewport = document.querySelector('.xterm-viewport') as HTMLElement | null
    if (viewport) {
      viewport.scrollTop = top
    }
  }, scrollTop)
}

test.beforeAll(async () => {
  test.setTimeout(120000)

  const fakeClaude = path.join(__dirname, '..', 'scripts', 'fake-claude-bigplan.sh')
  electronApp = await electron.launch({
    args: [path.join(__dirname, '..', 'out', 'main', 'index.js')],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      E2E_TEST: 'true',
      E2E_HEADLESS: process.env.E2E_HEADLESS ?? 'true',
      FAKE_CLAUDE_SCRIPT: fakeClaude,
    },
  })

  page = await electronApp.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector('#root > div', { timeout: 10000 })
})

test.afterAll(async () => {
  if (electronApp) await electronApp.close()
})

test.describe('DOM Scroll Manipulation (original failure repro)', () => {
  test('setup: wait for plan output', async () => {
    const broomySession = page.locator('.cursor-pointer:has-text("broomy")')
    await broomySession.click()
    await page.waitForTimeout(6000)
    const text = await getTerminalText(page)
    expect(text).toContain('PLAN_OUTPUT_END')
  })

  test('should be at bottom after plan output', async () => {
    const state = await getScrollState(page)
    expect(state).not.toBeNull()
    expect(state!.hasScrollback).toBe(true)
    expect(state!.isAtBottom).toBe(true)
  })

  test('setting viewport.scrollTop = 0 should scroll to top', async () => {
    // This was the original failing test.
    // Before the fix: scrollTop stayed at 3330 because onRender snapped it back.
    await scrollViewportTo(page, 0)
    await page.waitForTimeout(500)

    const state = await getScrollState(page)
    console.log('After scrollTop=0:', JSON.stringify(state))
    expect(state!.scrollTop).toBeLessThan(5)
  })

  test('setting viewport.scrollTop = scrollHeight should scroll to bottom', async () => {
    const before = await getScrollState(page)
    await scrollViewportTo(page, before!.scrollHeight)
    await page.waitForTimeout(500)

    const state = await getScrollState(page)
    console.log('After scrollTop=scrollHeight:', JSON.stringify(state))
    expect(state!.isAtBottom).toBe(true)

    const text = await getTerminalText(page)
    expect(text).toContain('PLAN_OUTPUT_END')
  })

  test('scrollHeight should reflect all content', async () => {
    const state = await getScrollState(page)
    console.log('Final state:', JSON.stringify(state))

    // ~210 lines * ~15.6px = ~3276px minimum scrollHeight
    expect(state!.scrollHeight).toBeGreaterThan(2000)

    // Should be much larger than viewport
    const ratio = state!.scrollHeight / state!.clientHeight
    expect(ratio).toBeGreaterThan(3)
  })
})
