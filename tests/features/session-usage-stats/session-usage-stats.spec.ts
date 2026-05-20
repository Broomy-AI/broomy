/**
 * Feature Documentation: Session Memory & CPU Usage
 *
 * Demonstrates the per-session usage chip in the sidebar. The chip is hidden
 * until usage crosses a small threshold (300 MB RSS or 5% CPU), at which
 * point it appears in yellow. It turns red once usage crosses a heavy
 * threshold (1 GB RSS or 50% CPU), surfacing runaway agent sessions before
 * they crash the user's machine.
 *
 * Run with: pnpm test:feature-docs session-usage-stats
 */
import { test, expect, resetApp } from '../_shared/electron-fixture'
import type { ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { screenshotElement } from '../_shared/screenshot-helpers'
import { generateFeaturePage, generateIndex, FeatureStep } from '../_shared/template'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const FEATURE_DIR = __dirname
const SCREENSHOTS = path.join(FEATURE_DIR, 'screenshots')
const FEATURES_ROOT = path.join(__dirname, '..')

let page: Page
let electronApp: ElectronApplication
const steps: FeatureStep[] = []

/**
 * Re-register the `pty:getStats` IPC handler in the main process so it returns
 * canned stats. Real PTYs don't run in E2E mode (agents are mock scripts), so
 * without this override the handler would always return {} and the sidebar
 * chip would never appear.
 *
 * We override on the main side because `window.pty` is exposed through
 * Electron's context bridge as a frozen object — assigning to
 * `window.pty.getStats` from the renderer has no effect.
 *
 * Caller is responsible for waiting on a chip-visible/chip-updated assertion
 * with a timeout large enough to cover the hook's 5s poll interval (use 7s).
 */
async function injectStats(stats: Record<string, { rssMb: number; cpuPct: number; ptyCount: number }>): Promise<void> {
  await electronApp.evaluate(({ ipcMain }, s) => {
    ipcMain.removeHandler('pty:getStats')
    ipcMain.handle('pty:getStats', () => s)
  }, stats)
}

/** The hook polls every 5s — give it one full cycle plus headroom. */
const STATS_POLL_TIMEOUT = 7000

test.beforeAll(async () => {
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true })
  ;({ page, electronApp } = await resetApp())
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'Session Memory & CPU Usage',
      description:
        'Each session card in the sidebar can surface its current memory and CPU footprint, ' +
        'aggregated across every PTY the session has spawned (agent shell, user tabs, ' +
        'service terminals). The chip stays hidden for healthy sessions to keep the sidebar ' +
        'uncluttered, fades in as yellow once a session is using a notable amount of memory ' +
        'or CPU, and turns red when a session crosses into runaway territory — so a user ' +
        'who walks back to their laptop can see at a glance which session is eating their ' +
        'machine. A complementary Help → Kill Orphaned Processes menu item reaps detached ' +
        'daemons left behind by exited agents.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: Session Memory & CPU Usage', () => {
  test('Step 1: Idle sessions — no usage chip in the sidebar', async () => {
    const sidebar = page.locator('[data-panel-id="sidebar"]')
    await expect(sidebar).toBeVisible()

    // No stats injected yet — chip should be absent. (An empty `claude` shell
    // is around 250 MB RSS, which is why the threshold sits at 300 MB.)
    const sidebarCount = await sidebar.locator('[title*="Memory:"]').count()
    expect(sidebarCount).toBe(0)

    await screenshotElement(page, sidebar, path.join(SCREENSHOTS, '01-no-usage-chips.png'), {
      maxHeight: 600,
    })
    steps.push({
      screenshotPath: 'screenshots/01-no-usage-chips.png',
      caption: 'Healthy sessions — the sidebar stays clean',
      description:
        'When every session is below 300 MB and 5% CPU, the usage chip is hidden. ' +
        'The threshold is set above the ~250 MB baseline of an idle `claude` shell ' +
        'so healthy sessions stay quiet — the chip only appears when something is ' +
        'actually consuming notable resources.',
    })
  })

  test('Step 2: A session crosses the notable-usage threshold (yellow chip)', async () => {
    // Default scenario session IDs: '1' = broomy, '2' = backend-api, '3' = docs-site.
    // Show broomy with moderate usage (yellow), leave others below threshold.
    await injectStats({
      '1': { rssMb: 450, cpuPct: 12.4, ptyCount: 1 },
    })

    const broomyCard = page.locator('.cursor-pointer:has-text("broomy")')
    const broomyChip = broomyCard.locator('[title*="Memory:"]')
    await expect(broomyChip).toBeVisible({ timeout: STATS_POLL_TIMEOUT })
    await expect(broomyChip).toContainText('450MB')
    await expect(broomyChip).toContainText('12%')

    const sidebar = page.locator('[data-panel-id="sidebar"]')
    await screenshotElement(page, sidebar, path.join(SCREENSHOTS, '02-yellow-chip.png'), {
      maxHeight: 600,
    })
    steps.push({
      screenshotPath: 'screenshots/02-yellow-chip.png',
      caption: 'A session is using a notable amount of resources',
      description:
        'Once a session crosses 300 MB RSS or 5% CPU, a yellow chip appears next to the ' +
        'repo name showing the memory footprint and CPU%. The chip aggregates every ' +
        'terminal owned by that session — agent shell, user tabs, and services — so ' +
        'spawned dev servers count toward the session that started them.',
    })
  })

  test('Step 3: A session is using too much (red chip)', async () => {
    // Broomy ticks up to ~moderate; backend-api spirals into runaway territory
    // (the next dev / MCP servers / jest workers scenario from the OOM bug).
    await injectStats({
      '1': { rssMb: 512, cpuPct: 14.0, ptyCount: 1 },
      '2': { rssMb: 1843, cpuPct: 67.5, ptyCount: 4 },
    })

    const backendCard = page.locator('.cursor-pointer:has-text("backend-api")')
    const backendChip = backendCard.locator('[title*="Memory:"]')
    // Wait for the chip to refresh with the new values (chip is already
    // visible from the previous step, so we wait on the new text instead).
    await expect(backendChip).toContainText('1.8GB', { timeout: STATS_POLL_TIMEOUT })
    await expect(backendChip).toContainText('68%')

    const sidebar = page.locator('[data-panel-id="sidebar"]')
    await screenshotElement(page, sidebar, path.join(SCREENSHOTS, '03-red-chip.png'), {
      maxHeight: 600,
    })
    steps.push({
      screenshotPath: 'screenshots/03-red-chip.png',
      caption: 'A runaway session — red chip',
      description:
        'When a session crosses 1 GB RSS or 50% CPU, the chip turns red. This is the ' +
        'visual cue that something has gone wrong: a `next dev` server stuck in a tight ' +
        'rebuild loop, an MCP server leaking memory, jest workers piling up. The user ' +
        'can hover the chip for a tooltip with the exact memory, CPU%, and terminal count.',
    })
  })

  test('Step 4: Tooltip shows precise breakdown including terminal count', async () => {
    const backendCard = page.locator('.cursor-pointer:has-text("backend-api")')
    const backendChip = backendCard.locator('[title*="Memory:"]')

    // Hover to surface the native tooltip — note that native title tooltips
    // are not captured in screenshots, but we can verify the title attribute
    // contains the breakdown.
    const titleAttr = await backendChip.getAttribute('title')
    expect(titleAttr).toContain('Memory: 1.8GB')
    expect(titleAttr).toContain('CPU: 67.5%')
    expect(titleAttr).toContain('4 terminals')

    // Capture the card itself so the reader sees what the user is hovering.
    await screenshotElement(page, backendCard, path.join(SCREENSHOTS, '04-card-with-chip.png'))
    steps.push({
      screenshotPath: 'screenshots/04-card-with-chip.png',
      caption: 'Per-session card with the red usage chip',
      description:
        'The chip aggregates across every PTY the session owns. Hovering it reveals ' +
        'the exact memory, CPU%, and terminal count — useful for telling apart "one ' +
        'huge agent" from "many small services adding up". Below those thresholds the ' +
        'chip stays hidden; the goal is to draw attention only when it matters.',
    })
  })
})
