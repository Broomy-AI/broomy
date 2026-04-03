/**
 * Feature Documentation: Agent Permission Prompts
 *
 * Demonstrates the tool permission approval flow for API-mode (Agent SDK)
 * sessions. When Claude tries to use a tool that requires permission, a
 * prompt appears in the chat UI allowing the user to Allow or Deny.
 *
 * Run with: pnpm test:feature-docs agent-permissions
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
  // Use marketing scenario which has agentId: 'claude' (API mode) sessions
  ;({ page } = await resetApp({
    scenario: 'marketing',
    agentResponses: [
      { match: 'edit the config', response: 'I\'ve updated the configuration file as requested.' },
      { match: 'delete logs', response: 'Log directory has been cleaned up.' },
    ],
    agentToolUses: [
      {
        match: 'edit the config',
        tools: [
          {
            toolName: 'Edit',
            toolInput: {
              file_path: '.claude/commands/validate.md',
              old_string: '## Steps\n\n1. Run `pnpm lint`.',
              new_string: '## Steps\n\n0. Run `pnpm install` to ensure dependencies are up to date.\n1. Run `pnpm lint`.',
            },
            decisionReason: 'This file is inside .claude/ which requires explicit permission.',
          },
        ],
      },
      {
        match: 'delete logs',
        tools: [
          {
            toolName: 'Bash',
            toolInput: { command: 'rm -rf /var/log/app/*.log' },
            decisionReason: 'Destructive shell command — removing log files.',
          },
        ],
      },
    ],
  }))
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'Agent Permission Prompts',
      description:
        'When an API-mode agent tries to use a tool that requires permission, Broomy displays ' +
        'an inline prompt showing the tool name, its input, and the reason permission is needed. ' +
        'The user can Allow or Deny each tool use. This works across all permission modes — ' +
        'Default prompts for everything, Accept Edits auto-allows file edits, and Bypass Permissions ' +
        'auto-allows all tools including protected ones like .claude/ files.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: Agent Permission Prompts', () => {
  test('Step 1: Send a prompt that triggers a tool requiring permission', async () => {
    const sidebar = page.locator('[data-panel-id="sidebar"]')
    await expect(sidebar).toBeVisible()

    // Click the backend-api session which uses agentId: 'claude' (API mode)
    const claudeSession = page.locator('.cursor-pointer:has-text("backend-api")')
    await expect(claudeSession).toBeVisible()
    await claudeSession.click()

    // Wait for chat input to be visible
    const chatInput = page.locator('textarea[placeholder*="Message"]:visible')
    await expect(chatInput).toBeVisible({ timeout: 5000 })

    // Type and send a prompt that will trigger a tool_use with permission
    await chatInput.fill('Please edit the config file in .claude')
    await chatInput.press('Enter')

    // Wait for the permission prompt to appear
    const permissionPrompt = page.locator('text=Claude wants to use')
    await expect(permissionPrompt).toBeVisible({ timeout: 5000 })

    await page.screenshot({ path: path.join(SCREENSHOTS, '01-permission-prompt.png') })
    steps.push({
      screenshotPath: 'screenshots/01-permission-prompt.png',
      caption: 'Permission prompt appears for a protected tool',
      description:
        'Claude attempted to edit a file inside .claude/commands/ which requires explicit ' +
        'permission. The yellow-bordered prompt shows the tool name (Edit), its input ' +
        '(the file path and changes), and the reason permission is needed. ' +
        'Three options: "Allow" (one-time), "Always allow Edit" (persists to ' +
        '.claude/settings.local.json so future Edit tool uses are auto-approved), or "Deny".',
    })
  })

  test('Step 2: Allow the tool use', async () => {
    // Click the "Allow" button (exact text, not "Always allow")
    const allowButton = page.locator('button:visible', { hasText: /^Allow$/ })
    await expect(allowButton).toBeVisible()
    await allowButton.click()

    // Wait for the agent's text response to appear (mock responds after tool is allowed)
    const agentResponse = page.locator('p:has-text("I\'ve updated the configuration file")')
    await expect(agentResponse).toBeVisible({ timeout: 5000 })

    // Permission prompt should be gone
    const permissionPrompt = page.locator('text=Claude wants to use')
    await expect(permissionPrompt).not.toBeVisible()

    await page.screenshot({ path: path.join(SCREENSHOTS, '02-tool-allowed.png') })
    steps.push({
      screenshotPath: 'screenshots/02-tool-allowed.png',
      caption: 'Tool allowed — agent completes successfully',
      description:
        'After clicking "Allow", the tool executes and the agent continues. ' +
        'The Edit diff is shown inline with the file path, and Claude\'s response ' +
        'confirms the update. The result summary shows cost and duration. ' +
        'The permission prompt disappears and the chat input returns to idle.',
    })
  })

  test('Step 3: Send a prompt and deny the tool', async () => {
    const chatInput = page.locator('textarea[placeholder*="Message"]:visible')

    // Send a different prompt that triggers a dangerous tool
    await chatInput.fill('Please delete logs from the server')
    await chatInput.press('Enter')

    // Wait for permission prompt
    const permissionPrompt = page.locator('text=Claude wants to use').last()
    await expect(permissionPrompt).toBeVisible({ timeout: 5000 })

    await page.screenshot({ path: path.join(SCREENSHOTS, '03-deny-permission.png') })
    steps.push({
      screenshotPath: 'screenshots/03-deny-permission.png',
      caption: 'Permission prompt for a destructive command',
      description:
        'Claude wants to run `rm -rf /var/log/app/*.log` via the Bash tool. ' +
        'The prompt shows the full command and the reason: "Destructive shell command — ' +
        'removing log files." For Bash commands, "Always allow rm" would persist Bash(rm) ' +
        'to .claude/settings.local.json, allowing all future `rm` commands with any arguments.',
    })

    // Click Deny
    const denyButton = page.locator('button:has-text("Deny"):visible')
    await expect(denyButton).toBeVisible()
    await denyButton.click()

    // Wait for the result stats to appear (agent finishes after deny)
    const resultStats = page.locator('text=1.0s').last()
    await expect(resultStats).toBeVisible({ timeout: 5000 })

    await page.screenshot({ path: path.join(SCREENSHOTS, '04-tool-denied.png') })
    steps.push({
      screenshotPath: 'screenshots/04-tool-denied.png',
      caption: 'Tool denied — agent stops gracefully',
      description:
        'After clicking "Deny", the tool is blocked and the agent stops with ' +
        '"Task stopped — permission denied." The destructive command was never executed. ' +
        'The user can then send a new message to redirect the agent.',
    })
  })

  test('Step 4: Permission mode selector', async () => {
    // Screenshot the bottom of the visible agent panel showing the permission mode dropdown
    const agentPanel = page.locator('[data-panel-id="agent"]')
    await screenshotElement(page, agentPanel, path.join(SCREENSHOTS, '05-permission-modes.png'), {
      maxHeight: 200,
      fromBottom: true,
    })
    steps.push({
      screenshotPath: 'screenshots/05-permission-modes.png',
      caption: 'Permission mode selector in the chat input toolbar',
      description:
        'The toolbar below the chat input includes a permission mode dropdown. ' +
        'Options: Default (prompt for all tools), Accept Edits (auto-allow file edits), ' +
        'Bypass Permissions (auto-allow everything), Plan Only (only plan tools), ' +
        'and Don\'t Ask (auto-deny all). Changing the mode takes effect on the next message.',
    })
  })
})
