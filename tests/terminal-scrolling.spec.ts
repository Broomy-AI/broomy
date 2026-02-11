import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let electronApp: ElectronApplication
let page: Page

// Helper to get scroll state of the agent terminal's xterm viewport
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

// Helper to get terminal text content
async function getTerminalText(page: Page) {
  return page.evaluate(() => {
    const viewport = document.querySelector('.xterm-rows')
    return viewport?.textContent || ''
  })
}

test.beforeAll(async () => {
  // Use the fake-claude-plan script that outputs a large block of text
  const fakeClaude = path.join(__dirname, '..', 'scripts', 'fake-claude-plan.sh')

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
  if (electronApp) {
    await electronApp.close()
  }
})

test.describe('Terminal Scrolling after Large Output', () => {
  test('should be at the bottom after plan output completes', async () => {
    // Select the broomy session (has agent)
    const broomySession = page.locator('.cursor-pointer:has-text("broomy")')
    await broomySession.click()

    // Wait for the fake-claude-plan to finish outputting
    // The script: 0.5s init + 0.5s pause + ~0.1s plan + 0.3s pause = ~1.5s
    // Give extra time for PTY data to arrive and xterm to process
    await page.waitForTimeout(4000)

    // Verify plan output arrived
    const text = await getTerminalText(page)
    expect(text).toContain('PLAN_OUTPUT_END')

    // After the large plan output, terminal should be at the bottom
    const scrollState = await getScrollState(page)
    expect(scrollState).not.toBeNull()
    expect(scrollState!.hasScrollback).toBe(true) // Content exceeds viewport
    expect(scrollState!.isAtBottom).toBe(true)     // Viewport is at the bottom
  })

  test('should allow scrolling up and show Go to End button', async () => {
    // Scroll up using wheel events on the terminal
    const xtermEl = page.locator('.xterm').first()
    await xtermEl.hover()

    // Scroll up multiple times
    for (let i = 0; i < 10; i++) {
      await page.mouse.wheel(0, -100)
      await page.waitForTimeout(50)
    }

    // Give time for scroll to settle and React to update
    await page.waitForTimeout(500)

    // Should NOT be at bottom now
    const scrollState = await getScrollState(page)
    expect(scrollState).not.toBeNull()
    expect(scrollState!.isAtBottom).toBe(false)

    // "Go to End" button should be visible
    const goToEndButton = page.locator('button:has-text("Go to End")')
    await expect(goToEndButton).toBeVisible({ timeout: 2000 })
  })

  test('should stay scrolled up when new output is not coming', async () => {
    // We're already scrolled up from previous test
    // Get current scroll position
    const scrollBefore = await getScrollState(page)
    expect(scrollBefore).not.toBeNull()
    expect(scrollBefore!.isAtBottom).toBe(false)

    // Wait a bit - terminal should stay in place (no auto-scroll)
    await page.waitForTimeout(1000)

    const scrollAfter = await getScrollState(page)
    expect(scrollAfter).not.toBeNull()
    expect(scrollAfter!.isAtBottom).toBe(false)

    // Scroll position should not have changed significantly
    expect(Math.abs(scrollAfter!.scrollTop - scrollBefore!.scrollTop)).toBeLessThan(5)
  })

  test('should return to bottom when Go to End is clicked', async () => {
    // Click the "Go to End" button
    const goToEndButton = page.locator('button:has-text("Go to End")')
    await expect(goToEndButton).toBeVisible({ timeout: 2000 })
    await goToEndButton.click()

    // Give time for scroll animation and React update
    await page.waitForTimeout(500)

    // Should be at the bottom now
    const scrollState = await getScrollState(page)
    expect(scrollState).not.toBeNull()
    expect(scrollState!.isAtBottom).toBe(true)

    // "Go to End" button should be hidden
    await expect(goToEndButton).not.toBeVisible({ timeout: 2000 })
  })

  test('should re-engage following when user scrolls to bottom manually', async () => {
    // First, scroll up
    const xtermEl = page.locator('.xterm').first()
    await xtermEl.hover()
    for (let i = 0; i < 10; i++) {
      await page.mouse.wheel(0, -100)
      await page.waitForTimeout(50)
    }
    await page.waitForTimeout(500)

    // Verify we're scrolled up
    let scrollState = await getScrollState(page)
    expect(scrollState!.isAtBottom).toBe(false)

    // Now scroll down a lot to reach the bottom
    for (let i = 0; i < 30; i++) {
      await page.mouse.wheel(0, 200)
      await page.waitForTimeout(50)
    }
    await page.waitForTimeout(500)

    // Should be at bottom
    scrollState = await getScrollState(page)
    expect(scrollState!.isAtBottom).toBe(true)

    // "Go to End" button should be hidden
    const goToEndButton = page.locator('button:has-text("Go to End")')
    await expect(goToEndButton).not.toBeVisible({ timeout: 2000 })
  })

  test('should not lose scroll position on window resize', async () => {
    // First, scroll up to a specific position
    const xtermEl = page.locator('.xterm').first()
    await xtermEl.hover()
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, -100)
      await page.waitForTimeout(50)
    }
    await page.waitForTimeout(500)

    // Verify we're scrolled up
    let scrollState = await getScrollState(page)
    expect(scrollState!.isAtBottom).toBe(false)
    const scrollTopBefore = scrollState!.scrollTop

    // Resize the window slightly
    const size = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }))

    await page.setViewportSize({
      width: size.width - 50,
      height: size.height - 50,
    })
    await page.waitForTimeout(500)

    // After resize, should NOT have jumped to bottom (we were scrolled up)
    scrollState = await getScrollState(page)
    expect(scrollState!.isAtBottom).toBe(false)

    // Restore window size
    await page.setViewportSize({
      width: size.width,
      height: size.height,
    })
    await page.waitForTimeout(300)
  })
})
