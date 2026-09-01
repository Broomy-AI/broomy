/**
 * Shared Electron fixture for feature documentation tests.
 *
 * Launches one Electron instance per Playwright worker and reuses it across
 * feature specs. Each feature calls `resetApp()` in beforeAll to reload
 * the renderer, giving a fresh React/Zustand state without the ~5s cost of
 * a full Electron relaunch.
 *
 * Usage in feature specs:
 *
 *   import { test, expect, resetApp } from '../_shared/electron-fixture'
 *   import type { Page } from '@playwright/test'
 *
 *   let page: Page
 *   test.beforeAll(async () => {
 *     const result = await resetApp()
 *     page = result.page
 *   })
 *
 * For features that need the marketing scenario (richer sessions, file trees):
 *
 *   test.beforeAll(async () => {
 *     const result = await resetApp({ scenario: 'marketing' })
 *     page = result.page
 *   })
 */
import { test as base, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let sharedApp: ElectronApplication | null = null
let sharedPage: Page | null = null

/**
 * Launch the shared Electron app (once per worker).
 */
async function getOrLaunchApp(): Promise<{ electronApp: ElectronApplication; page: Page }> {
  if (sharedApp && sharedPage) {
    return { electronApp: sharedApp, page: sharedPage }
  }

  sharedApp = await electron.launch({
    args: [path.join(__dirname, '..', '..', '..', 'out', 'main', 'index.js')],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      E2E_TEST: 'true',
      E2E_HEADLESS: process.env.E2E_HEADLESS ?? 'true',
    },
  })

  sharedPage = await sharedApp.firstWindow()
  await sharedPage.setViewportSize({ width: 1400, height: 900 })
  await sharedPage.waitForLoadState('domcontentloaded')
  await sharedPage.waitForSelector('#root > div', { timeout: 15000 })
  // Wait for sessions to load (sidebar renders session cards with cursor-pointer)
  await sharedPage.waitForSelector('.cursor-pointer', { timeout: 10000 })

  // Disable animations for stable screenshots
  await sharedPage.evaluate(() => document.documentElement.classList.add('e2e-stable'))

  return { electronApp: sharedApp, page: sharedPage }
}

interface ResetOptions {
  /**
   * E2E mock data scenario. Available scenarios:
   * - 'marketing': 8 sessions with rich git status and file trees.
   *    Used for the Broomy marketing website screenshots.
   * - undefined/omitted: default 3-session scenario with issue data.
   */
  scenario?: 'marketing'
  /** Set mock merge state ('true', 'conflicts', or undefined to clear) */
  mockMerge?: string
  /** Override gh:prStatus state ('OPEN', 'MERGED', 'CLOSED', 'none') */
  mockPrState?: string
  /** Override git:isMergedInto return value */
  mockIsMerged?: boolean
  /** Override git:hasBranchCommits return value */
  mockHasBranchCommits?: boolean
  /** Return clean git status (no files, ahead=0, with tracking) */
  mockGitClean?: boolean
  /** Override git status ahead count */
  mockGitAhead?: number
  /** Override git status tracking branch */
  mockGitTracking?: string
  /**
   * Canned agent responses for E2E tests. Each entry maps a prompt substring
   * to a reply string. The first matching entry is used; when nothing matches
   * the mock falls back to a generic placeholder.
   *
   * @example
   *   agentResponses: [{ match: 'hello', response: 'Hi there!' }]
   */
  agentResponses?: { match: string; response: string }[]
  /**
   * Delay in milliseconds before the mock agent sends its response.
   * Use this to test mid-turn injection — the delay gives tests time to type
   * and queue a message while the agent appears to be working.
   */
  agentResponseDelayMs?: number
  /**
   * When true, use a fake SDK implementation that goes through the real
   * buildQueryOptions and runTurn code paths, validating that critical
   * options (settingSources, tools, cwd) are correctly set.
   * Slash commands will return a response confirming the options.
   */
  fakeSdk?: boolean
}

/** Converts an optional number to a string for env var transport; returns '' for undefined. */
const optNum = (n: number | undefined) => n !== undefined ? String(n) : ''

/** Build the env overrides object from ResetOptions. */
function buildEnvOverrides(opts?: ResetOptions) {
  return {
    sc: opts?.scenario ?? 'default',
    mm: opts?.mockMerge ?? '',
    prState: opts?.mockPrState ?? '',
    isMerged: opts?.mockIsMerged ? 'true' : '',
    hasBranchCommits: opts?.mockHasBranchCommits ? 'true' : '',
    gitClean: opts?.mockGitClean ? 'true' : '',
    gitAhead: optNum(opts?.mockGitAhead),
    gitTracking: opts?.mockGitTracking ?? '',
    agentResponses: opts?.agentResponses ? JSON.stringify(opts.agentResponses) : '',
    agentResponseDelayMs: optNum(opts?.agentResponseDelayMs),
    fakeSdk: opts?.fakeSdk ? 'true' : '',
  }
}

