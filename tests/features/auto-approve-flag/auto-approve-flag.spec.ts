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

let page: Page

test.beforeAll(async () => {
  ;({ page } = await resetApp())
})

/**
 * Get terminal buffer content from the buffer registry.
 */
async function getTerminalContent(p: Page, type: 'agent' | 'user' | 'any' = 'agent'): Promise<string> {
  return p.evaluate((searchType) => {
    const registry = (window as unknown as { __terminalBufferRegistry?: { getSessionIds: () => string[]; getBuffer: (id: string) => string | null } }).__terminalBufferRegistry
    if (!registry) return ''
    const ids = registry.getSessionIds()
    for (const id of ids) {
      const isUser = id.endsWith('-user')
      if (searchType === 'agent' && isUser) continue
      if (searchType === 'user' && !isUser) continue
      const buf = registry.getBuffer(id)
      if (buf && buf.length > 0) return buf
    }
    return ''
  }, type)
}

test.describe.serial('Feature: Auto-approve flag passed to agent', () => {
  test('session 1 (linked to repo with skipApproval) launches with --dangerously-skip-permissions', async () => {
    // Session 1 is "broomy" with agentId: 'claude' and repoId: 'repo-1'
    // repo-1 has skipApproval: true
    // Claude agent has skipApprovalFlag: '--dangerously-skip-permissions'

    // First ensure session 1 is active (it should be by default)
    const broomySession = page.locator('.cursor-pointer:has-text("broomy")')
    await broomySession.click()

    // Wait for terminal to have content (fake-claude outputs BROOMY_COMMAND=...)
    await expect.poll(
      () => getTerminalContent(page, 'agent'),
      { timeout: 15000, message: 'terminal should have content from fake-claude' },
    ).toBeTruthy()

    // Get terminal content and verify the original command includes the flag
    const content = await getTerminalContent(page, 'agent')
    expect(content).toContain('BROOMY_COMMAND=claude --dangerously-skip-permissions')
  })
})
