/**
 * Sessions restore paused — every session shows a "Resume Session"
 * placeholder in place of its terminal until resumed. Any feature-doc
 * walkthrough that asserts on a live terminal, or interacts with one, has
 * to resume the relevant session first.
 *
 * Waits for the mock agent's ready marker rather than sleeping: the PTY's
 * initial command is written into the freshly spawned process a short
 * delay after spawn (see src/main/handlers/pty.ts), so a screenshot or
 * interaction taken immediately after clicking "Resume Session" can catch
 * the bare shell prompt instead of the agent actually starting up.
 */
import { expect, type Page } from '@playwright/test'

/**
 * Read one session's main-tab terminal buffer straight from the in-app
 * registry. Registered under the bare session id for an agent tab, or
 * `${sessionId}-user` when the session has no configured agent (its main
 * tab is then a plain shell) — see useTerminalSetup.ts's `registryKey`.
 */
export async function getSessionTerminalBuffer(page: Page, sessionId: string): Promise<string> {
  return page.evaluate((id) => {
    const registry = (window as unknown as {
      __terminalBufferRegistry?: { getBuffer: (sid: string) => string | null }
    }).__terminalBufferRegistry
    return registry?.getBuffer(id) || registry?.getBuffer(`${id}-user`) || ''
  }, sessionId)
}

/** Read the currently active session's agent-terminal buffer. */
export async function getActiveSessionTerminalBuffer(page: Page): Promise<string> {
  return getSessionTerminalBuffer(page, (await getActiveSession(page)).id)
}

async function getActiveSession(page: Page): Promise<{ id: string; isPaused: boolean }> {
  const session = await page.evaluate(() => {
    const store = (window as unknown as {
      __sessionStore?: { getState: () => { activeSessionId: string | null; sessions: { id: string; isPaused: boolean }[] } }
    }).__sessionStore
    if (!store) return null
    const state = store.getState()
    return state.sessions.find((s) => s.id === state.activeSessionId) ?? null
  })
  if (!session) throw new Error('resumeActiveSession: no active session to resume')
  return session
}

/**
 * Resume the currently active session and wait for its terminal to
 * actually be running (not just visible) before returning. A no-op if the
 * session is already running (safe to call more than once, e.g. after
 * switching back to a session resumed earlier in the same walkthrough).
 *
 * The ready marker defaults to the mock agent's 'FAKE_CLAUDE_READY' banner.
 * For a session with no agent configured (agentId: null), the PTY spawns a
 * bare shell instead and never prints that marker — pass
 * `readyMarker: 'E2E_TEST_SHELL_READY'` for those (see resolveShellConfig
 * in src/main/handlers/pty.ts).
 */
export async function resumeActiveSession(page: Page, opts?: { timeout?: number; readyMarker?: string }): Promise<void> {
  const timeout = opts?.timeout ?? 10000
  const readyMarker = opts?.readyMarker ?? 'FAKE_CLAUDE_READY'
  const session = await getActiveSession(page)
  if (!session.isPaused) return
  await page.locator('button:has-text("Resume Session"):visible').click()
  await expect.poll(() => getSessionTerminalBuffer(page, session.id), { timeout })
    .toContain(readyMarker)
}

/**
 * Click a session by its sidebar label, then resume it. For selecting and
 * bringing up a session other than the one that's currently active.
 */
export async function selectAndResumeSession(page: Page, sessionLabel: string, opts?: { timeout?: number }): Promise<void> {
  await page.locator(`.cursor-pointer:has-text("${sessionLabel}")`).click()
  await resumeActiveSession(page, opts)
}
