/**
 * Focus the agent terminal's xterm input.
 * Uses requestAnimationFrame to ensure the DOM has updated after any state changes.
 */
export function focusAgentTerminal(): void {
  requestAnimationFrame(() => {
    const container = document.querySelector('[data-panel-id="terminal"]')
    if (!container) return
    const textarea = container.querySelector<HTMLElement>('.xterm-helper-textarea')
    textarea?.focus()
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
