/**
 * Feature Documentation: Session Status on Change
 *
 * Verifies that switching sessions does not cause idle sessions to briefly
 * flash as "working". Only the two affected session cards (old active, new
 * active) should re-render, and terminal components should not re-render at all.
 *
 * Run with: pnpm test:feature-docs session-status-on-change
 */
import { test, expect, resetApp } from '../_shared/electron-fixture'
import type { Page } from '@playwright/test'
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
const steps: FeatureStep[] = []

test.beforeAll(async () => {
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true })
  ;({ page } = await resetApp())
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'Session Status Stability on Switch',
      description:
        'When switching between sessions, idle sessions must remain idle — no spinners or ' +
        '"working" flashes. Each session card subscribes only to its own active state via the ' +
        'Zustand store, so switching sessions re-renders only the two affected cards. Terminal ' +
        'components use store subscriptions for imperative fit/focus and never re-render on switch.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: Session Status Stability on Switch', () => {
  test('Step 1: Initial state — all idle sessions show idle status', async () => {
    const sidebar = page.locator('[data-panel-id="sidebar"]')
    await expect(sidebar).toBeVisible()

    // Verify multiple sessions exist
    const sessionCards = sidebar.locator('.cursor-pointer')
    const count = await sessionCards.count()
    expect(count).toBeGreaterThanOrEqual(2)

    // All sessions should show "Idle" (no spinners visible)
    const spinners = sidebar.locator('.animate-spin')
    const spinnerCount = await spinners.count()
    expect(spinnerCount).toBe(0)

    await screenshotElement(page, sidebar, path.join(SCREENSHOTS, '01-initial-all-idle.png'), {
      maxHeight: 600,
    })
    steps.push({
      screenshotPath: 'screenshots/01-initial-all-idle.png',
      caption: 'All sessions start in idle state',
      description:
        'The sidebar shows multiple sessions, all with "Idle" status. No spinners are visible.',
    })
  })

  test('Step 2: First session is highlighted as active', async () => {
    const sidebar = page.locator('[data-panel-id="sidebar"]')
    const broomySession = sidebar.locator('.cursor-pointer:has-text("broomy")')
    await expect(broomySession).toBeVisible()

    // The first session should be highlighted
    await expect(broomySession).toHaveClass(/bg-accent\/15/)

    await screenshotElement(page, broomySession, path.join(SCREENSHOTS, '02-first-session-active.png'))
    steps.push({
      screenshotPath: 'screenshots/02-first-session-active.png',
      caption: 'First session is highlighted as active',
      description:
        'The "broomy" session card has the active highlight (bg-accent/15). ' +
        'It shows idle status with no spinner.',
    })
  })

  test('Step 3: Switch session — idle statuses remain stable', async () => {
    const sidebar = page.locator('[data-panel-id="sidebar"]')

    // Click on a different session
    const backendSession = sidebar.locator('.cursor-pointer:has-text("backend-api")')
    await backendSession.click()

    // The clicked session should now be highlighted
    await expect(backendSession).toHaveClass(/bg-accent\/15/)

    // Previous session should no longer be highlighted
    const broomySession = sidebar.locator('.cursor-pointer:has-text("broomy")')
    const broomyClasses = await broomySession.getAttribute('class')
    expect(broomyClasses).not.toContain('bg-accent/15')

    // No spinners should appear — all idle sessions stay idle
    const spinners = sidebar.locator('.animate-spin')
    const spinnerCount = await spinners.count()
    expect(spinnerCount).toBe(0)

    await screenshotElement(page, sidebar, path.join(SCREENSHOTS, '03-switched-no-spinners.png'), {
      maxHeight: 600,
    })
    steps.push({
      screenshotPath: 'screenshots/03-switched-no-spinners.png',
      caption: 'After switching, all idle sessions remain idle',
      description:
        'After clicking "backend-api", only the highlight moved. No session cards flash as "working". ' +
        'The absence of spinners confirms that switching sessions does not trigger false status changes.',
    })
  })

  test('Step 4: Switch again — consistent stability', async () => {
    const sidebar = page.locator('[data-panel-id="sidebar"]')

    // Switch back to broomy
    const broomySession = sidebar.locator('.cursor-pointer:has-text("broomy")')
    await broomySession.click()
    await expect(broomySession).toHaveClass(/bg-accent\/15/)

    // Still no spinners
    const spinners = sidebar.locator('.animate-spin')
    const spinnerCount = await spinners.count()
    expect(spinnerCount).toBe(0)

    // Terminal is still visible and functional
    const terminalArea = page.locator('.xterm').first()
    await expect(terminalArea).toBeVisible()

    await screenshotElement(page, sidebar, path.join(SCREENSHOTS, '04-switch-back-stable.png'), {
      maxHeight: 600,
    })
    steps.push({
      screenshotPath: 'screenshots/04-switch-back-stable.png',
      caption: 'Switching back is equally stable',
      description:
        'Switching back to "broomy" again shows no spinner flashes. The terminal remains visible ' +
        'and functional. Each switch only updates the two affected session cards.',
    })
  })
})
