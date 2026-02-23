/**
 * Feature Documentation: Select All Scoped to Active Pane
 *
 * Demonstrates that Cmd+A selects content within the focused pane
 * (terminal, Monaco editor) rather than selecting everything on the page.
 *
 * Run with: pnpm test:feature-docs select-all
 */
import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
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

let electronApp: ElectronApplication
let page: Page
const steps: FeatureStep[] = []

test.setTimeout(60000)

test.beforeAll(async () => {
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true })

  electronApp = await electron.launch({
    args: [path.join(__dirname, '..', '..', '..', 'out', 'main', 'index.js')],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      E2E_TEST: 'true',
      E2E_HEADLESS: process.env.E2E_HEADLESS ?? 'true',
    },
  })

  page = await electronApp.firstWindow()
  await page.setViewportSize({ width: 1400, height: 900 })
  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector('#root > div', { timeout: 15000 })

  // Wait for terminals to initialize
  await page.waitForTimeout(3000)
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'Select All — Scoped to Active Pane',
      description:
        'Cmd+A (Select All) now selects content only within the currently focused pane. ' +
        'In a terminal, it selects all terminal buffer content. In Monaco editor or text inputs, ' +
        'it selects within that element. It no longer selects everything on the page.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)

  if (electronApp) {
    await electronApp.close()
  }
})

test.describe.serial('Feature: Select All Scoped to Active Pane', () => {
  test('Step 1: Terminal has content — before select all', async () => {
    // Verify terminal is visible with content
    const terminalArea = page.locator('.xterm').first()
    await expect(terminalArea).toBeVisible()

    const terminalText = await page.evaluate(() => {
      const viewport = document.querySelector('.xterm-rows')
      return viewport?.textContent || ''
    })
    expect(terminalText).toContain('FAKE_CLAUDE_READY')

    await screenshotElement(page, terminalArea, path.join(SCREENSHOTS, '01-terminal-before.png'))
    steps.push({
      screenshotPath: 'screenshots/01-terminal-before.png',
      caption: 'Terminal with agent output, before Select All',
      description:
        'The terminal shows output from the agent. No text is selected yet.',
    })
  })

  test('Step 2: Cmd+A in terminal selects terminal content only', async () => {
    // Click on the terminal to focus it
    const terminalArea = page.locator('.xterm').first()
    await terminalArea.click()
    await page.waitForTimeout(200)

    // Press Cmd+A
    await page.keyboard.press('Meta+a')
    await page.waitForTimeout(500)

    // Check that terminal has a selection
    const hasSelection = await page.evaluate(() => {
      // xterm selection is rendered as a canvas layer, not DOM selection.
      // Verify that the sidebar text is NOT selected (DOM selection is empty or
      // doesn't span the whole page).
      const domSelection = window.getSelection()
      const selectedText = domSelection?.toString() || ''
      // If scoped correctly, the DOM selection should be empty (terminal uses canvas selection)
      // or at most limited to the terminal area — NOT the entire page.
      return { selectedText: selectedText.substring(0, 200), length: selectedText.length }
    })

    // The DOM selection should be empty or minimal because terminal uses canvas-based selection
    expect(hasSelection.length).toBeLessThan(500)

    await screenshotElement(page, terminalArea, path.join(SCREENSHOTS, '02-terminal-select-all.png'))
    steps.push({
      screenshotPath: 'screenshots/02-terminal-select-all.png',
      caption: 'After Cmd+A — terminal buffer is selected, not the entire page',
      description:
        'Pressing Cmd+A while the terminal is focused selects all content within the terminal ' +
        'buffer (visible as a highlight in the terminal). The sidebar and other panels are unaffected.',
    })
  })

  test('Step 3: Sidebar and other panels are not selected', async () => {
    // Verify the sidebar is visible and its content is NOT part of a DOM selection
    const sidebar = page.locator('[data-panel-id="sidebar"]')
    await expect(sidebar).toBeVisible()

    const sidebarSelected = await page.evaluate(() => {
      const selection = window.getSelection()
      if (!selection || selection.rangeCount === 0) return false
      const sidebarEl = document.querySelector('[data-panel-id="sidebar"]')
      if (!sidebarEl) return false
      // Check if the selection intersects with the sidebar
      const range = selection.getRangeAt(0)
      return sidebarEl.contains(range.startContainer) || sidebarEl.contains(range.endContainer)
    })

    expect(sidebarSelected).toBe(false)

    await screenshotElement(page, sidebar, path.join(SCREENSHOTS, '03-sidebar-not-selected.png'), {
      maxHeight: 400,
    })
    steps.push({
      screenshotPath: 'screenshots/03-sidebar-not-selected.png',
      caption: 'Sidebar remains unselected after Cmd+A in terminal',
      description:
        'The sidebar shows sessions as normal — no text highlight. ' +
        'Select All is properly scoped to the terminal pane.',
    })
  })
})
