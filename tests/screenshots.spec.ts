import { test, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'
import { existsSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Output directory for screenshots
const SCREENSHOT_DIR = path.join(__dirname, '..', 'website', 'public', 'screenshots')

let electronApp: ElectronApplication
let page: Page

// Increase timeout for the entire test suite - builds + app startup take a while
test.setTimeout(120000)

test.beforeAll(async () => {
  // Build the app if needed
  const mainJs = path.join(__dirname, '..', 'out', 'main', 'index.js')
  if (!existsSync(mainJs)) {
    execSync('pnpm build', { cwd: path.join(__dirname, '..'), stdio: 'inherit' })
  }

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

  test('sidebar.png - Session list with varied states', async () => {
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'sidebar.png'),
      type: 'png',
    })
  })

  test('status.png - Working session with terminal output', async () => {
    // Make sure session 0 (backend-api) is selected - it should be by default
    const backendSession = page.locator('.cursor-pointer:has-text("backend-api")')
    await backendSession.click()
    await page.waitForTimeout(300)

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'status.png'),
      type: 'png',
    })
  })

  test('explorer.png - Explorer with source control tab', async () => {
    // Make sure explorer is open
    const explorerButton = page.locator('button:has-text("Explorer")')
    const explorerClasses = await explorerButton.getAttribute('class').catch(() => '')
    if (!explorerClasses?.includes('bg-accent')) {
      await explorerButton.click()
      await page.waitForTimeout(300)
    }

    // Click on Source Control tab if available
    const sourceControlTab = page.locator('button:has-text("Source Control")').first()
    const hasSourceControl = await sourceControlTab.isVisible().catch(() => false)
    if (hasSourceControl) {
      await sourceControlTab.click()
      await page.waitForTimeout(300)
    }

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'explorer.png'),
      type: 'png',
    })
  })

  test('diff.png - File viewer in diff mode', async () => {
    // Open file viewer if not visible
    const fileViewerButton = page.locator('button:has-text("File Viewer")').first()
    const hasFileViewerButton = await fileViewerButton.isVisible().catch(() => false)
    if (hasFileViewerButton) {
      const classes = await fileViewerButton.getAttribute('class')
      if (!classes?.includes('bg-accent')) {
        await fileViewerButton.click()
        await page.waitForTimeout(300)
      }
    }

    // Click on a modified file in the explorer to open it
    const authFile = page.locator('text=auth.ts').first()
    const hasAuthFile = await authFile.isVisible().catch(() => false)
    if (hasAuthFile) {
      await authFile.click()
      await page.waitForTimeout(500)
    }

    // Try to switch to diff mode if there's a diff button
    const diffButton = page.locator('button:has-text("Diff")').first()
    const hasDiffButton = await diffButton.isVisible().catch(() => false)
    if (hasDiffButton) {
      await diffButton.click()
      await page.waitForTimeout(500)
    }

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'diff.png'),
      type: 'png',
    })
  })

  test('settings.png - Agent settings panel', async () => {
    // Close explorer first for a cleaner view
    const explorerButton = page.locator('button:has-text("Explorer")')
    const explorerClasses = await explorerButton.getAttribute('class').catch(() => '')
    if (explorerClasses?.includes('bg-accent')) {
      await explorerButton.click()
      await page.waitForTimeout(300)
    }

    // Close file viewer if open - button shows as "File" in toolbar
    const fileButton = page.locator('button:has-text("File")').first()
    const fileClasses = await fileButton.getAttribute('class').catch(() => '')
    if (fileClasses?.includes('bg-accent')) {
      await fileButton.click()
      await page.waitForTimeout(300)
    }

    // Open settings via keyboard shortcut (Cmd+6)
    await page.keyboard.press('Meta+6')
    await page.waitForTimeout(500)

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'settings.png'),
      type: 'png',
    })

    // Close settings
    await page.keyboard.press('Meta+6')
    await page.waitForTimeout(300)
  })
})
