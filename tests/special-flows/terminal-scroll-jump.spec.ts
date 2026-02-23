/**
 * Terminal Scroll Jump Tests
 *
 * These tests reproduce the scroll-jump bug that occurs with touchpad-style
 * scrolling shortly after large output completes. The key differences from
 * the existing tests (which pass fine) are:
 *
 *   1. Scrolling starts sooner after output (200ms vs 6+ seconds)
 *   2. Scroll events use smaller, more frequent deltas (deltaY=-40 @ 15ms)
 *      to simulate real touchpad behavior, vs large deltas (-200px @ 20ms)
 *
 * Expected: these tests FAIL, reproducing the bug before we attempt a fix.
 */
import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let electronApp: ElectronApplication
let page: Page

// ── Helpers ──────────────────────────────────────────────────────────────────

interface ScrollDiag {
  dom: {
    scrollTop: number
    scrollHeight: number
    clientHeight: number
    isAtBottom: boolean
    maxScrollTop: number
  }
}

async function getScrollDiag(p: Page): Promise<ScrollDiag | null> {
  return p.evaluate(() => {
    const viewport = document.querySelector('.xterm-viewport') as HTMLElement | null
    if (!viewport) return null
    return {
      dom: {
        scrollTop: viewport.scrollTop,
        scrollHeight: viewport.scrollHeight,
        clientHeight: viewport.clientHeight,
        isAtBottom:
          viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 5,
        maxScrollTop: viewport.scrollHeight - viewport.clientHeight,
      },
    }
  })
}

async function getTerminalText(p: Page): Promise<string> {
  return p.evaluate(() => {
    const rows = document.querySelector('.xterm-rows')
    return rows?.textContent || ''
  })
}

/**
 * Send a burst of touchpad-like wheel events.
 * Real touchpads fire many small deltas rapidly (~15ms apart, deltaY ≈ 30–60).
 */
async function touchpadScroll(
  p: Page,
  deltaY: number,
  count: number,
  intervalMs = 15,
) {
  for (let i = 0; i < count; i++) {
    await p.mouse.wheel(0, deltaY)
    await p.waitForTimeout(intervalMs)
  }
}

// ── Test Suite ───────────────────────────────────────────────────────────────

