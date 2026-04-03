/**
 * Feature Documentation: Collapsed History
 *
 * Demonstrates the "Load earlier messages" feature in agent chat. When a
 * session has many messages, only the most recent ones are shown initially.
 * A button at the top lets the user expand the full history on demand.
 * Consecutive tool-use messages are counted as a single visible item,
 * matching how they render as one collapsed line.
 *
 * Run with: pnpm test:feature-docs collapsed-history
 */
import { test, expect, resetApp } from '../_shared/electron-fixture'
import type { Page, ElectronApplication } from '@playwright/test'
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
let electronApp: ElectronApplication
const steps: FeatureStep[] = []

test.beforeAll(async () => {
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true })
  ;({ page, electronApp } = await resetApp({
    scenario: 'marketing',
    agentResponses: [
      { match: 'authentication', response: "I'll implement JWT authentication with refresh token rotation. Let me start by reading the existing auth middleware." },
      { match: 'caching', response: "I've added a Redis-backed caching layer with TTL support and cache invalidation hooks." },
      { match: 'tests', response: 'All 47 tests pass. I added integration tests for the token rotation flow and session revocation.' },
    ],
  }))
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'Collapsed History',
      description:
        'Long agent conversations now show only the most recent messages by default. ' +
        'A "Load earlier messages" button at the top reveals the full history on demand. ' +
        'Consecutive tool-use blocks count as a single visible item — matching how they ' +
        'render as one collapsed line — so the threshold feels natural.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

/** Send a message to the agent and wait for the response text to appear. */
async function sendAndWait(agentPanel: ReturnType<Page['locator']>, message: string, responseSnippet: string): Promise<void> {
  const textarea = page.locator('textarea').filter({ visible: true }).first()
  await textarea.click()
  await textarea.fill(message)
  await textarea.press('Enter')
  // Wait for the agent's response text to appear and settle
  const response = agentPanel.getByText(responseSnippet)
  await expect(response).toBeVisible({ timeout: 8000 })
  await response.scrollIntoViewIfNeeded()
}

/**
 * Inject fake history messages and historyMeta via IPC from the main process.
 * This simulates what happens when the SDK loads a session with many messages.
 */
async function injectHistoryMessages(
  sessionId: string,
  messages: { id: string; type: string; text?: string; toolName?: string; toolInput?: Record<string, unknown>; toolUseId?: string; toolResult?: string }[],
  meta: { total: number; loaded: number },
): Promise<void> {
  // Inject messages into the agentChat store directly (faster than IPC for bulk)
  await page.evaluate(({ sessionId: sid, messages: msgs }) => {
    const store = (window as Record<string, unknown>).__agentChatStore as {
      getState: () => { addMessage: (id: string, msg: Record<string, unknown>) => void }
    }
    if (!store) return
    const { addMessage } = store.getState()
    for (const msg of msgs) {
      addMessage(sid, { ...msg, timestamp: Date.now() })
    }
  }, { sessionId, messages })

  // Send historyMeta via IPC from main process — this sets the React state
  await electronApp.evaluate(({ BrowserWindow }, { sid, meta: m }) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      win.webContents.send(`agentSdk:historyMeta:${sid}`, m)
    }
  }, { sid: sessionId, meta })
}

