/**
 * Utilities for programmatically focusing terminal inputs and explorer search.
 */
import { useSessionStore } from '../store/sessions'

const AGENT_TAB_ID = '__agent__'

/**
 * Switch to the agent terminal tab and focus its xterm input.
 * Uses requestAnimationFrame to ensure the DOM has updated after any state changes.
 */
export function focusAgentTerminal(): void {
  // Switch to the agent tab first
  const state = useSessionStore.getState()
  const sessionId = state.activeSessionId
  if (sessionId) {
    state.setActiveTerminalTab(sessionId, AGENT_TAB_ID)
  }

  // Double-rAF ensures React has committed the re-render (removing 'hidden'
  // from the agent tab) before we try to focus the textarea inside it.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const container = document.querySelector('[data-panel-id="terminal"]')
      if (!container) return
      const textarea = container.querySelector<HTMLElement>('.xterm-helper-textarea')
      textarea?.focus()
    })
  })
}

/**
 * Write a prompt to the agent terminal, submit it (Enter), and focus the terminal.
 *
 * The text and carriage return are sent as separate writes so the agent
 * treats the \r as a distinct Enter keypress rather than part of pasted text.
 */
export async function sendAgentPrompt(agentPtyId: string, prompt: string): Promise<void> {
  await window.pty.write(agentPtyId, prompt)
  // Brief pause so the terminal finishes processing the pasted text before
  // receiving Enter — without this, longer prompts can swallow the \r.
  await new Promise(resolve => setTimeout(resolve, 250))
  await window.pty.write(agentPtyId, '\r')
  focusAgentTerminal()
}

/**
 * Focus the currently active terminal tab's xterm input without switching tabs.
 * Uses requestAnimationFrame to ensure the DOM has updated after any state changes.
 */
export function focusActiveTerminal(): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const container = document.querySelector('[data-panel-id="terminal"]')
      if (!container) return
      const textarea = container.querySelector<HTMLElement>('.xterm-helper-textarea')
      textarea?.focus()
    })
  })
}

/**
 * Focus the explorer search input.
 * Uses requestAnimationFrame to ensure the DOM has updated after any state changes.
 */
export function focusSearchInput(): void {
  requestAnimationFrame(() => {
    const input = document.querySelector<HTMLInputElement>('[data-explorer-search]')
    input?.focus()
  })
}
