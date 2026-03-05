/**
 * Feature Documentation: Multi-Level Settings Navigation + Commands Editor
 *
 * Exercises the refactored settings panel with stack-based navigation
 * and the commands editor accessible from source control.
 *
 * Run with: pnpm test:feature-docs config-help
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
      title: 'Multi-Level Settings Navigation + Commands Editor',
      description:
        'The settings panel uses stack-based sub-screen navigation with a back button. ' +
        'The root screen shows General settings plus clickable rows for Agents and each repository. ' +
        'A commands editor is accessible from source control and repo settings, rendering in the file viewer area.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: Settings Navigation', () => {
  test('Step 1: Settings root screen with General + nav rows', async () => {
    const settingsBtn = page.locator('button[title*="Settings"]')
    await settingsBtn.click()

    const settingsPanel = page.locator('[data-panel-id="settings"]')
    await expect(settingsPanel).toBeVisible()

    // Root screen shows Settings heading
    await expect(settingsPanel.locator('h2:has-text("Settings")')).toBeVisible()

    // General section visible
    await expect(settingsPanel.locator('text=General')).toBeVisible()
    await expect(settingsPanel.locator('text=Default Repo Folder')).toBeVisible()
    await expect(settingsPanel.locator('text=Terminal Shell')).toBeVisible()

    // Nav rows for Agents and Repositories
    await expect(settingsPanel.locator('text=Manage Agents')).toBeVisible()
    await expect(settingsPanel.locator('h3:has-text("Repositories")')).toBeVisible()

    // No back button on root
    await expect(settingsPanel.locator('[data-testid="settings-back"]')).not.toBeVisible()

    await screenshotElement(page, settingsPanel, path.join(SCREENSHOTS, '01-settings-root.png'), {
      maxHeight: 700,
    })
    steps.push({
      screenshotPath: 'screenshots/01-settings-root.png',
      caption: 'Settings root screen',
      description:
        'The root screen shows General settings (Default Repo Folder, Terminal Shell) ' +
        'plus clickable navigation rows for Agents and each repository.',
    })
  })

  test('Step 2: Navigate to Agents sub-screen', async () => {
    const settingsPanel = page.locator('[data-panel-id="settings"]')

    // Click Manage Agents
    await settingsPanel.locator('[data-testid="nav-agents"]').click()

    // Header changes to "Agents" with back button
    await expect(settingsPanel.locator('h2:has-text("Agents")')).toBeVisible()
    await expect(settingsPanel.locator('[data-testid="settings-back"]')).toBeVisible()

    // Agent list and add button visible
    await expect(settingsPanel.locator('text=Claude Code')).toBeVisible()
    await expect(settingsPanel.locator('button:has-text("+ Add Agent")')).toBeVisible()

    await screenshotElement(page, settingsPanel, path.join(SCREENSHOTS, '02-agents-screen.png'), {
      maxHeight: 700,
    })
    steps.push({
      screenshotPath: 'screenshots/02-agents-screen.png',
      caption: 'Agents sub-screen',
      description:
        'Clicking "Manage Agents" navigates to the agents sub-screen. ' +
        'A back arrow appears in the header. Agent CRUD is unchanged from before.',
    })
  })

  test('Step 3: Navigate back to root', async () => {
    const settingsPanel = page.locator('[data-panel-id="settings"]')

    // Click back
    await settingsPanel.locator('[data-testid="settings-back"]').click()

    // Back on root screen
    await expect(settingsPanel.locator('h2:has-text("Settings")')).toBeVisible()
    await expect(settingsPanel.locator('text=Manage Agents')).toBeVisible()

    // No back button
    await expect(settingsPanel.locator('[data-testid="settings-back"]')).not.toBeVisible()

    await screenshotElement(page, settingsPanel, path.join(SCREENSHOTS, '03-back-to-root.png'), {
      maxHeight: 700,
    })
    steps.push({
      screenshotPath: 'screenshots/03-back-to-root.png',
      caption: 'Back to root via back button',
      description:
        'Clicking the back arrow returns to the root screen. The back button disappears ' +
        'since we are at the top of the navigation stack.',
    })
  })

  test('Step 4: Navigate to a repo sub-screen', async () => {
    const settingsPanel = page.locator('[data-panel-id="settings"]')

    // Click the first repo row
    const repoRow = settingsPanel.locator('button:has-text("demo-project")').first()
    await repoRow.click()

    // Header shows repo name with back button
    await expect(settingsPanel.locator('[data-testid="settings-back"]')).toBeVisible()

    // Repo settings editor visible
    await expect(settingsPanel.locator('text=Default Agent')).toBeVisible()

    // Edit Commands link visible
    await expect(settingsPanel.locator('text=Edit Commands')).toBeVisible()

    await screenshotElement(page, settingsPanel, path.join(SCREENSHOTS, '04-repo-screen.png'), {
      maxHeight: 700,
    })
    steps.push({
      screenshotPath: 'screenshots/04-repo-screen.png',
      caption: 'Repository settings sub-screen',
      description:
        'Clicking a repository navigates to its settings sub-screen. ' +
        'The RepoSettingsEditor is embedded here, and an "Edit Commands" link ' +
        'is available to open the commands editor.',
    })

    // Close settings to clean up for next flow
    const closeBtn = settingsPanel.locator('button[title="Close settings"]')
    await closeBtn.click()
  })
})

test.describe.serial('Feature: Commands Editor from Source Control', () => {
  test('Step 5: Source control edit commands link', async () => {
    // Open explorer with source control filter
    const explorerBtn = page.locator('button[title*="Explorer"]')
    await explorerBtn.click()
    const explorerPanel = page.locator('[data-panel-id="explorer"]')
    await expect(explorerPanel).toBeVisible()

    // Switch to source control tab
    const scBtn = page.locator('button[title="Source Control"]')
    await scBtn.click()
    await expect(scBtn).toBeVisible()

    // Look for the "edit commands" text link in action buttons area
    const editLink = page.locator('[data-testid="edit-commands-link"]')
    const linkVisible = await editLink.isVisible().catch(() => false)

    if (linkVisible) {
      const explorer = page.locator('[data-panel-id="explorer"]')
      await screenshotElement(page, explorer, path.join(SCREENSHOTS, '05-sc-edit-commands.png'), {
        maxHeight: 400,
      })
      steps.push({
        screenshotPath: 'screenshots/05-sc-edit-commands.png',
        caption: 'Source control edit commands link',
        description:
          'When commands.json exists, an "edit commands" text link appears below the action buttons. ' +
          'Clicking it opens the commands editor in the file viewer area.',
      })
    } else {
      // If no commands.json, show the setup banner instead
      const explorer = page.locator('[data-panel-id="explorer"]')
      await screenshotElement(page, explorer, path.join(SCREENSHOTS, '05-sc-setup-banner.png'), {
        maxHeight: 400,
      })
      steps.push({
        screenshotPath: 'screenshots/05-sc-setup-banner.png',
        caption: 'Source control commands setup banner',
        description:
          'When no commands.json exists, a setup banner is shown. ' +
          'The "edit commands" link appears after commands.json is created.',
      })
    }
  })
})
