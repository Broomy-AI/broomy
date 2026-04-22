/**
 * Feature Documentation: Mid-Turn Message Injection
 *
 * Demonstrates that pressing Enter while the agent is working queues the
 * message immediately — it appears in the feed with a "Queued" badge and
 * is injected into the active SDK session at the next pause point, without
 * requiring the user to stop the agent first.
 *
 * Run with: pnpm test:feature-docs submit-first
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
  ;({ page } = await resetApp({
    scenario: 'marketing',
    // Delay the mock response so the agent stays "running" long enough for
    // screenshots and the queued message to appear.
    agentResponseDelayMs: 4000,
    agentResponses: [
      { match: 'implement', response: "I'll start by reading the existing code to understand the structure." },
    ],
  }))
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'Mid-Turn Message Injection',
      description:
        'Pressing Enter while the agent is working now queues your message immediately. ' +
        'It appears in the chat feed with a pulsing "Queued" badge and is injected into ' +
        'the active session at the next pause point — no need to stop the agent first.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: Mid-Turn Message Injection', () => {
  test('Step 1: Navigate to a Claude session and verify the input is ready', async () => {
    const backendSession = page.locator('.cursor-pointer', { hasText: 'backend-api' }).first()
    await backendSession.click()

    const agentPanel = page.locator('[data-panel-id="agent"]')
    await expect(agentPanel).toBeVisible({ timeout: 10000 })

    const textarea = page.locator('textarea').filter({ visible: true }).first()
    await expect(textarea).toBeVisible({ timeout: 5000 })

    await screenshotElement(page, agentPanel, path.join(SCREENSHOTS, '01-chat-ready.png'))
    steps.push({
      screenshotPath: 'screenshots/01-chat-ready.png',
      caption: 'Agent chat ready to receive input',
      description: 'The agent chat panel is idle and ready. The input box accepts messages.',
    })
  })

  test('Step 2: Type a message — the placeholder hints that mid-turn typing is supported', async () => {
    const agentPanel = page.locator('[data-panel-id="agent"]')
    const textarea = page.locator('textarea').filter({ visible: true }).first()

    await textarea.click()
    await textarea.fill('Please implement the new caching layer')

    await screenshotElement(page, agentPanel, path.join(SCREENSHOTS, '02-typing-message.png'))
    steps.push({
      screenshotPath: 'screenshots/02-typing-message.png',
      caption: 'Typing the first message',
      description: 'The user types a message. Pressing Enter will send it to the agent.',
    })
  })

  test('Step 3: Agent starts running — Queue button and Stop button appear', async () => {
    const agentPanel = page.locator('[data-panel-id="agent"]')
    const textarea = page.locator('textarea').filter({ visible: true }).first()

    // Send the first message — agent enters "running" state
    await textarea.press('Enter')
    await expect(agentPanel.locator('text=Working...')).toBeVisible({ timeout: 5000 })

    await screenshotElement(page, agentPanel, path.join(SCREENSHOTS, '03-running-state.png'))
    steps.push({
      screenshotPath: 'screenshots/03-running-state.png',
      caption: 'Agent is running — Queue and Stop buttons appear',
      description:
        'Once the agent starts working, the Send button is replaced by a Queue button ' +
        '(for mid-turn follow-ups) and a Stop button. The input stays fully accessible.',
    })
  })

  test('Step 4: Type a follow-up and press Queue (or Enter) to inject it mid-turn', async () => {
    const agentPanel = page.locator('[data-panel-id="agent"]')
    const textarea = page.locator('textarea').filter({ visible: true }).first()

    // Type the follow-up message while the agent is running
    await textarea.click()
    await textarea.pressSequentially('Actually, start with the tests first')

    await screenshotElement(page, agentPanel, path.join(SCREENSHOTS, '04-typing-queued.png'))
    steps.push({
      screenshotPath: 'screenshots/04-typing-queued.png',
      caption: 'Typing a follow-up while the agent is still working',
      description:
        'The user types a follow-up message while the agent is busy. ' +
        'Pressing the Queue button (or Enter) will inject it at the next pause point.',
    })

    // Queue it — via Enter key (same as clicking Queue button)
    await textarea.press('Enter')

    // Queued message must appear in the feed with the badge
    await expect(agentPanel.getByText('Actually, start with the tests first')).toBeVisible({ timeout: 3000 })
    await expect(agentPanel.getByText('Queued')).toBeVisible({ timeout: 3000 })

    await screenshotElement(page, agentPanel, path.join(SCREENSHOTS, '05-queued-badge.png'))
    steps.push({
      screenshotPath: 'screenshots/05-queued-badge.png',
      caption: 'Queued message appears in the feed with a pulsing "Queued" badge',
      description:
        'The message appears in the chat immediately with a pulsing "Queued" badge, ' +
        'confirming it has been injected into the active session with priority "next". ' +
        'No need to stop the agent first.',
    })
  })

  test('Step 6: Agent finishes — Queued badge clears automatically', async () => {
    const agentPanel = page.locator('[data-panel-id="agent"]')

    // Wait for the mock response to arrive (4s delay)
    await expect(agentPanel.getByText("I'll start by reading")).toBeVisible({ timeout: 8000 })

    // Queued badge should be gone once the turn completes
    await expect(agentPanel.getByText('Queued')).not.toBeVisible({ timeout: 3000 })

    await screenshotElement(page, agentPanel, path.join(SCREENSHOTS, '06-turn-complete.png'))
    steps.push({
      screenshotPath: 'screenshots/06-turn-complete.png',
      caption: 'Turn complete — Queued badge cleared, conversation continues',
      description:
        'When the agent finishes its turn, the "Queued" badge is automatically removed ' +
        'from all queued messages. The conversation shows the original message, ' +
        'the queued follow-up, and the agent\'s response.',
    })
  })
})
