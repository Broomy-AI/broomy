/**
 * Utilities for programmatically focusing terminal inputs and explorer search,
 * and tracking per-session focused panel for restoration on session switch.
 */
import { useSessionStore } from '../../store/sessions'
import { PANEL_IDS } from '../../panels'
import { isModalDialogOpen } from './modalDialog'

const AGENT_TAB_ID = '__agent__'

// --- Per-session focus tracking ---

/** Maps sessionId → last focused panel ID (runtime only, not persisted). */
const lastFocusedPanelBySession = new Map<string, string>()

/** Record which panel has focus for the given session. */
export function setLastFocusedPanel(sessionId: string, panelId: string): void {
  lastFocusedPanelBySession.set(sessionId, panelId)
}

/** Get the last focused panel for a session (defaults to agent panel). */
export function getLastFocusedPanel(sessionId: string): string {
  return lastFocusedPanelBySession.get(sessionId) ?? PANEL_IDS.AGENT
}

/** Remove tracking for a deleted session. */
export function clearLastFocusedPanel(sessionId: string): void {
  lastFocusedPanelBySession.delete(sessionId)
}

/**
 * Focus a panel by its data-panel-id attribute.
 * Tries xterm textareas first, then Monaco, then any focusable element, then the container.
 */
export function focusPanel(panelId: string): void {
  const container = document.querySelector(`[data-panel-id="${panelId}"]`)
  if (!container) return

  // For xterm: try focusing each textarea and verify focus actually moved.
  // Hidden terminal tabs use visibility:hidden which doesn't affect offsetParent,
  // so we can't rely on offsetParent — instead, try focus and check if it took.
  const xtermTextareas = container.querySelectorAll<HTMLElement>('.xterm-helper-textarea')
  for (const ta of xtermTextareas) {
    ta.focus()
    if (document.activeElement === ta) return
  }

  const monacoTextarea = container.querySelector<HTMLElement>('textarea.inputarea')
  if (monacoTextarea) { monacoTextarea.focus(); return }

  const focusable = container.querySelector<HTMLElement>('input, textarea, button, [tabindex]')
  if (focusable) { focusable.focus(); return }

  ;(container as HTMLElement).focus()
}

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
      if (isModalDialogOpen()) return
      const container = document.querySelector(`[data-panel-id="${PANEL_IDS.AGENT}"]`)
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
      if (isModalDialogOpen()) return
      focusPanel(PANEL_IDS.AGENT)
    })
  })
}

/**
 * Restore focus to the last focused panel for a session.
 * Uses requestAnimationFrame to ensure the DOM has updated after session switch.
 * Skipped if a modal dialog opened in the meantime (e.g. New Session right after launch):
 * pulling focus behind it would send its keys to the panel instead.
 */
export function restoreSessionFocus(sessionId: string): void {
  const panelId = getLastFocusedPanel(sessionId)
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (isModalDialogOpen()) return
      focusPanel(panelId)
    })
  })
}

/**
 * Focus the next visible panel in the given spatial direction.
 * Panel order: sidebar → explorer → fileViewer/terminal → tutorial
 * Stops at edges (no wrap-around). Returns the panel focused, or null.
 */
export function focusAdjacentPanel(
  direction: 'left' | 'right',
  visiblePanels: string[],
  getCurrentPanel: () => string | null,
): string | null {
  if (visiblePanels.length === 0) return null

  const current = getCurrentPanel()
  const currentIndex = current ? visiblePanels.indexOf(current) : -1

  let nextIndex: number
  if (currentIndex === -1) {
    // No current panel — focus first or last depending on direction
    nextIndex = direction === 'right' ? 0 : visiblePanels.length - 1
  } else if (direction === 'left') {
    if (currentIndex === 0) return null // at left edge
    nextIndex = currentIndex - 1
  } else {
    if (currentIndex === visiblePanels.length - 1) return null // at right edge
    nextIndex = currentIndex + 1
  }

  const targetPanel = visiblePanels[nextIndex]
  focusPanel(targetPanel)
  return targetPanel
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
