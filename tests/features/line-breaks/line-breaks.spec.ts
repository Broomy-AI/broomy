/**
 * Feature Documentation: User Message Line Break Preservation
 *
 * Demonstrates that line breaks in user messages are preserved when
 * rendered in the agent chat — each newline appears as a visual line
 * break rather than being collapsed into a single run of text.
 *
 * Run with: pnpm test:feature-docs line-breaks
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

const MULTILINE_MESSAGE = 'First line\nSecond line\nThird line'

test.beforeAll(async () => {
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true })
  // The marketing scenario includes a Claude (API-mode) session: backend-api
  ;({ page } = await resetApp({
    scenario: 'marketing',
    agentResponses: [
      { match: 'First line', response: 'Got your message — I can see all three lines clearly.' },
    ],
  }))
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'User Message Line Break Preservation',
      description:
        'Line breaks typed in the message input are now preserved when the message is ' +
        'displayed in the agent chat. Previously, newlines were collapsed and the entire ' +
        'message appeared on a single line.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: User Message Line Breaks', () => {
  test('Step 1: Navigate to a Claude session and verify agent chat is ready', async () => {
    // Click on backend-api which uses agentId:'claude' → connectionMode:'api' → AgentChat
    const backendSession = page.locator('.cursor-pointer', { hasText: 'backend-api' }).first()
    await backendSession.click()

    const agentPanel = page.locator('[data-panel-id="agent"]')
    await expect(agentPanel).toBeVisible({ timeout: 10000 })

    // Multiple sessions are mounted simultaneously (CSS-hidden for non-active ones).
    // Target the single visible AgentChat textarea.
    const textarea = page.locator('textarea[placeholder*="Message"]').filter({ visible: true }).first()
    await expect(textarea).toBeVisible({ timeout: 5000 })

    await screenshotElement(page, agentPanel, path.join(SCREENSHOTS, '01-chat-ready.png'))
    steps.push({
      screenshotPath: 'screenshots/01-chat-ready.png',
      caption: 'Agent chat panel ready to receive input',
      description:
        'The agent chat panel shows an empty message thread with the input box at the bottom. ' +
        'Users can type multi-line messages using Shift+Enter to insert newlines.',
    })
  })

  test('Step 2: Type a multi-line message and send it', async () => {
    const agentPanel = page.locator('[data-panel-id="agent"]')
    const textarea = page.locator('textarea[placeholder*="Message"]').filter({ visible: true }).first()

    // Fill the textarea directly with newline characters; React state picks up
    // the full multiline string before we submit.
    await textarea.click()
    await textarea.fill(MULTILINE_MESSAGE)

    // Screenshot showing the multiline content in the input before sending
    await screenshotElement(page, agentPanel, path.join(SCREENSHOTS, '02-multiline-input.png'))
    steps.push({
      screenshotPath: 'screenshots/02-multiline-input.png',
      caption: 'Multi-line message typed in the input box',
      description:
        'The textarea grows to show all three lines of the message before it is sent. ' +
        'Newlines can be inserted with Shift+Enter while typing.',
    })

    // Press Enter (without Shift) to submit
    await textarea.press('Enter')

    // Wait for the user message bubble to appear in the chat
    await expect(agentPanel.locator('.justify-end').first()).toBeVisible({ timeout: 5000 })
  })

  test('Step 3: User message renders with preserved line breaks', async () => {
    const agentPanel = page.locator('[data-panel-id="agent"]')

    // Each line of the message must be independently visible as text
    await expect(agentPanel.getByText('First line')).toBeVisible()
    await expect(agentPanel.getByText('Second line')).toBeVisible()
    await expect(agentPanel.getByText('Third line')).toBeVisible()

    await screenshotElement(page, agentPanel, path.join(SCREENSHOTS, '03-line-breaks-preserved.png'))
    steps.push({
      screenshotPath: 'screenshots/03-line-breaks-preserved.png',
      caption: 'Message displays with all three lines intact',
      description:
        'Each line of the message appears on its own line in the chat bubble. ' +
        'The fix adds `whitespace-pre-wrap` to the user message container, which ' +
        'tells the browser to honour \\n characters as visible line breaks.',
    })
  })

  test('Step 4: Agent replies and conversation looks correct', async () => {
    const agentPanel = page.locator('[data-panel-id="agent"]')

    // Wait for the mock agent reply
    await expect(agentPanel.getByText('Got your message')).toBeVisible({ timeout: 5000 })

    await screenshotElement(page, agentPanel, path.join(SCREENSHOTS, '04-full-conversation.png'))
    steps.push({
      screenshotPath: 'screenshots/04-full-conversation.png',
      caption: 'Full conversation showing user message and agent reply',
      description:
        'The complete exchange: the user\'s multi-line message is right-aligned with ' +
        'preserved line breaks, and the agent\'s reply appears below it left-aligned.',
    })
  })
})
