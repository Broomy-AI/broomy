import { test, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Output directory for screenshots
const SCREENSHOT_DIR = path.join(__dirname, '..', 'website', 'public', 'screenshots')

let electronApp: ElectronApplication
let page: Page

// Increase timeout for the entire test suite - app startup takes a while
test.setTimeout(120000)

test.beforeAll(async () => {
  const mainJs = path.join(__dirname, '..', 'out', 'main', 'index.js')

  // Launch Electron app in screenshot mode
  electronApp = await electron.launch({
    args: [mainJs],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      E2E_TEST: 'true',
      SCREENSHOT_MODE: 'true',
      E2E_HEADLESS: 'false',
    },
  })

  // Get the first window
  page = await electronApp.firstWindow()

  // Set viewport size for consistent screenshots
  await page.setViewportSize({ width: 1400, height: 900 })

  // Wait for the app to be ready
  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector('#root > div', { timeout: 15000 })

  // Wait for terminals to initialize and fake claude scripts to output
  await page.waitForTimeout(8000)

  // Inject varied session states via the exposed Zustand store
  await page.evaluate(() => {
    const store = (window as Record<string, unknown>).__sessionStore as {
      getState: () => { sessions: Record<string, unknown>[] }
      setState: (state: Record<string, unknown>) => void
    }
    if (!store) return

    const sessions = store.getState().sessions
    store.setState({
      sessions: sessions.map((s: Record<string, unknown>, i: number) => {
        // Session 0 (backend-api): working (natural from fake-claude-screenshot.sh)
        if (i === 0) return { ...s, status: 'working', lastMessage: 'Updating src/middleware/auth.ts', branchStatus: 'in-progress' }
        // Session 1 (web-dashboard): idle+unread, pushed
        if (i === 1) return { ...s, status: 'idle', isUnread: true, lastMessage: 'Fixed dashboard render performance', branchStatus: 'pushed' }
        // Session 2 (mobile-app): working
        if (i === 2) return { ...s, status: 'working', lastMessage: 'Reading AndroidManifest.xml', branchStatus: 'in-progress' }
        // Session 3 (payments-svc): idle+unread, PR open
        if (i === 3) return { ...s, status: 'idle', isUnread: true, lastMessage: 'Stripe webhook handler complete', branchStatus: 'open', lastKnownPrNumber: 47 }
        // Session 4 (search-engine): idle, merged
        if (i === 4) return { ...s, status: 'idle', lastMessage: 'Vector search implementation done', branchStatus: 'merged', lastKnownPrNumber: 31 }
        // Session 5 (infra-config): working
        if (i === 5) return { ...s, status: 'working', lastMessage: 'Analyzing Kubernetes manifests', branchStatus: 'in-progress' }
        // Session 6 (docs-site): idle (no agent)
        if (i === 6) return { ...s, status: 'idle', branchStatus: 'in-progress' }
        // Session 7 (data-pipeline): idle+unread, pushed
        if (i === 7) return { ...s, status: 'idle', isUnread: true, lastMessage: 'Batch processing pipeline ready', branchStatus: 'pushed' }
        return s
      })
    })
  })

  // Let the UI update after state injection
  await page.waitForTimeout(500)
})

test.afterAll(async () => {
  if (electronApp) {
    await electronApp.close()
  }
})

// Max height for feature screenshots: 2/3 of hero height (900px)
const MAX_FEATURE_HEIGHT = 600

// Helper: screenshot an element, cropped to MAX_FEATURE_HEIGHT from the top
async function croppedElementScreenshot(
  pg: Page,
  locator: ReturnType<Page['locator']>,
  filePath: string,
) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Element not found for screenshot')
  const height = Math.min(box.height, MAX_FEATURE_HEIGHT)
  await pg.screenshot({
    path: filePath,
    type: 'png',
    clip: { x: box.x, y: box.y, width: box.width, height },
  })
}