test.describe.serial('Feature: Collapsed History', () => {
  test('Step 1: Build up a conversation with multiple turns', async () => {
    // Navigate to the backend-api session
    const backendSession = page.locator('.cursor-pointer', { hasText: 'backend-api' }).first()
    await backendSession.click()

    const agentPanel = page.locator('[data-panel-id="agent"]')
    await expect(agentPanel).toBeVisible({ timeout: 10000 })

    // Send a few messages to build a real conversation
    await sendAndWait(agentPanel, 'Add JWT authentication with session management', 'refresh token rotation')
    await sendAndWait(agentPanel, 'Now add a caching layer for the token validation', 'Redis-backed caching')
    await sendAndWait(agentPanel, 'Run the tests to make sure everything passes', '47 tests pass')

    await screenshotElement(page, agentPanel, path.join(SCREENSHOTS, '01-long-conversation.png'))
    steps.push({
      screenshotPath: 'screenshots/01-long-conversation.png',
      caption: 'A conversation with several turns of back-and-forth',
      description:
        'After several exchanges, the chat history grows. With the old limit of 10 messages, ' +
        'even a short conversation like this would be clipped because tool-use blocks counted individually.',
    })
  })

  test('Step 2: Simulate collapsed history with "Load earlier messages" button', async () => {
    const agentPanel = page.locator('[data-panel-id="agent"]')

    // Get the active session ID
    const sessionId = await page.evaluate(() => {
      const store = (window as Record<string, unknown>).__sessionStore as {
        getState: () => { activeSessionId: string }
      }
      return store?.getState().activeSessionId ?? ''
    })

    // Inject history messages that simulate earlier turns (prepended before current)
    // These use 'history-' prefix IDs to match how the real loader works
    const historyMessages = [
      { id: 'history-1', type: 'text' as const, text: 'Set up the project structure and install dependencies' },
      { id: 'history-2', type: 'text' as const, text: "I'll create the initial project scaffolding with Express and TypeScript." },
      { id: 'history-3', type: 'tool_use' as const, toolName: 'Write', toolInput: { file_path: 'package.json' }, toolUseId: 'tool-h1' },
      { id: 'history-4', type: 'tool_use' as const, toolName: 'Write', toolInput: { file_path: 'tsconfig.json' }, toolUseId: 'tool-h2' },
      { id: 'history-5', type: 'tool_use' as const, toolName: 'Write', toolInput: { file_path: 'src/index.ts' }, toolUseId: 'tool-h3' },
      { id: 'history-6', type: 'tool_use' as const, toolName: 'Bash', toolInput: { command: 'npm install' }, toolUseId: 'tool-h4' },
      { id: 'history-7', type: 'text' as const, text: 'Now add the database models' },
      { id: 'history-8', type: 'text' as const, text: "I'll set up Prisma with the user and session models." },
      { id: 'history-9', type: 'tool_use' as const, toolName: 'Write', toolInput: { file_path: 'prisma/schema.prisma' }, toolUseId: 'tool-h5' },
      { id: 'history-10', type: 'tool_use' as const, toolName: 'Bash', toolInput: { command: 'npx prisma generate' }, toolUseId: 'tool-h6' },
    ]

    await injectHistoryMessages(sessionId, historyMessages, { total: 35, loaded: 25 })

    // The "Load earlier messages" button should now be visible
    const loadButton = agentPanel.getByText('Load 10 earlier messages')
    await expect(loadButton).toBeVisible({ timeout: 5000 })

    await screenshotElement(page, agentPanel, path.join(SCREENSHOTS, '02-load-button.png'))
    steps.push({
      screenshotPath: 'screenshots/02-load-button.png',
      caption: '"Load earlier messages" button appears at the top',
      description:
        'When the session has more messages than the visible limit (now 50, up from 10), ' +
        'a button appears at the top showing how many earlier messages can be loaded. ' +
        'Consecutive tool-use blocks are counted as one item, so a conversation with many ' +
        'tool calls no longer gets clipped prematurely.',
    })
  })

  test('Step 3: Show that tool-use blocks collapse into single items', async () => {
    const agentPanel = page.locator('[data-panel-id="agent"]')

    // Scroll to top to show the history messages with grouped tool calls
    await page.evaluate(() => {
      const container = document.querySelector('[data-panel-id="agent"] .overflow-y-auto')
      if (container) container.scrollTop = 0
    })
    await expect(agentPanel.getByText('Set up the project structure')).toBeVisible({ timeout: 3000 })

    await screenshotElement(page, agentPanel, path.join(SCREENSHOTS, '03-tool-grouping.png'))
    steps.push({
      screenshotPath: 'screenshots/03-tool-grouping.png',
      caption: 'Consecutive tool calls render as a single collapsed group',
      description:
        'Four consecutive tool calls (Write package.json, Write tsconfig.json, Write src/index.ts, ' +
        'Bash npm install) are rendered as one collapsed group. The new counting logic treats them ' +
        'as a single visible item toward the limit, matching the visual density.',
    })
  })
})
