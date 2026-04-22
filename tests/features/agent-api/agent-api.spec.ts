/**
 * Feature Documentation: Agent API (Claude Agent SDK)
 *
 * Demonstrates the chat-based Agent SDK interface that replaces
 * xterm for Claude Code sessions configured with connectionMode: 'api'.
 *
 * Run with: pnpm test:feature-docs agent-api
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
      title: 'Agent API (Claude Agent SDK)',
      description:
        'Claude Code sessions can now use the Agent SDK for structured chat-based interaction ' +
        'instead of a PTY terminal. This eliminates xterm glitchiness and provides direct ' +
        'activity detection. Agents are configured with a connection mode (Terminal or API) ' +
        'in Settings. Other agents (Codex, Gemini, etc.) continue to use terminal mode.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: Agent API', () => {
  test('Step 1: Chat UI — initial empty state', async () => {
    const sidebar = page.locator('[data-panel-id="sidebar"]')
    await expect(sidebar).toBeVisible()

    const broomySession = page.locator('.cursor-pointer:has-text("broomy")')
    await expect(broomySession).toBeVisible()
    await broomySession.click()

    const agentPanel = page.locator('[data-panel-id="agent"]')
    await expect(agentPanel).toBeVisible()

    const chatInput = agentPanel.locator('textarea[placeholder*="Send a message"]')
    await expect(chatInput).toBeVisible({ timeout: 5000 })

    await page.screenshot({ path: path.join(SCREENSHOTS, '01-chat-empty.png') })
    steps.push({
      screenshotPath: 'screenshots/01-chat-empty.png',
      caption: 'Agent chat — empty state (API mode)',
      description:
        'When a Claude session uses API mode, the Agent tab shows a chat interface ' +
        'instead of an xterm terminal. The input area at the bottom accepts prompts ' +
        '(Enter to send, Shift+Enter for newline). ' +
        'Notice there is no xterm terminal — this is fully structured UI.',
    })
  })

  test('Step 2: Type a prompt', async () => {
    const agentPanel = page.locator('[data-panel-id="agent"]')
    const chatInput = agentPanel.locator('textarea[placeholder*="Send a message"]')

    await chatInput.fill('Fix the authentication bug in auth.py')
    await expect(chatInput).toHaveValue('Fix the authentication bug in auth.py')

    await page.screenshot({ path: path.join(SCREENSHOTS, '02-chat-with-prompt.png') })
    steps.push({
      screenshotPath: 'screenshots/02-chat-with-prompt.png',
      caption: 'Typing a prompt',
      description:
        'The user types their prompt in the text area at the bottom. The Send button activates ' +
        'when text is entered. Press Enter to send, or Shift+Enter for a newline.',
    })
  })

  test('Step 3: Submit and see response', async () => {
    const agentPanel = page.locator('[data-panel-id="agent"]')
    const chatInput = agentPanel.locator('textarea[placeholder*="Send a message"]')

    // Submit the prompt (Enter sends in the new behavior)
    await chatInput.press('Enter')

    // Wait for E2E mock result message to appear
    const resultBlock = agentPanel.locator('text=Task completed successfully.')
    await expect(resultBlock).toBeVisible({ timeout: 5000 })

    await page.screenshot({ path: path.join(SCREENSHOTS, '03-chat-response.png') })
    steps.push({
      screenshotPath: 'screenshots/03-chat-response.png',
      caption: 'Agent response with structured messages',
      description:
        'After submitting, the user\'s message appears right-aligned in blue. Claude responds ' +
        'with structured messages: a system init line (centered, gray), a text response, ' +
        'and a result summary block showing cost ($0.01), duration (2.0s), and turns (1). ' +
        'The input returns to idle, ready for the next prompt.',
    })
  })

  test('Step 4: Settings — connection mode configuration', async () => {
    const settingsBtn = page.locator('button[title*="Settings"]')
    await settingsBtn.click()

    const settingsPanel = page.locator('[data-panel-id="settings"]')
    await expect(settingsPanel).toBeVisible()

    await settingsPanel.locator('[data-testid="nav-agents"]').click()

    await expect(settingsPanel.locator('text=Claude Code')).toBeVisible({ timeout: 3000 })
    await expect(settingsPanel.locator('text=API')).toBeVisible()

    await screenshotElement(page, settingsPanel, path.join(SCREENSHOTS, '04-settings-agents.png'), {
      maxHeight: 700,
    })
    steps.push({
      screenshotPath: 'screenshots/04-settings-agents.png',
      caption: 'Agent list with API badge',
      description:
        'In Settings > Agents, each agent shows its name, command, and badges. ' +
        'Claude Code has an "API" badge indicating it uses the Agent SDK. ' +
        'An "auto" badge appears when the auto-approve flag is set.',
    })

    const editButton = settingsPanel.locator('button[title="Edit agent"]').first()
    await expect(editButton).toBeVisible()
    await editButton.click()

    await expect(settingsPanel.locator('text=Connection mode')).toBeVisible()

    await screenshotElement(page, settingsPanel, path.join(SCREENSHOTS, '05-settings-edit-agent.png'), {
      maxHeight: 700,
    })
    steps.push({
      screenshotPath: 'screenshots/05-settings-edit-agent.png',
      caption: 'Connection mode dropdown in agent editor',
      description:
        'When editing an agent, the "Connection mode" dropdown lets you choose between ' +
        '"Terminal (PTY)" for traditional terminal interaction or "API (Agent SDK)" for ' +
        'structured chat. API mode is the default for Claude Code.',
    })
  })
})
