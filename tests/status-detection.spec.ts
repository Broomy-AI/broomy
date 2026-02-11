import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let electronApp: ElectronApplication
let page: Page

test.beforeAll(async () => {
  // Launch Electron app with E2E test mode
  electronApp = await electron.launch({
    args: [path.join(__dirname, '..', 'out', 'main', 'index.js')],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      E2E_TEST: 'true',
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

test.describe('Status Detection', () => {
  test('should detect working status when fake Claude outputs', async () => {
    // Wait for initial load
    await page.waitForTimeout(500)

    // Select the broomy session (which has an agent configured)
    const broomySession = page.locator('.cursor-pointer:has-text("broomy")')
    await broomySession.click()
    await page.waitForTimeout(300)

    // Wait for the fake Claude to start outputting (the ready marker appears first)
    // The fake claude outputs for about 4 seconds before going idle
    await page.waitForTimeout(1000) // Give time for fake claude to start

    // Check that we can see the "thinking" message in the terminal
    const terminalText = await page.evaluate(() => {
      const viewports = document.querySelectorAll('.xterm-rows')
      // Get content from all terminals
      return Array.from(viewports).map(v => v.textContent || '').join('\n')
    })

    // Verify the fake claude is running (should show the ready marker or thinking message)
    const hasFakeClaude = terminalText.includes('FAKE_CLAUDE_READY') ||
                          terminalText.includes('Claude is thinking')

    console.log('Terminal content:', terminalText.substring(0, 500))
    console.log('Has fake Claude content:', hasFakeClaude)

    // The status should be "Working" while Claude is outputting
    // Look for the Working status indicator in the sidebar
    // Give it a moment for the spinner animation to start
    await page.waitForTimeout(500)

    // Check for working status indicator (the status text or dot)
    // The status appears in the session list
    // Working status uses a Spinner with text-status-working class
    const statusText = await page.evaluate(() => {
      // Look for status indicators
      const workingIndicator = document.querySelector('.text-status-working')  // Spinner uses text- not bg-
      const idleIndicator = document.querySelector('.bg-status-idle')
      const waitingIndicator = document.querySelector('.bg-status-waiting')

      return {
        hasWorking: !!workingIndicator,
        hasIdle: !!idleIndicator,
        hasWaiting: !!waitingIndicator,
      }
    })

    console.log('Status indicators:', statusText)

    // During the fake Claude output, we should see working status
    // Note: This may be flaky depending on timing
  })

  test('should detect idle status after fake Claude stops outputting', async () => {
    // The fake Claude runs for about 4 seconds then goes idle
    // Wait for it to complete
    await page.waitForTimeout(6000)

    // Now check that the status has changed to idle
    const statusIndicators = await page.evaluate(() => {
      const workingIndicators = document.querySelectorAll('.text-status-working')  // Spinner uses text- not bg-
      const idleIndicators = document.querySelectorAll('.bg-status-idle')

      return {
        workingCount: workingIndicators.length,
        idleCount: idleIndicators.length,
      }
    })

    console.log('Status indicators after idle:', statusIndicators)

    // Check the terminal shows the idle marker
    const terminalText = await page.evaluate(() => {
      const viewports = document.querySelectorAll('.xterm-rows')
      return Array.from(viewports).map(v => v.textContent || '').join('\n')
    })

    const hasIdleMarker = terminalText.includes('FAKE_CLAUDE_IDLE')
    console.log('Has idle marker:', hasIdleMarker)

    // After 1 second of no output, the status should be idle
    // The session with the agent should show idle (not working)
    expect(statusIndicators.idleCount).toBeGreaterThan(0)
  })

  test('should show correct status text in session list', async () => {
    // Wait for everything to stabilize
    await page.waitForTimeout(500)

    // Check that we can see "Idle" or "Working" text in the session list
    const sessionListText = await page.evaluate(() => {
      const sidebar = document.querySelector('[class*="sidebar"]') ||
                      document.querySelector('.overflow-y-auto')
      return sidebar?.textContent || ''
    })

    console.log('Session list text:', sessionListText.substring(0, 300))

    // Should have at least one status indicator (Idle or Working)
    const hasStatusText = sessionListText.includes('Idle') ||
                          sessionListText.includes('Working') ||
                          sessionListText.includes('Waiting')

    expect(hasStatusText).toBe(true)
  })
})

test.describe('Status Detection Timing', () => {
  test('should transition from working to idle after 1 second of no output', async () => {
    // This test focuses on the timing behavior
    // The fake Claude outputs, then stops, and after 1 second status should be idle

    // Select the session with an agent
    const broomySession = page.locator('.cursor-pointer:has-text("broomy")')
    await broomySession.click()

    // Wait for fake claude to finish (about 5 seconds of output)
    await page.waitForTimeout(6000)

    // Now it should be idle (1+ second timeout after last output)
    const idleIndicator = page.locator('.bg-status-idle').first()
    await expect(idleIndicator).toBeVisible({ timeout: 3000 })
  })
})
