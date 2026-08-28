/**
 * Feature Documentation: Template Variables
 *
 * Documents the template variable registry and its picker modal across all four
 * surfaces that accept variables: commands.json templates, the expanded command
 * editor, the agent command, and the per-repo init script.
 *
 * Two syntaxes, chosen by target. Data targets ({} form) are never parsed by a
 * shell; shell targets ($BROOMY_ form) receive values as environment variables
 * so GitHub-controlled titles cannot be spliced into a command line.
 *
 * Run with: pnpm test:feature-docs template-vars
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

async function openSettings() {
  const settingsButton = page.locator('button[title^="Settings"]')
  await settingsButton.click()
  await page.waitForSelector('[data-panel-id="settings"]', { state: 'visible', timeout: 5000 })
}

/** The picker dialog, once opened from any surface. */
function varsDialog() {
  return page.getByRole('dialog', { name: 'Template variables' })
}

test.beforeAll(async () => {
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true })
  ;({ page } = await resetApp())
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'Template Variables',
      description:
        'Command templates can inject session state — the current branch, PR, issue, repo, and ' +
        'stage — via 14 variables defined in one registry. A searchable picker makes them ' +
        'discoverable from every surface that accepts them, showing each variable\'s description ' +
        'and its current live value, and inserting it at the cursor. ' +
        'The syntax depends on the target: data targets (commands.json templates, agent env ' +
        'values) use {name}, while shell targets (the agent command, the repo init script) use ' +
        '$BROOMY_NAME. That split is deliberate — PR and issue titles carry GitHub-controlled ' +
        'text, and passing them as environment variables keeps them inert data rather than ' +
        'splicing them into a command line.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: Template Variables', () => {
  test('Step 1: The commands editor exposes a Vars button', async () => {
    await openCommandsEditor()
    await expect(page.getByRole('tab', { name: /user/i })).toBeVisible()

    // Select the first command so the detail pane renders.
    await page.locator('button:has(.text-2xs.font-mono)').first().click()

    const varsButton = page.getByTestId('open-template-vars')
    await expect(varsButton).toBeVisible()

    const editor = page.getByRole('tab', { name: /user/i })
      .locator('xpath=ancestor::div[contains(@class, "h-full")][1]').first()
    await screenshotElement(page, editor, path.join(SCREENSHOTS, '01-vars-button.png'), {
      maxHeight: 720,
    })
    steps.push({
      screenshotPath: 'screenshots/01-vars-button.png',
      caption: 'A "{} Vars" button sits beside Expand on the Command field',
      description:
        'Previously the only hint that variables existed was a line of help text. The Command ' +
        'field now carries a "{} Vars" button next to "⤢ Expand", so the available variables are ' +
        'one click away while you are writing the template.',
    })
  })

  test('Step 2: The picker lists every variable, grouped, with live values', async () => {
    await page.getByTestId('open-template-vars').click()

    const dialog = varsDialog()
    await expect(dialog).toBeVisible()

    // Grouped by section, in registry order.
    await expect(dialog.getByText('Repo', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Pull request', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Issue', { exact: true })).toBeVisible()

    // Data surface, so the {} form.
    await expect(dialog.getByText('{branch}')).toBeVisible()
    await expect(dialog.getByText('{prTitle}')).toBeVisible()

    await screenshotElement(page, dialog, path.join(SCREENSHOTS, '02-picker-open.png'), {
      maxHeight: 720,
    })
    steps.push({
      screenshotPath: 'screenshots/02-picker-open.png',
      caption: 'All 14 variables, grouped by Repo / Branch / Pull request / Issue / Session',
      description:
        'Each row shows the variable, a one-line description, and its current value on the right ' +
        'resolved against the active session — so you can see what a template will actually ' +
        'produce before saving it. A variable with no value right now reads as "—". Values come ' +
        'from the same function the runtime uses, so the picker and the resolved command can ' +
        'never disagree.',
    })
  })

  test('Step 3: Search narrows the list', async () => {
    const dialog = varsDialog()
    await dialog.getByPlaceholder('Search variables…').fill('issue')

    await expect(dialog.getByText('{issueTitle}')).toBeVisible()
    await expect(dialog.getByText('{branch}')).toHaveCount(0)

    await screenshotElement(page, dialog, path.join(SCREENSHOTS, '03-picker-search.png'), {
      maxHeight: 720,
    })
    steps.push({
      screenshotPath: 'screenshots/03-picker-search.png',
      caption: 'Searching filters on name, env name, and description',
      description:
        'Typing "issue" narrows the list to the Issue group. The search matches the variable ' +
        'name, its BROOMY_ environment name, and the description text, so you can find a ' +
        'variable by what it does rather than what it is called.',
    })

    await dialog.getByPlaceholder('Search variables…').fill('')
  })

  test('Step 4: Clicking a variable inserts it at the cursor', async () => {
    const dialog = varsDialog()
    await dialog.getByText('{branch}').click()

    // Dialog closes on insert.
    await expect(dialog).toHaveCount(0)

    const commandField = page.getByTestId('command-template-field')
    await expect(commandField).toHaveValue(/\{branch\}/)

    const editor = page.getByRole('tab', { name: /user/i })
      .locator('xpath=ancestor::div[contains(@class, "h-full")][1]').first()
    await screenshotElement(page, editor, path.join(SCREENSHOTS, '04-inserted.png'), {
      maxHeight: 720,
    })
    steps.push({
      screenshotPath: 'screenshots/04-inserted.png',
      caption: 'The variable lands at the caret, not appended to the end',
      description:
        'Clicking a row splices the variable in at the cursor position, replacing any selection, ' +
        'then restores focus with the caret placed after the inserted text — so you can keep ' +
        'typing. Because the name is now a reserved context variable, it is filled in ' +
        'automatically at run time and does not appear in the Args table below as a prompted ' +
        'argument.',
    })
  })

  test('Step 5: The expanded editor has the same picker', async () => {
    await page.getByTestId('expand-command').click()
    await expect(page.getByTestId('expanded-command-textarea')).toBeVisible()

    await page.getByTestId('open-template-vars-expanded').click()
    const dialog = varsDialog()
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('{repoName}')).toBeVisible()

    await screenshotElement(page, dialog, path.join(SCREENSHOTS, '05-expanded-editor.png'), {
      maxHeight: 720,
    })
    steps.push({
      screenshotPath: 'screenshots/05-expanded-editor.png',
      caption: 'The expanded editor gets the same picker, in the same {} syntax',
      description:
        'Long multi-line templates are edited in the expanded pane, which carries its own ' +
        '"{} Vars" button in the footer. It shares one component and one registry with the ' +
        'inline field, so the two can never drift apart.',
    })

    // Close the picker and the expanded editor.
    await dialog.getByTestId('close-template-vars').click()
    await page.getByTestId('close-expanded-command').click()
  })

  test('Step 6: The agent command uses the $BROOMY_ form', async () => {
    await openSettings()
    const settingsPanel = page.locator('[data-panel-id="settings"]')

    await settingsPanel.getByTestId('nav-agents').click()
    await settingsPanel.locator('button[title="Edit agent"]').first().click()
    await expect(settingsPanel.locator('input[placeholder="Command (e.g., claude)"]')).toBeVisible({ timeout: 5000 })

    await page.getByTestId('open-template-vars-agent-command').first().click()
    const dialog = varsDialog()
    await expect(dialog).toBeVisible()

    // Shell target, so the $BROOMY_ form rather than {}.
    await expect(dialog.getByText('$BROOMY_BRANCH')).toBeVisible()
    await expect(dialog.getByText('{branch}')).toHaveCount(0)

    await screenshotElement(page, dialog, path.join(SCREENSHOTS, '06-agent-command.png'), {
      maxHeight: 720,
    })
    steps.push({
      screenshotPath: 'screenshots/06-agent-command.png',
      caption: 'The agent command surface offers $BROOMY_BRANCH, not {branch}',
      description:
        'The agent command is a command line handed to a shell, so the picker inserts the ' +
        'environment variable form. Broomy exports every variable into the agent terminal, ' +
        'letting you write something like: claude --append-system-prompt "$BROOMY_ISSUE_TITLE". ' +
        'The quoting is yours to control, and an issue titled with backticks stays inert text ' +
        'instead of executing. Settings has no session in scope, so live values read as "—", ' +
        'and the footer notes that PR values are empty until the branch has a PR.',
    })

    await dialog.getByTestId('close-template-vars').click()
    await settingsPanel.locator('button:text-is("Cancel")').click()
    await settingsPanel.getByTestId('settings-back').click()
  })

  test('Step 7: The repo init script dims variables that cannot exist yet', async () => {
    const settingsPanel = page.locator('[data-panel-id="settings"]')
    await settingsPanel.locator('[data-testid^="nav-repo-"]').first().click()
    await expect(settingsPanel.locator('text=Init Script (runs when session starts)')).toBeVisible({ timeout: 5000 })

    await page.getByTestId('open-template-vars-init-script').click()
    const dialog = varsDialog()
    await expect(dialog).toBeVisible()

    await expect(dialog.getByText('$BROOMY_PR_TITLE')).toBeVisible()
    await expect(dialog.getByText('not set at init time').first()).toBeVisible()

    await screenshotElement(page, dialog, path.join(SCREENSHOTS, '07-init-script.png'), {
      maxHeight: 720,
    })
    steps.push({
      screenshotPath: 'screenshots/07-init-script.png',
      caption: 'PR and session variables are dimmed here, with the reason spelled out',
      description:
        'The init script runs while the worktree is being created — before the session object ' +
        'exists and before any PR does. Rather than silently offering variables that would ' +
        'always resolve to nothing, the picker dims those rows, makes them non-insertable, and ' +
        'says why: "not set at init time". Branch, directory, folder name, repo ' +
        'name and root, and the issue variables all populate normally.',
    })

    await dialog.getByTestId('close-template-vars').click()
  })

  test('Step 8: Inserting into the init script', async () => {
    const settingsPanel = page.locator('[data-panel-id="settings"]')
    const textarea = settingsPanel.locator('textarea[placeholder*="Commands to run when starting"]')
    await expect(textarea).toBeVisible()

    await textarea.fill('echo Setting up ')
    await page.getByTestId('open-template-vars-init-script').click()
    await varsDialog().getByText('$BROOMY_BRANCH').click()

    await expect(textarea).toHaveValue(/\$BROOMY_BRANCH/)

    await screenshotElement(page, settingsPanel, path.join(SCREENSHOTS, '08-init-script-inserted.png'), {
      maxHeight: 700,
    })
    steps.push({
      screenshotPath: 'screenshots/08-init-script-inserted.png',
      caption: 'The script reads session state from the environment',
      description:
        'The helper text under the field states the contract: session details arrive as ' +
        'environment variables. Every variable is exported even when empty, so a script can ' +
        'safely use a shell default like ${BROOMY_ISSUE_NUMBER:-none}. Five separate call sites ' +
        'used to run this script with duplicated code; they now share one helper, so the ' +
        'variables reached all of them in a single change.',
    })
  })
})
