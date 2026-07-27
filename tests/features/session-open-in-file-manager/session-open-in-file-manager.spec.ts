/**
 * Feature Documentation: Open Session Folder in File Manager
 *
 * Right-clicking a session card opens a native context menu whose "Open in Finder /
 * Explorer / File Manager" item opens that session's worktree folder in the OS file
 * manager. The menu itself is a native OS popup rendered outside the page, so Playwright
 * can neither screenshot nor safely trigger it (doing so would block on a native menu).
 * This walkthrough therefore documents the affordance on the session card.
 *
 * Run with: pnpm test:feature-docs
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
      title: 'Open Session Folder in File Manager',
      description:
        'Right-clicking a session in the sidebar opens a native context menu with an ' +
        '"Open in Finder / Explorer / File Manager" item (labelled per OS) that opens the ' +
        "session's worktree folder in the operating system's file manager. Handy for " +
        'jumping straight to the files on disk.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)

})

test.describe.serial('Feature: Open Session Folder in File Manager', () => {
  test('Step 1: Right-click a session card to open its folder', async () => {
    const sidebar = page.locator('[data-panel-id="sidebar"]')
    await expect(sidebar).toBeVisible()

    // Any session card can be right-clicked; the menu opens that session's own worktree folder.
    const broomySession = page.locator('.cursor-pointer:has-text("broomy")')
    await expect(broomySession).toBeVisible()

    await screenshotElement(page, sidebar, path.join(SCREENSHOTS, '01-sessions.png'), {
      maxHeight: 600,
    })
    steps.push({
      screenshotPath: 'screenshots/01-sessions.png',
      caption: 'Right-click any session → "Open in Finder / Explorer / File Manager"',
      description:
        'Right-clicking a session card opens a native OS context menu whose single item opens ' +
        "that session's worktree folder in the file manager (Finder on macOS, File Explorer on " +
        'Windows, File Manager on Linux). The menu is a native OS popup, so it is not captured ' +
        'in this screenshot.',
    })
  })
})
