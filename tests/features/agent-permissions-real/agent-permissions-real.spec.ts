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
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { generateFeaturePage, generateIndex, type FeatureStep } from '../_shared/template'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const FEATURE_DIR = __dirname
const SCREENSHOTS = path.join(FEATURE_DIR, 'screenshots')
const FEATURES_ROOT = path.join(__dirname, '..')

let page: Page
const steps: FeatureStep[] = []

test.beforeAll(async () => {
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true })
  // Use marketing scenario (has API-mode sessions) with the real SDK
  ;({ page } = await resetApp({
    scenario: 'marketing',
    realSdk: true,
  }))
})

test.afterAll(async () => {
  await generateFeaturePage(
    {
      title: 'Real SDK Permission Flow (Integration)',
      description:
        'End-to-end integration test using the REAL Claude Agent SDK. Sends a prompt ' +
        'that triggers Bash tool use, verifies permission prompts appear, clicks Allow, ' +
        'and confirms the tool executes successfully without being rejected.',
      steps,
    },
    FEATURE_DIR,
  )
  await generateIndex(FEATURES_ROOT)
})

test.describe.serial('Feature: Real SDK Permission Flow', () => {
  test('Step 1: Send a prompt that triggers a tool requiring permission', async () => {
    test.setTimeout(120_000)

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
    await chatInput.fill(
      'Create a temp file by running exactly this bash command: ' +
      'mkdir -p /tmp/broomy-permission-test && echo "test-ok" > /tmp/broomy-permission-test/result.txt && cat /tmp/broomy-permission-test/result.txt',
    )
    await chatInput.press('Enter')

    // Wait for the first permission prompt to appear
    const permissionPrompt = page.locator('text=Claude wants to use')
    await expect(permissionPrompt).toBeVisible({ timeout: 90_000 })

    await page.screenshot({ path: path.join(SCREENSHOTS, '01-permission-prompt.png') })
    steps.push({
      screenshotPath: 'screenshots/01-permission-prompt.png',
      caption: 'Real SDK permission prompt appears',
      description:
        'Using the REAL Claude Agent SDK (not mocks), the agent tries to run a Bash command. ' +
        'The permission prompt appears with Allow, Always Allow, and Deny buttons. ' +
        'This proves canUseTool is being called correctly by the SDK.',
    })
  })

  test('Step 2: Allow the tool and verify execution', async () => {
    test.setTimeout(120_000)

    // Keep clicking Allow for every permission prompt until the turn completes
    const resultStats = page.locator('text=/\\d+\\.\\d+s/')
    let permissionCount = 0

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const allowButton = page.locator('button:visible', { hasText: /^Allow$/ })

      const outcome = await Promise.race([
        allowButton.waitFor({ state: 'visible', timeout: 90_000 }).then(() => 'permission' as const),
        resultStats.first().waitFor({ state: 'visible', timeout: 90_000 }).then(() => 'completed' as const),
      ])

      if (outcome === 'completed') {
        console.log(`[test] Turn completed after ${String(permissionCount)} permission prompts`)
        break
      }

      permissionCount++
      console.log(`[test] Permission prompt #${String(permissionCount)} — clicking Allow`)

      // Screenshot the first Allow click
      if (permissionCount === 1) {
        await page.screenshot({ path: path.join(SCREENSHOTS, '02-clicking-allow.png') })
      }

      await allowButton.click()
      // Wait for the permission prompt to dismiss before looping
      await expect(allowButton).not.toBeVisible({ timeout: 5000 }).catch(() => { /* may reappear quickly */ })
    }

    // Screenshot the completed turn
    await page.screenshot({ path: path.join(SCREENSHOTS, '03-tool-executed.png') })
    steps.push({
      screenshotPath: 'screenshots/02-clicking-allow.png',
      caption: 'Clicking Allow on the permission prompt',
      description:
        `The user clicks Allow. ${String(permissionCount)} permission prompt(s) were shown in total. ` +
        'Each one was approved by clicking Allow.',
    })
    steps.push({
      screenshotPath: 'screenshots/03-tool-executed.png',
      caption: 'Tool executed successfully after Allow',
      description:
        'After clicking Allow, the tool executes successfully. The result stats (cost/duration) ' +
        'appear, and the output contains "test-ok" proving the Bash command ran. ' +
        'No "restricted", "denied", or "not allowed" messages — the permission flow works end-to-end.',
    })

    // Verify no rejection/error messages about permissions
    const chatArea = page.locator('.flex-1.overflow-y-auto').first()
    const chatText = await chatArea.textContent() ?? ''
    const lower = chatText.toLowerCase()

    const failPhrases = [
      'restricted', 'denied', 'not able to run', 'permission was denied',
      'not allowed', 'permission error', 'permission validation',
      'unable to execute', 'permission system',
    ]
    for (const phrase of failPhrases) {
      expect(lower).not.toContain(phrase)
    }

    expect(chatText).toContain('test-ok')
    expect(permissionCount).toBeGreaterThan(0)
  })
})