// Use serial mode - screenshots depend on shared state
test.describe.serial('Screenshot Generation', () => {
  test('hero.png - Full app with sidebar, explorer, and terminal', async () => {
    // Open Explorer panel
    const explorerButton = page.locator('button:has-text("Explorer")')
    await explorerButton.click()
    await page.waitForTimeout(500)

    // Expand src directory in the file tree
    const srcFolder = page.locator('text=src').first()
    await srcFolder.click()
    await page.waitForTimeout(300)

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'hero.png'),
      type: 'png',
    })
  })

  test('sidebar.png - Cropped sidebar showing top sessions', async () => {
    const sidebar = page.locator('[data-panel-id="sidebar"]')
    await croppedElementScreenshot(page, sidebar, path.join(SCREENSHOT_DIR, 'sidebar.png'))
  })

  test('status.png - A few session cards showing varied states', async () => {
    // Capture a cluster of 4 sessions (index 1-4): PUSHED, working, PR OPEN, MERGED
    const cards = page.locator('[data-panel-id="sidebar"] .cursor-pointer')
    const firstCard = cards.nth(1) // web-dashboard (PUSHED)
    const lastCard = cards.nth(4)  // search-engine (MERGED)
    const firstBox = await firstCard.boundingBox()
    const lastBox = await lastCard.boundingBox()
    if (!firstBox || !lastBox) throw new Error('Session cards not found')

    // Region from top of first card to bottom of last card, with some padding
    const padding = 4
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'status.png'),
      type: 'png',
      clip: {
        x: firstBox.x - padding,
        y: firstBox.y - padding,
        width: firstBox.width + padding * 2,
        height: (lastBox.y + lastBox.height) - firstBox.y + padding * 2,
      },
    })
  })

  test('review.png - ReviewPanel with fake review data, cropped', async () => {
    // Enable review panel on payments-svc session (index 3, id '4')
    await page.evaluate(() => {
      const store = (window as Record<string, unknown>).__sessionStore as {
        getState: () => { sessions: Record<string, unknown>[] }
        setState: (state: Record<string, unknown>) => void
      }
      if (!store) return

      const sessions = store.getState().sessions
      store.setState({
        sessions: sessions.map((s: Record<string, unknown>, i: number) => {
          if (i === 3) {
            const pv = (s.panelVisibility || {}) as Record<string, boolean>
            return {
              ...s,
              panelVisibility: { ...pv, review: true },
              prTitle: 'Add JWT authentication with session management',
              prNumber: 47,
            }
          }
          return s
        })
      })
    })

    // Click on payments-svc to make it the active session
    const paymentsSession = page.locator('.cursor-pointer:has-text("payments-svc")')
    await paymentsSession.click()
    await page.waitForTimeout(1000)

    // Wait for ReviewPanel to load the mock data
    const reviewPanel = page.locator('[data-panel-id="review"]')
    await reviewPanel.waitFor({ state: 'visible', timeout: 10000 })
    await page.waitForTimeout(1000)

    await croppedElementScreenshot(page, reviewPanel, path.join(SCREENSHOT_DIR, 'review.png'))
  })

  test('explorer.png - Explorer with source control tab, cropped', async () => {
    // Make sure explorer is open
    const explorerButton = page.locator('button:has-text("Explorer")')
    const explorerClasses = await explorerButton.getAttribute('class').catch(() => '')
    if (!explorerClasses?.includes('bg-accent')) {
      await explorerButton.click()
      await page.waitForTimeout(300)
    }

    // Switch to source control via store
    await page.evaluate(() => {
      const store = (window as Record<string, unknown>).__sessionStore as {
        getState: () => { activeSessionId: string; setExplorerFilter: (id: string, filter: string) => void }
      }
      if (!store) return
      const state = store.getState()
      state.setExplorerFilter(state.activeSessionId, 'source-control')
    })
    await page.waitForTimeout(500)

    const explorer = page.locator('[data-panel-id="explorer"]')
    await croppedElementScreenshot(page, explorer, path.join(SCREENSHOT_DIR, 'explorer.png'))
  })
})
