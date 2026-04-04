/**
 * Integration test: Real SDK Permission Flow
 *
 * Uses the REAL Claude Agent SDK to verify that permission prompts work
 * end-to-end. Sends a prompt that triggers a Bash tool use, waits for
 * the permission prompt, clicks Allow, and verifies the tool executes.
 *
 * Requirements:
 *   - Claude CLI installed and authenticated
 *   - ANTHROPIC_API_KEY or Claude CLI auth configured
 *
 * Run with:
 *   pnpm test:feature-docs agent-permissions-real
 */
import { test, expect, resetApp } from '../_shared/electron-fixture'
import type { Page } from '@playwright/test'

let page: Page

test.beforeAll(async () => {
  // Use marketing scenario (has API-mode sessions) with the real SDK
  ;({ page } = await resetApp({
    scenario: 'marketing',
    realSdk: true,
  }))
})

test('Real SDK: permission prompt appears and Allow works', async () => {
  test.setTimeout(120_000) // Real SDK calls can take a while

  const sidebar = page.locator('[data-panel-id="sidebar"]')
  await expect(sidebar).toBeVisible()

  // Click the backend-api session which uses agentId: 'claude' (API mode)
  const claudeSession = page.locator('.cursor-pointer:has-text("backend-api")')
  await expect(claudeSession).toBeVisible()
  await claudeSession.click()

  // Wait for chat input to be visible
  const chatInput = page.locator('textarea[placeholder*="Message"]:visible')
  await expect(chatInput).toBeVisible({ timeout: 5000 })

  // Send a prompt that will trigger a Bash tool requiring permission.
  // In default mode, the CLI auto-allows safe commands (echo, ls) but asks
  // for permission for file-modifying or network commands. Use mkdir+touch
  // which writes to disk and should trigger the permission prompt.
  await chatInput.fill(
    'Create a temp file by running exactly this bash command: ' +
    'mkdir -p /tmp/broomy-permission-test && echo "test-ok" > /tmp/broomy-permission-test/result.txt && cat /tmp/broomy-permission-test/result.txt',
  )
  await chatInput.press('Enter')

  // The agent may trigger one or more permission prompts. Keep clicking Allow
  // until the turn completes (result stats appear).
  const resultStats = page.locator('text=/\\d+\\.\\d+s/')
  let permissionCount = 0

  // Loop: allow all permission prompts until the turn finishes
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const allowButton = page.locator('button:visible', { hasText: /^Allow$/ })

    // Race: either a new permission prompt appears or the turn completes
    const outcome = await Promise.race([
      allowButton.waitFor({ state: 'visible', timeout: 90_000 }).then(() => 'permission' as const),
      resultStats.first().waitFor({ state: 'visible', timeout: 90_000 }).then(() => 'completed' as const),
    ])

    if (outcome === 'completed') {
      console.log(`[test] Turn completed after ${String(permissionCount)} permission prompts`)
      break
    }

    // Permission prompt appeared — click Allow
    permissionCount++
    console.log(`[test] Permission prompt #${String(permissionCount)} — clicking Allow`)
    await allowButton.click()

    // Brief wait for the prompt to dismiss before checking again
    await page.waitForTimeout(500)
  }

  // At least one permission prompt should have appeared
  expect(permissionCount).toBeGreaterThan(0)

  // Grab all visible text from the chat area
  const chatArea = page.locator('.flex-1.overflow-y-auto').first()
  const chatText = await chatArea.textContent() ?? ''

  // The agent should NOT say the tool was rejected/restricted/denied.
  const failWords = ['restricted', 'denied', 'not able to run', 'permission was denied', 'not allowed']
  for (const word of failWords) {
    expect(chatText.toLowerCase()).not.toContain(word.toLowerCase())
  }

  // The command output should appear somewhere
  expect(chatText).toContain('test-ok')
})
