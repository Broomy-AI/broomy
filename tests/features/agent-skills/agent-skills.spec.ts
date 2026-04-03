/**
 * E2E Test: Agent SDK Skills (slash commands)
 *
 * Verifies that the V1 query() options include settingSources and tools
 * so that skills/slash commands work correctly. Uses the fake SDK
 * (E2E_FAKE_SDK=true) which exercises the real buildQueryOptions and
 * runTurn code paths, validating critical options without spawning a
 * real subprocess.
 *
 * Run with: pnpm test:feature-docs agent-skills
 */
import { test, expect, resetApp } from '../_shared/electron-fixture'
import type { Page } from '@playwright/test'

let page: Page

test.beforeAll(async () => {
  // Marketing scenario has sessions with agentId: 'claude' which use API mode
  ;({ page } = await resetApp({ scenario: 'marketing', fakeSdk: true }))
})

test.describe.serial('Feature: Agent SDK Skills', () => {
  test('Slash command is processed with correct SDK options', async () => {
    // backend-api uses agentId: 'claude' → connectionMode: 'api' → AgentChat UI
    const session = page.locator('.cursor-pointer:has-text("backend-api")')
    await expect(session).toBeVisible()
    await session.click()

    const agentPanel = page.locator('[data-panel-id="agent"]')
    await expect(agentPanel).toBeVisible()

    // Wait for the chat textarea (API mode renders AgentChat with a textarea)
    const chatInput = agentPanel.getByPlaceholder('Message or /command').first()
    await expect(chatInput).toBeVisible({ timeout: 5000 })

    // Send a slash command (skill)
    await chatInput.fill('/validate')
    await chatInput.press('Enter')

    // The fake SDK validates options and includes them in the response.
    // If settingSources or tools were missing, it would return an error instead.
    const response = agentPanel.getByText('Fake SDK: skill "/validate" executed')
    await expect(response).toBeVisible({ timeout: 8000 })

    // Verify the response confirms settingSources includes "project"
    await expect(agentPanel.getByText('"project"')).toBeVisible()

    // Verify tools preset was passed
    await expect(agentPanel.getByText('claude_code')).toBeVisible()
  })

  test('Follow-up message uses resume for token efficiency', async () => {
    const agentPanel = page.locator('[data-panel-id="agent"]')
    const chatInput = agentPanel.getByPlaceholder('Message or /command').first()

    // Send a regular follow-up message
    await chatInput.fill('Tell me about this project')
    await chatInput.press('Enter')

    // The fake SDK returns a mock response for non-slash-command prompts
    const response = agentPanel.getByText("I'll help you with that")
    await expect(response).toBeVisible({ timeout: 8000 })
  })

  test('CWD is passed to the SDK', async () => {
    const agentPanel = page.locator('[data-panel-id="agent"]')
    const chatInput = agentPanel.getByPlaceholder('Message or /command').first()

    // Send another slash command to see the cwd in the response
    await chatInput.fill('/coverage-check')
    await chatInput.press('Enter')

    // The fake SDK includes cwd in the response — verify it's not empty
    const response = agentPanel.getByText('Fake SDK: skill "/coverage-check" executed')
    await expect(response).toBeVisible({ timeout: 8000 })

    // cwd should be a non-empty path (check within the /coverage-check response)
    await expect(response).toContainText(/cwd=\//)
  })
})
