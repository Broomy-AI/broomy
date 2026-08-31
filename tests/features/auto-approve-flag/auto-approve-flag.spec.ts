/**
 * Feature test: Auto-approve flag is passed to agent command
 *
 * Verifies that when a repo has skipApproval: true and the agent has a
 * skipApprovalFlag, the flag is appended to the command and passed through
 * to the PTY process via BROOMY_ORIGINAL_COMMAND env var.
 *
 * Run with: pnpm test:feature-docs auto-approve-flag
 */
import { test, expect, resetApp } from '../_shared/electron-fixture'
import type { Page } from '@playwright/test'
import { resumeActiveSession, getActiveSessionTerminalBuffer } from '../_shared/resume-helpers'

let page: Page

test.beforeAll(async () => {
  ;({ page } = await resetApp())
})

test.describe.serial('Feature: Auto-approve flag passed to agent', () => {
  test('session 1 (linked to repo with skipApproval) launches with --approval-mode full-auto', async () => {
    // Session 1 is "broomy" with agentId: 'codex' and repoId: 'repo-1'
    // (see DEFAULT scenario in src/main/handlers/scenarios.ts)
    // repo-1 has skipApproval: true (src/main/handlers/types.ts)
    // Codex agent has skipApprovalFlag: '--approval-mode full-auto' (src/main/handlers/types.ts)

    // First ensure session 1 is active (it should be by default)
    const broomySession = page.locator('.cursor-pointer:has-text("broomy")')
    await broomySession.click()

    // Sessions restore paused — resume it so fake-claude actually runs and
    // prints BROOMY_COMMAND=...
    await resumeActiveSession(page, { timeout: 15000 })

    // Get terminal content and verify the original command includes the flag
    const content = await getActiveSessionTerminalBuffer(page)
    expect(content).toContain('BROOMY_COMMAND=codex --approval-mode full-auto')
  })
})
