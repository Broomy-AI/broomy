/**
 * Feature Documentation: the agent exit banner (#190)
 *
 * When the agent process exits, a banner above the terminal says so and offers Restart Agent.
 * Restarting now removes the banner, and an × dismisses it without restarting.
 *
 * The exit is delivered the way the main process delivers it (a `pty:exit:<id>` message to the
 * window), so the real preload listener and renderer state handle it. This fixture freezes
 * Date.now(), which used to give a restarted agent the same PTY id as the old one.
 *
 * Run with: pnpm test:feature-docs agent-exit-banner
 */
import { test, expect, resetApp } from '../_shared/electron-fixture'
import type { ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { screenshotRegion } from '../_shared/screenshot-helpers'
import { generateFeaturePage, generateIndex, FeatureStep } from '../_shared/template'
import { resumeActiveSession, getActiveSessionTerminalBuffer } from '../_shared/resume-helpers'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const FEATURE_DIR = __dirname
const SCREENSHOTS = path.join(FEATURE_DIR, 'screenshots')
const FEATURES_ROOT = path.join(__dirname, '..')

let electronApp: ElectronApplication
let page: Page
const steps: FeatureStep[] = []

const agentPanel = () => page.locator('[data-panel-id="agent"]')
const tabBar = () => agentPanel().locator('[role="tablist"][aria-label="Terminal tabs"]:visible')
const exitBanner = () => page.locator('[data-agent-exit-banner]:visible')
const terminal = () => agentPanel().locator('.xterm:visible').first()

async function activeAgentPtyId(): Promise<string | undefined> {
  return page.evaluate(() => {
    const store = (window as unknown as {
      __sessionStore: { getState: () => { activeSessionId: string | null; sessions: { id: string; agentPtyId?: string }[] } }
    }).__sessionStore
    const state = store.getState()
    return state.sessions.find((s) => s.id === state.activeSessionId)?.agentPtyId
  })
}

/** The agent exits, as the main process reports it when the PTY ends. */
async function agentExits(): Promise<string> {
  await expect.poll(async () => !!(await activeAgentPtyId())).toBe(true)
  const id = (await activeAgentPtyId())!
  await electronApp.evaluate(({ BrowserWindow }, ptyId) => {
    BrowserWindow.getAllWindows()[0].webContents.send(`pty:exit:${ptyId}`, 0)
  }, id)
  await expect(exitBanner()).toContainText('Agent process has exited.')
  return id
}

async function shoot(file: string, caption: string, description: string, bottom = exitBanner()) {
  await screenshotRegion(page, tabBar(), bottom, path.join(SCREENSHOTS, file), { maxHeight: 260 })
  steps.push({ screenshotPath: `screenshots/${file}`, caption, description })
}

test.beforeAll(async () => {
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true })
  ;({ electronApp, page } = await resetApp())
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'Agent exit banner',
      description:
        'When the agent process exits, a banner above the terminal says so and offers Restart Agent. ' +
        'Restarting now removes the banner (before, it stayed above the new agent for good), and an × ' +
        'dismisses it without restarting, like the other banners.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: Agent exit banner', () => {
  test('Step 1: the agent exits — Restart Agent, and now an ×', async () => {
    const broomySession = page.locator('.cursor-pointer:has-text("broomy")')
    await broomySession.click()
    await expect(broomySession).toHaveClass(/bg-accent\/15/)
    // Sessions restore paused: resume to get a running agent
    await resumeActiveSession(page)

    await agentExits()
    await expect(exitBanner().getByRole('button', { name: 'Restart Agent' })).toBeVisible()
    await expect(exitBanner().getByRole('button', { name: 'Dismiss' })).toBeVisible()

    await shoot('01-agent-exited.png', 'The agent has exited: Restart Agent, and an × to dismiss',
      'The banner explains what happened and keeps Restart Agent as the main action. The × on the right is ' +
      'new: it hides the banner without restarting, like the error and resume banners.')
  })

  test('Step 2: Restart Agent starts a new agent and the banner goes away', async () => {
    const oldId = (await activeAgentPtyId())!
    await exitBanner().getByRole('button', { name: 'Restart Agent' }).click()
    await expect(exitBanner()).toHaveCount(0)
    await expect.poll(async () => {
      const id = await activeAgentPtyId()
      return !!id && id !== oldId
    }, { timeout: 10000 }).toBe(true)
    await expect.poll(() => getActiveSessionTerminalBuffer(page), { timeout: 10000 }).toContain('FAKE_CLAUDE_READY')
    await expect(exitBanner()).toHaveCount(0)

    await shoot('02-after-restart.png', 'After Restart Agent: the new agent runs, with no banner above it',
      'Before this fix the "Agent process has exited." banner stayed above the restarted agent for as long as ' +
      'the session was open. A new agent process now clears it.', terminal())
  })

  test('Step 3: the next exit shows the banner again', async () => {
    await agentExits()
    await expect(exitBanner().getByRole('button', { name: 'Dismiss' })).toBeVisible()

    await shoot('03-exited-again.png', 'The restarted agent exits too: the banner is back',
      'Each exit shows the banner again, whatever happened to the previous one, so an exit is never hidden by ' +
      'an earlier dismiss or restart.', terminal())
  })

  test('Step 4: the × dismisses the banner without restarting', async () => {
    await exitBanner().getByRole('button', { name: 'Dismiss' }).click()
    await expect(exitBanner()).toHaveCount(0)

    await shoot('04-dismissed.png', 'Dismissed: the banner is gone and nothing restarted',
      'The × only hides the banner; the terminal keeps the "[Process exited with code 0]" line. Restart Agent ' +
      'is still in the terminal\'s right-click menu and in Agent > Restart Agent.', terminal())
  })

  test('Step 5: the light theme', async () => {
    await agentExits()
    const original = await page.evaluate(() => document.documentElement.dataset.theme ?? null)
    try {
      await page.evaluate(() => { document.documentElement.dataset.theme = 'light' })
      await expect(exitBanner()).toBeVisible()
      await shoot('05-light-theme.png', 'The same banner in the light theme',
        'The banner, Restart Agent and the × use the warning theme tokens, so they follow the light theme.')
    } finally {
      await page.evaluate((theme) => {
        if (theme === null) delete document.documentElement.dataset.theme
        else document.documentElement.dataset.theme = theme
      }, original)
    }
    await exitBanner().getByRole('button', { name: 'Dismiss' }).click()
    await expect(exitBanner()).toHaveCount(0)
  })
})
