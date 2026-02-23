/**
 * Feature Documentation: Push Progress Indicator
 *
 * Demonstrates that long-running git operations (sync, commit, push) show
 * a "working" spinner on the session card instead of staying idle. The
 * spinner is driven by periodically calling updateAgentMonitor during the
 * operation and clearing when it finishes.
 *
 * Run with: pnpm test:feature-docs push-progress
 */
import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { screenshotRegion } from '../_shared/screenshot-helpers'
import { generateFeaturePage, generateIndex, FeatureStep } from '../_shared/template'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const FEATURE_DIR = __dirname
const SCREENSHOTS = path.join(FEATURE_DIR, 'screenshots')
const FEATURES_ROOT = path.join(__dirname, '..')

let electronApp: ElectronApplication
let page: Page
const steps: FeatureStep[] = []

test.setTimeout(60000)

/** Set the explorer panel to the source-control tab */
async function openSourceControl() {
  // Ensure explorer panel is open
  const explorerButton = page.locator('[data-panel-id="explorer-toggle"], [title*="Explorer"]').first()
  if (await explorerButton.isVisible()) {
    const cls = await explorerButton.getAttribute('class').catch(() => '')
    if (!cls?.includes('bg-accent')) {
      await explorerButton.click()
      await page.waitForTimeout(300)
    }
  }

  // Switch to source-control filter
  await page.evaluate(() => {
    const store = (window as Record<string, unknown>).__sessionStore as {
      getState: () => { activeSessionId: string; setExplorerFilter: (id: string, filter: string) => void }
    }
    if (!store) return
    const state = store.getState()
    state.setExplorerFilter(state.activeSessionId, 'source-control')
  })
  await page.waitForTimeout(500)
}

/** Set the active session's status via the store */
async function setSessionStatus(status: string) {
  await page.evaluate((s) => {
    const store = (window as Record<string, unknown>).__sessionStore as {
      getState: () => {
        activeSessionId: string
        updateAgentMonitor: (id: string, update: { status: string }) => void
      }
    }
    if (!store) return
    const state = store.getState()
    state.updateAgentMonitor(state.activeSessionId, { status: s })
  }, status)
  await page.waitForTimeout(300)
}

test.beforeAll(async () => {
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true })

  electronApp = await electron.launch({
    args: [path.join(__dirname, '..', '..', '..', 'out', 'main', 'index.js')],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      E2E_TEST: 'true',
      E2E_HEADLESS: process.env.E2E_HEADLESS ?? 'true',
      SCREENSHOT_MODE: 'true',
    },
  })

  page = await electronApp.firstWindow()
  await page.setViewportSize({ width: 1400, height: 900 })
  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector('#root > div', { timeout: 15000 })
  await page.waitForTimeout(3000)
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'Push Progress Indicator',
      description:
        'Long-running git operations (sync, commit, push) now show a "working" spinner ' +
        'on the session card in the sidebar. Previously the session stayed idle during these ' +
        'operations, giving no feedback. The spinner reuses the existing agent activity detection ' +
        'system \u2014 a utility wrapper periodically signals "working" status for the duration of the ' +
        'git operation, then lets normal idle detection take back over.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)

  if (electronApp) {
    await electronApp.close()
  }
})

test.describe.serial('Feature: Push Progress Indicator', () => {
  test('Step 1: Idle state before a git operation', async () => {
    await openSourceControl()

    // Ensure session is idle
    await setSessionStatus('idle')

    // Verify idle indicator is visible in sidebar
    const idleDot = page.locator('.bg-status-idle').first()
    await expect(idleDot).toBeVisible()

    // Screenshot sidebar + explorer to show context
    const sidebar = page.locator('[data-panel-id="sidebar"]')
    const explorer = page.locator('[data-panel-id="explorer"]')
    await screenshotRegion(page, sidebar, explorer, path.join(SCREENSHOTS, '01-idle-before-sync.png'), {
      maxHeight: 500,
    })
    steps.push({
      screenshotPath: 'screenshots/01-idle-before-sync.png',
      caption: 'Session idle before git operation',
      description:
        'The session card in the sidebar shows a gray idle dot. The source control panel ' +
        'has a Sync button ready. Before this feature, clicking Sync would leave the dot gray ' +
        'throughout the entire operation.',
    })
  })

  test('Step 2: Working spinner during a git operation', async () => {
    // Simulate the working state that withGitProgress triggers
    await setSessionStatus('working')

    // Verify spinner is visible
    const spinner = page.locator('.animate-spin').first()
    await expect(spinner).toBeVisible()

    // Screenshot sidebar + explorer
    const sidebar = page.locator('[data-panel-id="sidebar"]')
    const explorer = page.locator('[data-panel-id="explorer"]')
    await screenshotRegion(page, sidebar, explorer, path.join(SCREENSHOTS, '02-working-during-sync.png'), {
      maxHeight: 500,
    })
    steps.push({
      screenshotPath: 'screenshots/02-working-during-sync.png',
      caption: 'Working spinner shown during git operation',
      description:
        'When a git operation starts, withGitProgress immediately sets the session to "working" ' +
        'and refreshes it every 500ms. The sidebar shows a green animated spinner instead of ' +
        'the gray idle dot, giving clear feedback that something is happening.',
    })
  })

  test('Step 3: Green unread dot after operation completes', async () => {
    // Simulate a long operation: set workingStartTime 4 seconds ago so the
    // working→idle transition triggers the isUnread flag.
    await page.evaluate(() => {
      const store = (window as Record<string, unknown>).__sessionStore as {
        getState: () => {
          activeSessionId: string
          sessions: { id: string; workingStartTime: number | null }[]
        }
        setState: (update: { sessions: unknown[] }) => void
      }
      if (!store) return
      const state = store.getState()
      const sessions = state.sessions.map((s) =>
        s.id === state.activeSessionId
          ? { ...s, workingStartTime: Date.now() - 4000 }
          : s,
      )
      store.setState({ sessions })
    })

    // Now transition to idle — store will detect 4s of working and set isUnread
    await setSessionStatus('idle')

    // Verify green unread dot is visible (green with glow shadow)
    const unreadDot = page.locator('.bg-green-400').first()
    await expect(unreadDot).toBeVisible()

    // Verify spinner is gone
    const spinner = page.locator('.animate-spin')
    await expect(spinner).not.toBeVisible()

    // Screenshot sidebar + explorer
    const sidebar = page.locator('[data-panel-id="sidebar"]')
    const explorer = page.locator('[data-panel-id="explorer"]')
    await screenshotRegion(page, sidebar, explorer, path.join(SCREENSHOTS, '03-unread-after-sync.png'), {
      maxHeight: 500,
    })
    steps.push({
      screenshotPath: 'screenshots/03-unread-after-sync.png',
      caption: 'Green "unread" dot after operation completes',
      description:
        'When the git operation finishes, withGitProgress explicitly transitions the session ' +
        'to idle. If the operation lasted 3+ seconds, the store marks the session as unread \u2014 ' +
        'shown as a green glowing dot. This reuses the same notification system that alerts ' +
        'users when an agent finishes a task.',
    })
  })
})
