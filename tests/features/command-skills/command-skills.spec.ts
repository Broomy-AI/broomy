/**
 * Feature Documentation: Command Skills (v2)
 *
 * Documents the reworked action-button system: user-level commands.json,
 * one-line slash-command templates with auto-detected args, the two-column
 * editor with User / Project tabs, and the args table that grows from
 * template placeholders.
 *
 * Run with: pnpm test:feature-docs command-skills
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

async function openSourceControl() {
  const explorerButton = page.locator('[data-panel-id="explorer-toggle"], [title*="Explorer"]').first()
  if (await explorerButton.isVisible()) {
    const cls = await explorerButton.getAttribute('class').catch(() => '')
    if (!cls?.includes('bg-accent')) {
      await explorerButton.click()
      await expect(page.locator('[data-panel-id="explorer"]')).toBeVisible()
    }
  }

  await page.evaluate(() => {
    const store = (window as Record<string, unknown>).__sessionStore as {
      getState: () => { activeSessionId: string; setExplorerFilter: (id: string, filter: string) => void }
    }
    if (!store) return
    const state = store.getState()
    state.setExplorerFilter(state.activeSessionId, 'source-control')
  })
  await expect(page.locator('[data-panel-id="explorer"]')).toBeVisible()
}

async function openCommandsEditor() {
  await page.evaluate(() => {
    const store = (window as Record<string, unknown>).__sessionStore as {
      getState: () => {
        activeSessionId: string
        sessions: { id: string; directory: string }[]
        openCommandsEditor: (sessionId: string, directory: string) => void
      }
    }
    if (!store) return
    const state = store.getState()
    const session = state.sessions.find(s => s.id === state.activeSessionId)
    if (session) state.openCommandsEditor(state.activeSessionId, session.directory)
  })
}

test.beforeAll(async () => {
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true })
  ;({ page } = await resetApp())
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'Command Skills',
      description:
        'A reworked action-button system. Commands live in ~/.broomy/commands.json (with ' +
        'optional per-repo additions in <repo>/.broomy/commands.json), are written as one-line ' +
        'templates that can be slash commands (/review) or natural-language prompts (Commit ' +
        'the current changes…), and are gated by git/PR state plus a session-level "stage" string. ' +
        'A placeholder like {topic} in the template makes the button open an arg dialog before ' +
        'sending. The editor is a two-column User / Project view that drives both files.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: Command Skills', () => {
  test('Step 1: Action buttons from the Basics pack', async () => {
    await openSourceControl()

    const explorer = page.locator('[data-panel-id="explorer"]')
    await expect(explorer.getByText('Commit').first()).toBeVisible()

    await screenshotElement(page, explorer, path.join(SCREENSHOTS, '01-source-control.png'), {
      maxHeight: 700,
    })
    steps.push({
      screenshotPath: 'screenshots/01-source-control.png',
      caption: 'Action buttons rendered from the user-level Basics pack',
      description:
        'With the Basics pack installed at ~/.broomy/commands.json, the source-control panel ' +
        'shows only the buttons whose showWhen conditions match the current git state — here ' +
        'a dirty working tree shows just "Commit". An "edit commands" link below the buttons ' +
        'opens the editor.',
    })
  })

  test('Step 2: Open the editor via the "edit commands" link', async () => {
    await openCommandsEditor()

    await expect(page.getByRole('tab', { name: /user/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /project/i })).toBeVisible()

    const editor = page.getByRole('tab', { name: /user/i })
      .locator('xpath=ancestor::div[contains(@class, "h-full")][1]').first()
    await screenshotElement(page, editor, path.join(SCREENSHOTS, '02-editor-user-tab.png'), {
      maxHeight: 720,
    })
    steps.push({
      screenshotPath: 'screenshots/02-editor-user-tab.png',
      caption: 'Two-column editor with User / Project tabs',
      description:
        'Tabs at the top switch between editing ~/.broomy/commands.json (User) and ' +
        '<repo>/.broomy/commands.json (Project). The left column lists each command with the ' +
        'friendly label on top and a slash-subtitle or template fragment below. Right side ' +
        'is empty until a row is selected.',
    })
  })

  test('Step 3: Selecting a command populates the detail pane', async () => {
    const reviewRow = page.locator('button:has-text("/review")').first()
    await expect(reviewRow).toBeVisible({ timeout: 5000 })
    await reviewRow.click()

    const editor = page.getByRole('tab', { name: /user/i })
      .locator('xpath=ancestor::div[contains(@class, "h-full")][1]').first()
    await screenshotElement(page, editor, path.join(SCREENSHOTS, '03-editor-detail.png'), {
      maxHeight: 720,
    })
    steps.push({
      screenshotPath: 'screenshots/03-editor-detail.png',
      caption: 'Detail pane after selecting the Review command',
      description:
        'Selecting "/review" populates the right pane with editable Label, Description, and ' +
        'Command fields, followed by Show When conditions, Stages, Set stage, Style, Surface, ' +
        'Switch tab, and a Delete action. Each command in the list shows its slash-command form ' +
        '(/review) or a fragment of its natural-language template (Pull the latest from {main}…).',
    })
  })

  test('Step 4: Editing the template grows the args table live', async () => {
    // Locate the Command input by its current value (Review was selected → /review).
    const commandInput = page.locator('input[value="/review"]').first()
    await expect(commandInput).toBeVisible()
    await commandInput.fill('/review {topic}')

    // The args table should now show a row for "topic".
    const argsHeading = page.getByText(/Arguments \(1 detected\)/i)
    await expect(argsHeading).toBeVisible({ timeout: 5000 })
    // Scroll the args heading into view so the table is captured.
    await argsHeading.scrollIntoViewIfNeeded()

    const editor = page.getByRole('tab', { name: /user/i })
      .locator('xpath=ancestor::div[contains(@class, "h-full")][1]').first()
    await screenshotElement(page, editor, path.join(SCREENSHOTS, '04-args-table.png'), {
      maxHeight: 720,
    })
    steps.push({
      screenshotPath: 'screenshots/04-args-table.png',
      caption: 'Args table auto-detected from {topic} placeholder',
      description:
        'Typing a {placeholder} into the Command field instantly adds a row to the Arguments ' +
        'table where the author can fill in a description and a default. At runtime the ' +
        'description becomes help text in the arg dialog and the default pre-fills the field.',
    })

    // Restore the template to /review for the next step.
    await page.locator('input[value="/review {topic}"]').first().fill('/review')
  })

  test('Step 5: Project tab shows "Add project commands" CTA when no file exists', async () => {
    const projectTab = page.getByRole('tab', { name: /project/i })
    await projectTab.click()

    // The tab switch prompts if dirty — accept (Save) or dismiss; either way proceed.
    // (The dirty modal is custom in CommandsEditor; click the Save or Discard if present.)
    const discardBtn = page.getByRole('button', { name: /discard/i }).first()
    if (await discardBtn.isVisible().catch(() => false)) {
      await discardBtn.click()
    }

    await expect(page.getByRole('button', { name: /add project commands/i })).toBeVisible()

    const editor = page.getByRole('tab', { name: /project/i })
      .locator('xpath=ancestor::div[contains(@class, "h-full")][1]').first()
    await screenshotElement(page, editor, path.join(SCREENSHOTS, '05-project-empty.png'), {
      maxHeight: 600,
    })
    steps.push({
      screenshotPath: 'screenshots/05-project-empty.png',
      caption: 'Project tab with no per-repo commands file',
      description:
        'Switching to the Project tab when <repo>/.broomy/commands.json does not exist shows a ' +
        'single "Add project commands" CTA. Clicking it creates an empty actions array the user ' +
        'can populate; saved project actions are concatenated onto the user list at render time.',
    })
  })
})
