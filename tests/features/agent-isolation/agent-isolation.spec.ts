/**
 * Feature Documentation: Agent Container Isolation
 *
 * Demonstrates per-repo container isolation with two modes: lightweight Docker
 * and dev containers. Exercises the settings UI flow (repo settings, mode selector,
 * agent auto-approve flag) and the mixed local/container terminal tabs.
 *
 * Run with: pnpm test:feature-docs agent-isolation
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

/** Helper to open settings panel */
async function openSettings() {
  const settingsButton = page.locator('button[title^="Settings"]')
  await settingsButton.click()
  await page.waitForSelector('[data-panel-id="settings"]', { state: 'visible', timeout: 5000 })
}

test.beforeAll(async () => {
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true })
  ;({ page } = await resetApp())
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'Agent Container Isolation',
      description:
        'Broomy supports optional container isolation configured per repository. ' +
        'Two modes are available: Lightweight Docker (fast, minimal — uses node:22-slim) ' +
        'and Dev Container (uses .devcontainer/devcontainer.json for declarative environment setup). ' +
        'When enabled, agent sessions run inside containers with access only to the repo directory. ' +
        'Agents can define an auto-approve flag that gets appended to the command when ' +
        'the repo has auto-approve enabled.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: Agent Container Isolation', () => {
  test('Step 1: Open settings — view agents with auto-approve flag field', async () => {
    await openSettings()

    const settingsPanel = page.locator('[data-panel-id="settings"]')
    await expect(settingsPanel).toBeVisible()

    // Wait for agents section to render
    await expect(settingsPanel.locator('text=Agents')).toBeVisible()

    // Verify agents exist
    await expect(settingsPanel.locator('text=Claude Code')).toBeVisible()

    await screenshotElement(page, settingsPanel, path.join(SCREENSHOTS, '01-settings-agents.png'), {
      maxHeight: 700,
    })
    steps.push({
      screenshotPath: 'screenshots/01-settings-agents.png',
      caption: 'Agent list in settings — isolation is configured per-repo, not per-agent',
      description:
        'The settings panel shows all configured agents. Agent rows show an "auto" badge ' +
        'when the agent has a skip-approval flag defined. Isolation settings are configured ' +
        'per-repo in the repository settings below.',
    })
  })

  test('Step 2: Edit agent to see skip-approval flag field', async () => {
    const settingsPanel = page.locator('[data-panel-id="settings"]')

    // Click the edit button on Claude Code agent row
    const claudeRow = settingsPanel.locator('div:has(> div > div > .font-medium:text-is("Claude Code"))')
    const editButton = claudeRow.locator('button[title="Edit agent"]')
    await editButton.click()

    // Wait for edit form to appear
    await expect(settingsPanel.locator('input[value="Claude Code"]')).toBeVisible({ timeout: 3000 })

    // Verify the auto-approve flag input is visible
    await expect(settingsPanel.locator('text=Auto-approve flag')).toBeVisible()

    await screenshotElement(page, settingsPanel, path.join(SCREENSHOTS, '02-agent-edit-form.png'), {
      maxHeight: 700,
    })
    steps.push({
      screenshotPath: 'screenshots/02-agent-edit-form.png',
      caption: 'Agent edit form with auto-approve flag text input',
      description:
        'The agent edit form has a text input for the auto-approve flag ' +
        '(e.g., "--dangerously-skip-permissions"). This flag is appended to the command ' +
        'when the repo has auto-approve enabled.',
    })

    // Cancel the edit
    const cancelButton = settingsPanel.locator('button:text-is("Cancel")')
    await cancelButton.click()
  })

  test('Step 3: Open repo settings — isolation checkbox and mode selector', async () => {
    const settingsPanel = page.locator('[data-panel-id="settings"]')

    // Wait for repos section
    await expect(settingsPanel.locator('text=Repositories')).toBeVisible()

    // Find the edit button for the demo-project repo
    const editButton = settingsPanel.locator('button[title="Edit repo settings"]').first()
    await expect(editButton).toBeVisible()
    await editButton.click()

    // Wait for repo settings editor to appear
    await expect(settingsPanel.locator('text=Run agent in isolated container')).toBeVisible({ timeout: 3000 })

    await screenshotElement(page, settingsPanel, path.join(SCREENSHOTS, '03-repo-settings.png'), {
      maxHeight: 700,
    })
    steps.push({
      screenshotPath: 'screenshots/03-repo-settings.png',
      caption: 'Repo settings editor with isolation and auto-approve checkboxes',
      description:
        'Clicking edit on a repository opens the repo settings editor. Below the default agent ' +
        'selector and approve-and-merge checkbox, two isolation settings appear: ' +
        '"Run agent in isolated container" and "Auto-approve agent commands".',
    })
  })

  test('Step 4: Enable isolation — mode selector with Lightweight Docker selected', async () => {
    const settingsPanel = page.locator('[data-panel-id="settings"]')

    // Check the isolation checkbox
    const isolationCheckbox = settingsPanel.locator('label:has-text("Run agent in isolated container") input[type="checkbox"]')
    await isolationCheckbox.check()

    // Mode selector should appear with Lightweight Docker and Dev Container options
    await expect(settingsPanel.locator('text=Lightweight Docker')).toBeVisible({ timeout: 3000 })
    await expect(settingsPanel.locator('text=Dev Container')).toBeVisible({ timeout: 3000 })

    // Docker image input should appear (Lightweight Docker is default)
    const imageInput = settingsPanel.locator('input[placeholder="node:22-slim"]')
    await expect(imageInput).toBeVisible({ timeout: 3000 })

    // Docker status indicator should appear (mocked as available in E2E)
    await expect(settingsPanel.locator('text=Docker available')).toBeVisible({ timeout: 5000 })

    await screenshotElement(page, settingsPanel, path.join(SCREENSHOTS, '04-docker-mode.png'), {
      maxHeight: 700,
    })
    steps.push({
      screenshotPath: 'screenshots/04-docker-mode.png',
      caption: 'Lightweight Docker mode — image input and Docker status indicator',
      description:
        'After enabling isolation, a mode selector appears with two options: Lightweight Docker ' +
        'and Dev Container. Lightweight Docker is selected by default, showing a Docker image ' +
        'input (placeholder: "node:22-slim") and a green status dot confirming Docker is available.',
    })
  })

  test('Step 5: Switch to Dev Container mode — CLI status shown', async () => {
    const settingsPanel = page.locator('[data-panel-id="settings"]')

    // Click the Dev Container radio button
    const devcontainerRadio = settingsPanel.locator('label:has-text("Dev Container") input[type="radio"]')
    await devcontainerRadio.check()

    // devcontainer CLI status should appear (mocked as available in E2E)
    await expect(settingsPanel.locator('text=devcontainer CLI')).toBeVisible({ timeout: 5000 })

    await screenshotElement(page, settingsPanel, path.join(SCREENSHOTS, '05-devcontainer-mode.png'), {
      maxHeight: 700,
    })
    steps.push({
      screenshotPath: 'screenshots/05-devcontainer-mode.png',
      caption: 'Dev Container mode — CLI status and config detection',
      description:
        'Switching to Dev Container mode replaces the Docker image input with devcontainer-specific ' +
        'status indicators: whether the devcontainer CLI is installed and whether a ' +
        '.devcontainer/devcontainer.json exists in the repo. If no config is found, a ' +
        '"Generate default" link creates one with Node.js, Git, and GitHub CLI features.',
    })
  })

  test('Step 6: Switch back to Docker — enable auto-approve safely', async () => {
    const settingsPanel = page.locator('[data-panel-id="settings"]')

    // Switch back to Docker mode
    const dockerRadio = settingsPanel.locator('label:has-text("Lightweight Docker") input[type="radio"]')
    await dockerRadio.check()

    // Check auto-approve
    const skipCheckbox = settingsPanel.locator('label:has-text("Auto-approve agent commands") input[type="checkbox"]')
    await skipCheckbox.check()

    // No warning should show since isolation is enabled
    await expect(settingsPanel.locator('text=unrestricted access')).not.toBeVisible()

    await screenshotElement(page, settingsPanel, path.join(SCREENSHOTS, '06-auto-approve-safe.png'), {
      maxHeight: 700,
    })
    steps.push({
      screenshotPath: 'screenshots/06-auto-approve-safe.png',
      caption: 'Auto-approve with isolation enabled — safe, no warning',
      description:
        'With both container isolation and auto-approve enabled, no warning is shown. ' +
        'This is the recommended safe configuration: agents run at full speed inside ' +
        'a sandboxed container.',
    })
  })

  test('Step 7: Disable isolation — warning for unsafe auto-approve', async () => {
    const settingsPanel = page.locator('[data-panel-id="settings"]')

    // Uncheck isolation while auto-approve remains checked
    const isolationCheckbox = settingsPanel.locator('label:has-text("Run agent in isolated container") input[type="checkbox"]')
    await isolationCheckbox.uncheck()

    // Warning should appear
    await expect(settingsPanel.locator('text=unrestricted access')).toBeVisible({ timeout: 3000 })

    await screenshotElement(page, settingsPanel, path.join(SCREENSHOTS, '07-warning.png'), {
      maxHeight: 700,
    })
    steps.push({
      screenshotPath: 'screenshots/07-warning.png',
      caption: 'Warning when auto-approve is enabled without container isolation',
      description:
        'Disabling container isolation while auto-approve remains checked triggers a ' +
        'yellow warning: agents will have unrestricted access to the machine. ' +
        'This guides users toward enabling container isolation for safe auto-approval.',
    })

    // Re-enable isolation and cancel
    await isolationCheckbox.check()
    const cancelButton = settingsPanel.locator('button:text-is("Cancel")')
    await cancelButton.click()
  })
})