/** Apply env overrides to the main process. */
async function applyEnvOverrides(electronApp: ElectronApplication, envOverrides: ReturnType<typeof buildEnvOverrides>) {
  await electronApp.evaluate((_electron, env) => {
    process.env.E2E_SCENARIO = env.sc
    const setOrDelete = (key: string, val: string) => { process.env[key] = val || '' }
    setOrDelete('E2E_MOCK_MERGE', env.mm)
    setOrDelete('E2E_MOCK_PR_STATE', env.prState)
    setOrDelete('E2E_MOCK_IS_MERGED', env.isMerged)
    setOrDelete('E2E_MOCK_HAS_BRANCH_COMMITS', env.hasBranchCommits)
    setOrDelete('E2E_MOCK_GIT_CLEAN', env.gitClean)
    setOrDelete('E2E_MOCK_GIT_AHEAD', env.gitAhead)
    setOrDelete('E2E_MOCK_GIT_TRACKING', env.gitTracking)
    setOrDelete('E2E_AGENT_RESPONSES', env.agentResponses)
    setOrDelete('E2E_AGENT_RESPONSE_DELAY_MS', env.agentResponseDelayMs)
    setOrDelete('E2E_FAKE_SDK', env.fakeSdk)
  }, envOverrides)
}

/**
 * Reload the renderer to get fresh app state for a new feature.
 * Optionally configure mock data scenario before reloading.
 */
let isFirstCall = true

export async function resetApp(opts?: ResetOptions): Promise<{ electronApp: ElectronApplication; page: Page }> {
  const { electronApp, page } = await getOrLaunchApp()

  // Set env vars on the main process before reload so IPC handlers pick them up
  await applyEnvOverrides(electronApp, buildEnvOverrides(opts))

  if (isFirstCall) {
    // First call — app is already fresh from launch
    isFirstCall = false
    if (opts?.scenario || opts?.mockMerge) {
      // Env vars changed after launch — need a reload to pick them up
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForSelector('#root > div', { timeout: 15000 })
      await page.waitForSelector('.cursor-pointer', { timeout: 10000 })
    }
  } else {
    // Kill all PTY processes before reload to prevent FD/process exhaustion.
    // Without this, each reload creates 3 new PTYs without cleaning up old ones,
    // eventually causing posix_spawnp failures.
    // Subsequent calls — reload renderer to reset React/Zustand state
    // (PTY cleanup happens automatically in main process on did-start-navigation)
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('#root > div', { timeout: 15000 })
    await page.waitForSelector('.cursor-pointer', { timeout: 10000 })
  }

  // Disable animations and freeze time for stable screenshots (re-apply after every reload)
  await page.evaluate(() => {
    document.documentElement.classList.add('e2e-stable')
    // Freeze Date.now() to a fixed point so relative timestamps are deterministic
    const FROZEN_TIME = new Date('2025-02-01T12:00:00Z').getTime()
    const _OriginalDate = globalThis.Date
    const _origNow = Date.now
    globalThis.Date.now = () => FROZEN_TIME
    const OrigDate = globalThis.Date
    // @ts-expect-error — override constructor for new Date()
    globalThis.Date = class FrozenDate extends OrigDate {
      constructor(...args: unknown[]) {
        if (args.length === 0) super(FROZEN_TIME)
        else super(...(args as [string]))
      }
    }
    // Preserve static methods
    globalThis.Date.now = () => FROZEN_TIME
    globalThis.Date.parse = _OriginalDate.parse
    globalThis.Date.UTC = _OriginalDate.UTC
  })

  return { electronApp, page }
}

/**
 * Close the shared Electron app. Called automatically when the worker process exits.
 */
export async function closeApp(): Promise<void> {
  if (sharedApp) {
    await sharedApp.close()
    sharedApp = null
    sharedPage = null
  }
}

// Close Electron when the worker process exits
process.on('beforeExit', () => {
  if (sharedApp) {
    sharedApp.close().catch(() => {})
    sharedApp = null
    sharedPage = null
  }
})

// Re-export test and expect for convenience
export { base as test, electron }
export { expect } from '@playwright/test'
export type { ElectronApplication, Page } from '@playwright/test'
