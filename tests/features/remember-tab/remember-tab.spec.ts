/**
 * Feature Documentation: Remember Terminal Tab
 *
 * Demonstrates that switching between sessions preserves the active terminal
 * tab. Previously, switching sessions always forced focus to the Agent tab.
 * Now whatever tab was last active is restored.
 *
 * Run with: pnpm test:feature-docs remember-tab
 */
import { test, expect, resetApp } from '../_shared/electron-fixture'
import type { Page } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { screenshotElement, screenshotRegion } from '../_shared/screenshot-helpers'
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
      title: 'Remember Terminal Tab',
      description:
        'When switching between sessions, the active terminal tab is now preserved. ' +
        'If you were on a user terminal tab, switching away and back keeps that tab selected ' +
        'instead of forcing focus back to the Agent tab.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: Remember Terminal Tab', () => {
  test('Step 1: Initial state — Agent tab is active', async () => {
    // The first session should be selected with Agent tab active
    const agentTab = page.locator('div.cursor-pointer:has-text("Agent"):visible').first()
    await expect(agentTab).toBeVisible()

    const terminalPanel = page.locator('[data-panel-id="terminal"]')
    await screenshotElement(page, terminalPanel, path.join(SCREENSHOTS, '01-agent-tab-active.png'), {
      maxHeight: 300,
    })
    steps.push({
      screenshotPath: 'screenshots/01-agent-tab-active.png',
      caption: 'Agent tab is active by default',
      description:
        'When a session first loads, the Agent tab is selected in the terminal tab bar.',
    })
  })

  test('Step 2: Add a user terminal tab', async () => {
    // Click the add tab button
    const addButton = page.locator('button[title="New terminal tab"]:visible')
    await addButton.click()

    // Wait for the new tab to appear
    const userTab = page.locator('div.cursor-pointer:has-text("Terminal"):visible').first()
    await expect(userTab).toBeVisible({ timeout: 5000 })

    // The user tab should be selected (aria-selected="true") and Agent tab should not
    // Use the existing E2E pattern: check visible tab text with active indicator
    const activeTabName = await page.evaluate(() => {
      // Find the visible tablist (the one whose parent is not invisible)
      const tablists = document.querySelectorAll('[role="tablist"]')
      for (const tablist of tablists) {
        const parent = tablist.closest('.invisible')
        if (parent) continue
        const activeTab = tablist.querySelector('[role="tab"][aria-selected="true"]')
        if (activeTab) {
          const span = activeTab.querySelector('span.truncate')
          return span?.textContent?.trim() ?? null
        }
      }
      return null
    })
    expect(activeTabName).toContain('Terminal')

    const terminalPanel = page.locator('[data-panel-id="terminal"]')
    await screenshotElement(page, terminalPanel, path.join(SCREENSHOTS, '02-user-tab-active.png'), {
      maxHeight: 300,
    })
    steps.push({
      screenshotPath: 'screenshots/02-user-tab-active.png',
      caption: 'User terminal tab is now active',
      description:
        'After clicking "+", a new Terminal tab is added and automatically selected. ' +
        'The Agent tab is no longer highlighted.',
    })
  })

  test('Step 3: Switch to a different session', async () => {
    // Click on a different session in the sidebar
    const backendSession = page.locator('.cursor-pointer:has-text("backend-api")')
    await backendSession.click()
    await expect(backendSession).toHaveClass(/bg-accent\/15/)

    // This session should show the Agent tab as active
    const activeTabName = await page.evaluate(() => {
      const tablists = document.querySelectorAll('[role="tablist"]')
      for (const tablist of tablists) {
        if (tablist.closest('.invisible')) continue
        const activeTab = tablist.querySelector('[role="tab"][aria-selected="true"]')
        if (activeTab) {
          const span = activeTab.querySelector('span.truncate')
          return span?.textContent?.trim() ?? null
        }
      }
      return null
    })
    expect(activeTabName).toBe('Agent')

    const sidebar = page.locator('[data-panel-id="sidebar"]')
    await screenshotElement(page, sidebar, path.join(SCREENSHOTS, '03-switched-session.png'), {
      maxHeight: 600,
    })
    steps.push({
      screenshotPath: 'screenshots/03-switched-session.png',
      caption: 'Switched to a different session',
      description:
        'Clicking "backend-api" in the sidebar switches to that session. ' +
        'It shows the Agent tab by default since no user tab was created there.',
    })
  })

  test('Step 4: Switch back — user terminal tab is still active', async () => {
    // Switch back to the first session
    const broomySession = page.locator('.cursor-pointer:has-text("broomy")')
    await broomySession.click()
    await expect(broomySession).toHaveClass(/bg-accent\/15/)

    // The user Terminal tab should still be active, NOT the Agent tab
    const activeTabName = await page.evaluate(() => {
      const tablists = document.querySelectorAll('[role="tablist"]')
      for (const tablist of tablists) {
        if (tablist.closest('.invisible')) continue
        const activeTab = tablist.querySelector('[role="tab"][aria-selected="true"]')
        if (activeTab) {
          const span = activeTab.querySelector('span.truncate')
          return span?.textContent?.trim() ?? null
        }
      }
      return null
    })
    expect(activeTabName).toContain('Terminal')

    const terminalPanel = page.locator('[data-panel-id="terminal"]')
    await screenshotElement(page, terminalPanel, path.join(SCREENSHOTS, '04-tab-preserved.png'), {
      maxHeight: 300,
    })
    steps.push({
      screenshotPath: 'screenshots/04-tab-preserved.png',
      caption: 'Terminal tab is preserved after switching back',
      description:
        'After switching away and back, the user Terminal tab is still selected. ' +
        'Previously this would have forced focus back to the Agent tab.',
    })
  })
})
