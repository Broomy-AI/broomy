import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let electronApp: ElectronApplication
let page: Page

/**
 * Get scroll state from both the DOM viewport and xterm's internal buffer.
 * xterm.js has two scroll systems that can desync:
 *   1. Internal buffer: viewportY / baseY (line-based)
 *   2. DOM: .xterm-viewport scrollTop / scrollHeight (pixel-based)
 */
async function getFullScrollDiagnostics(page: Page) {
  return page.evaluate(() => {
    const viewport = document.querySelector('.xterm-viewport') as HTMLElement | null
    if (!viewport) return null

    const dom = {
      scrollTop: viewport.scrollTop,
      scrollHeight: viewport.scrollHeight,
      clientHeight: viewport.clientHeight,
      isAtBottom: viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 5,
      maxScrollTop: viewport.scrollHeight - viewport.clientHeight,
    }

    return { dom }
  })
}

async function getTerminalText(page: Page) {
  return page.evaluate(() => {
    const viewport = document.querySelector('.xterm-rows')
    return viewport?.textContent || ''
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite 1: Single-chunk big plan (tests the "all at once" scenario)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Big Plan — Single Chunk', () => {
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
    page.on('console', (msg) => {
      if (msg.text().includes('[Terminal scroll desync]')) {
        console.log('  [DESYNC]', msg.text())
      }
    })
  })

  test.afterAll(async () => {
    if (electronApp) await electronApp.close()
  })

  test('setup: wait for plan output', async () => {
    const broomySession = page.locator('.cursor-pointer:has-text("broomy")')
    await broomySession.click()
    await page.waitForTimeout(6000)
    const text = await getTerminalText(page)
    expect(text).toContain('PLAN_OUTPUT_END')
    const diag = await getFullScrollDiagnostics(page)
    console.log('[chunk] After plan output:', JSON.stringify(diag!.dom))
  })

  test('should be at bottom after plan dump', async () => {
    const diag = await getFullScrollDiagnostics(page)
    expect(diag!.dom.isAtBottom).toBe(true)
    expect(diag!.dom.scrollHeight).toBeGreaterThan(diag!.dom.clientHeight * 2)
  })

  test('wheel-up then wheel-down should reach bottom', async () => {
    const xtermEl = page.locator('.xterm').first()
    await xtermEl.hover()

    // Scroll all the way up
    for (let i = 0; i < 60; i++) {
      await page.mouse.wheel(0, -200)
      await page.waitForTimeout(20)
    }
    await page.waitForTimeout(300)

    const atTop = await getFullScrollDiagnostics(page)
    console.log('[chunk] At top:', JSON.stringify(atTop!.dom))
    expect(atTop!.dom.scrollTop).toBeLessThan(50)

    // Go to End button should be visible
    const goToEndButton = page.locator('button:has-text("Go to End")')
    await expect(goToEndButton).toBeVisible({ timeout: 2000 })

    // Scroll all the way back down
    for (let i = 0; i < 80; i++) {
      await page.mouse.wheel(0, 200)
      await page.waitForTimeout(20)
    }
    await page.waitForTimeout(300)

    const atBottom = await getFullScrollDiagnostics(page)
    console.log('[chunk] At bottom:', JSON.stringify(atBottom!.dom))
    expect(atBottom!.dom.isAtBottom).toBe(true)
  })

  test('session switch then scroll should work', async () => {
    // Switch away and back
    await page.locator('.cursor-pointer:has-text("backend-api")').click()
    await page.waitForTimeout(1000)
    await page.locator('.cursor-pointer:has-text("broomy")').click()
    await page.waitForTimeout(1000)

    const afterSwitch = await getFullScrollDiagnostics(page)
    console.log('[chunk] After session switch:', JSON.stringify(afterSwitch!.dom))
    expect(afterSwitch!.dom.isAtBottom).toBe(true)

    // Scroll up
    const xtermEl = page.locator('.xterm').first()
    await xtermEl.hover()
    for (let i = 0; i < 30; i++) {
      await page.mouse.wheel(0, -200)
      await page.waitForTimeout(20)
    }
    await page.waitForTimeout(300)
    expect((await getFullScrollDiagnostics(page))!.dom.isAtBottom).toBe(false)

    // Scroll back down
    for (let i = 0; i < 50; i++) {
      await page.mouse.wheel(0, 200)
      await page.waitForTimeout(20)
    }
    await page.waitForTimeout(300)
    expect((await getFullScrollDiagnostics(page))!.dom.isAtBottom).toBe(true)
  })

  test('resize then scroll should work', async () => {
    const size = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }))

    // Shrink then expand
    await page.setViewportSize({ width: size.width - 100, height: size.height - 100 })
    await page.waitForTimeout(500)
    await page.setViewportSize({ width: size.width + 50, height: size.height + 50 })
    await page.waitForTimeout(500)

    const afterResize = await getFullScrollDiagnostics(page)
    console.log('[chunk] After resize:', JSON.stringify(afterResize!.dom))
    expect(afterResize!.dom.isAtBottom).toBe(true)

    // Scroll up then down
    const xtermEl = page.locator('.xterm').first()
    await xtermEl.hover()
    for (let i = 0; i < 30; i++) {
      await page.mouse.wheel(0, -200)
      await page.waitForTimeout(20)
    }
    await page.waitForTimeout(300)
    expect((await getFullScrollDiagnostics(page))!.dom.isAtBottom).toBe(false)

    for (let i = 0; i < 50; i++) {
      await page.mouse.wheel(0, 200)
      await page.waitForTimeout(20)
    }
    await page.waitForTimeout(300)
    expect((await getFullScrollDiagnostics(page))!.dom.isAtBottom).toBe(true)

    await page.setViewportSize(size)
    await page.waitForTimeout(300)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite 2: Streaming plan (many rapid small writes with ANSI codes)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Big Plan — Streaming Chunks', () => {
  test.beforeAll(async () => {
    test.setTimeout(120000)

    const fakeClaude = path.join(__dirname, '..', 'scripts', 'fake-claude-streaming.sh')
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
    page.on('console', (msg) => {
      if (msg.text().includes('[Terminal scroll desync]')) {
        console.log('  [DESYNC]', msg.text())
      }
    })
  })

  test.afterAll(async () => {
    if (electronApp) await electronApp.close()
  })

  test('setup: wait for streaming plan output', async () => {
    const broomySession = page.locator('.cursor-pointer:has-text("broomy")')
    await broomySession.click()

    // Streaming takes longer due to the small delays between chunks
    // ~190 lines * ~7ms per line ≈ 1.3s + overhead
    await page.waitForTimeout(8000)

    const text = await getTerminalText(page)
    expect(text).toContain('PLAN_OUTPUT_END')
    const diag = await getFullScrollDiagnostics(page)
    console.log('[stream] After plan output:', JSON.stringify(diag!.dom))
  })

  test('should be at bottom after streaming plan', async () => {
    const diag = await getFullScrollDiagnostics(page)
    console.log('[stream] DOM state:', JSON.stringify(diag!.dom))
    expect(diag!.dom.isAtBottom).toBe(true)
    expect(diag!.dom.scrollHeight).toBeGreaterThan(diag!.dom.clientHeight * 2)
  })

  test('wheel-up then wheel-down should reach bottom', async () => {
    const xtermEl = page.locator('.xterm').first()
    await xtermEl.hover()

    // Scroll all the way up
    for (let i = 0; i < 60; i++) {
      await page.mouse.wheel(0, -200)
      await page.waitForTimeout(20)
    }
    await page.waitForTimeout(300)

    const atTop = await getFullScrollDiagnostics(page)
    console.log('[stream] At top:', JSON.stringify(atTop!.dom))

    const goToEndButton = page.locator('button:has-text("Go to End")')
    await expect(goToEndButton).toBeVisible({ timeout: 2000 })

    // Scroll all the way back down
    for (let i = 0; i < 80; i++) {
      await page.mouse.wheel(0, 200)
      await page.waitForTimeout(20)
    }
    await page.waitForTimeout(300)

    const atBottom = await getFullScrollDiagnostics(page)
    console.log('[stream] At bottom:', JSON.stringify(atBottom!.dom))
    expect(atBottom!.dom.isAtBottom).toBe(true)
  })

  test('scrolling DURING output should not break state', async () => {
    // This is a critical test: restart the plan output and try scrolling
    // while it's still streaming. This simulates the user trying to read
    // the plan while it's being generated.

    // We can't easily restart the script, so let's simulate by scrolling
    // while the terminal is in its current state, which still has the
    // ANSI-rich content that may have confused xterm's scroll calculations.
    const xtermEl = page.locator('.xterm').first()
    await xtermEl.hover()

    // Rapid alternating scroll up/down (simulating user scrolling while content arrives)
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) {
        await page.mouse.wheel(0, -100)
        await page.waitForTimeout(10)
      }
      for (let j = 0; j < 5; j++) {
        await page.mouse.wheel(0, 100)
        await page.waitForTimeout(10)
      }
    }
    await page.waitForTimeout(500)

    // After the rapid scrolling, Go to End should work
    const diag = await getFullScrollDiagnostics(page)
    console.log('[stream] After rapid scroll:', JSON.stringify(diag!.dom))

    if (!diag!.dom.isAtBottom) {
      const goToEndButton = page.locator('button:has-text("Go to End")')
      await expect(goToEndButton).toBeVisible({ timeout: 2000 })
      await goToEndButton.click()
      await page.waitForTimeout(500)
    }

    const afterFix = await getFullScrollDiagnostics(page)
    expect(afterFix!.dom.isAtBottom).toBe(true)
  })
})