test.describe('Touchpad Scroll Jump', () => {
  test.beforeAll(async () => {
    test.setTimeout(120000)

    const fakeClaude = path.join(
      __dirname,
      '..',
      'scripts',
      'fake-claude-bigplan.sh',
    )
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

    // Log desync messages for debugging
    page.on('console', (msg) => {
      const t = msg.text()
      if (
        t.includes('[Terminal scroll') ||
        t.includes('[DESYNC]') ||
        t.includes('[scroll')
      ) {
        console.log('  [CONSOLE]', t)
      }
    })
  })

  test.afterAll(async () => {
    if (electronApp) await electronApp.close()
  })

  // ── Setup: wait for output to finish ──────────────────────────────────

  test('setup: wait for big plan output', async () => {
    const broomySession = page.locator('.cursor-pointer:has-text("broomy")')
    await broomySession.click()

    // Wait for the plan output to complete
    await page.waitForTimeout(6000)
    const text = await getTerminalText(page)
    expect(text).toContain('PLAN_OUTPUT_END')

    const diag = await getScrollDiag(page)
    console.log('[setup] After plan output:', JSON.stringify(diag?.dom))
    expect(diag!.dom.isAtBottom).toBe(true)
  })

  // ── Test 1: Detect scroll position jumps ──────────────────────────────

  test('touchpad scroll up should not produce discontinuous jumps', async () => {
    // Start from bottom
    const goToEnd = page.locator('button:has-text("Go to End")')
    if (await goToEnd.isVisible()) {
      await goToEnd.click()
      await page.waitForTimeout(300)
    }

    const beforeScroll = await getScrollDiag(page)
    expect(beforeScroll!.dom.isAtBottom).toBe(true)
    console.log('[jump] Before scroll:', JSON.stringify(beforeScroll?.dom))

    // Only wait 200ms — within the 500ms sync-check window.
    // This is the critical timing: real users start scrolling almost
    // immediately, not 6 seconds later.
    await page.waitForTimeout(200)

    const xtermEl = page.locator('.xterm').first()
    await xtermEl.hover()

    // Scroll up with touchpad-like events and record scrollTop every 5 events
    const scrollPositions: number[] = []
    const batchSize = 5
    const totalEvents = 40

    for (let batch = 0; batch < totalEvents / batchSize; batch++) {
      await touchpadScroll(page, -40, batchSize, 15)

      const diag = await getScrollDiag(page)
      if (diag) {
        scrollPositions.push(diag.dom.scrollTop)
      }
    }

    console.log('[jump] Scroll positions after each batch:', scrollPositions)

    // Calculate deltas between batches
    const deltas: number[] = []
    for (let i = 1; i < scrollPositions.length; i++) {
      deltas.push(Math.abs(scrollPositions[i] - scrollPositions[i - 1]))
    }
    console.log('[jump] Deltas between batches:', deltas)

    // Filter out zero deltas (scroll might not have moved at start/end)
    const nonZeroDeltas = deltas.filter((d) => d > 0)

    if (nonZeroDeltas.length >= 2) {
      const avgDelta =
        nonZeroDeltas.reduce((a, b) => a + b, 0) / nonZeroDeltas.length
      const maxDelta = Math.max(...nonZeroDeltas)
      console.log(
        `[jump] avg delta: ${avgDelta.toFixed(1)}, max delta: ${maxDelta.toFixed(1)}, ratio: ${(maxDelta / avgDelta).toFixed(2)}`,
      )

      // A jump > 3x the average movement indicates a discontinuity.
      // Normal touchpad scrolling should be smooth and consistent.
      expect(maxDelta).toBeLessThanOrEqual(
        avgDelta * 3,
      )
    }

    // Sanity: we should have scrolled away from the bottom
    const afterScroll = await getScrollDiag(page)
    console.log('[jump] After scroll up:', JSON.stringify(afterScroll?.dom))
    expect(afterScroll!.dom.isAtBottom).toBe(false)
  })

  // ── Test 2: Detect "can't scroll back down" (stuck scroll) ────────────

  test('should be able to scroll back down to bottom after scrolling up', async () => {
    // We're already scrolled up from the previous test.
    const beforeDown = await getScrollDiag(page)
    console.log('[stuck] Before scroll down:', JSON.stringify(beforeDown?.dom))
    expect(beforeDown!.dom.isAtBottom).toBe(false)

    const xtermEl = page.locator('.xterm').first()
    await xtermEl.hover()

    // Scroll down with touchpad-like events
    await touchpadScroll(page, 40, 60, 15)
    await page.waitForTimeout(300)

    const afterSmallScroll = await getScrollDiag(page)
    console.log(
      '[stuck] After 60 small scroll-downs:',
      JSON.stringify(afterSmallScroll?.dom),
    )

    // If not at bottom, try harder with larger deltas
    if (!afterSmallScroll!.dom.isAtBottom) {
      await touchpadScroll(page, 200, 40, 20)
      await page.waitForTimeout(300)
    }

    const finalState = await getScrollDiag(page)
    console.log('[stuck] Final state:', JSON.stringify(finalState?.dom))

    // The scroll MUST reach the bottom. If it doesn't, the user is stuck.
    expect(finalState!.dom.isAtBottom).toBe(true)
  })

  // ── Test 3: "Go to End" button visibility and function ────────────────

  test('Go to End button should appear when scrolled away and work when clicked', async () => {
    // Ensure we start at bottom
    const goToEnd = page.locator('button:has-text("Go to End")')
    if (await goToEnd.isVisible()) {
      await goToEnd.click()
      await page.waitForTimeout(300)
    }

    const atBottom = await getScrollDiag(page)
    expect(atBottom!.dom.isAtBottom).toBe(true)

    // Scroll up significantly
    const xtermEl = page.locator('.xterm').first()
    await xtermEl.hover()
    await touchpadScroll(page, -40, 30, 15)
    await page.waitForTimeout(300)

    const afterUp = await getScrollDiag(page)
    console.log('[gotoend] After scroll up:', JSON.stringify(afterUp?.dom))
    expect(afterUp!.dom.isAtBottom).toBe(false)

    // "Go to End" button should be visible
    await expect(goToEnd).toBeVisible({ timeout: 2000 })

    // Click it
    await goToEnd.click()
    await page.waitForTimeout(500)

    // Should now be at bottom
    const afterClick = await getScrollDiag(page)
    console.log('[gotoend] After click:', JSON.stringify(afterClick?.dom))
    expect(afterClick!.dom.isAtBottom).toBe(true)

    // Button should be hidden when at bottom
    await expect(goToEnd).not.toBeVisible({ timeout: 2000 })
  })
})
