import { useCallback } from 'react'

/**
 * Returns a custom key event handler for xterm.js terminals.
 * Handles Shift+Enter, Cmd+Left/Right (home/end), Cmd+Backspace (kill line),
 * Cmd/Ctrl+1-5 panel toggle shortcuts, and app-wide shortcuts that dispatch
 * CustomEvents so useLayoutKeyboard can handle them.
 */

function dispatchAppEvent(type: string): false {
  window.dispatchEvent(new CustomEvent(type))
  return false
}

/** Map of Cmd/Ctrl+key shortcuts to CustomEvent types dispatched from terminal. */
const modKeyEvents = new Map<string, string>([
  ['a', 'app:select-all'],
  ['n', 'app:new-session'],
  ['j', 'app:focus-sessions'],
  [',', 'app:toggle-settings'],
  ['/', 'app:show-shortcuts'],
])

/** Map of Cmd/Ctrl+Shift+key shortcuts. */
const modShiftKeyEvents = new Map<string, string>([
  ['f', 'app:focus-session-search'],
  ['a', 'app:archive-session'],
  [']', 'app:next-terminal-tab'],
  ['[', 'app:prev-terminal-tab'],
])

/** Explorer tab filters indexed by Cmd+Alt+digit. */
const explorerTabFilters = new Map<string, string>([
  ['1', 'files'],
  ['2', 'source-control'],
  ['3', 'search'],
  ['4', 'recent'],
  ['5', 'review'],
])

/** Resolve the digit from e.code when Alt mangles e.key on Mac. */
function resolveDigit(e: KeyboardEvent): string | null {
  if (e.code.startsWith('Digit')) return e.code.charAt(5)
  return null
}

function handleModKeyShortcuts(e: KeyboardEvent): boolean | null {
  // Cmd+Alt+1-5: explorer tab shortcuts (use e.code because Alt mangles e.key on Mac)
  if (e.altKey) {
    const digit = resolveDigit(e)
    if (digit && explorerTabFilters.has(digit)) {
      window.dispatchEvent(new CustomEvent('app:explorer-tab', { detail: { filter: explorerTabFilters.get(digit) } }))
      return false
    }
  }

  if (['1', '2', '3', '4', '5'].includes(e.key)) {
    window.dispatchEvent(new CustomEvent('app:toggle-panel', { detail: { key: e.key } }))
    return false
  }

  const lowerKey = e.key.toLowerCase()

  if (e.shiftKey) {
    const shiftEvent = modShiftKeyEvents.get(lowerKey)
    if (shiftEvent) { dispatchAppEvent(shiftEvent); return false }
  }

  if (!e.shiftKey) {
    const modEvent = modKeyEvents.get(lowerKey)
    if (modEvent) { dispatchAppEvent(modEvent); return false }
  }

  return null // not handled
}

function handleAltNavigation(e: KeyboardEvent): boolean | null {
  if (!e.altKey || e.metaKey || e.ctrlKey) return null

  if (e.key === 'ArrowUp') {
    if (e.type === 'keydown') dispatchAppEvent('app:prev-session')
    return false
  }
  if (e.key === 'ArrowDown') {
    if (e.type === 'keydown') dispatchAppEvent('app:next-session')
    return false
  }

  return null
}

export function useTerminalKeyboard(ptyIdRef: React.MutableRefObject<string | null>) {
  return useCallback(
    (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'Tab') return false

      if (e.shiftKey && e.key === 'Enter') {
        if (e.type === 'keydown' && ptyIdRef.current) {
          void window.pty.write(ptyIdRef.current, '\x1b[13;2u')
        }
        return false
      }

      if (e.metaKey && e.key === 'ArrowLeft') {
        if (e.type === 'keydown' && ptyIdRef.current) void window.pty.write(ptyIdRef.current, '\x01')
        return false
      }

      if (e.metaKey && e.key === 'ArrowRight') {
        if (e.type === 'keydown' && ptyIdRef.current) void window.pty.write(ptyIdRef.current, '\x05')
        return false
      }

      const altResult = handleAltNavigation(e)
      if (altResult !== null) return altResult

      if (e.type !== 'keydown') return true

      if (e.metaKey && e.key === 'Backspace') {
        if (ptyIdRef.current) void window.pty.write(ptyIdRef.current, '\x15')
        return false
      }

      if (e.metaKey || e.ctrlKey) {
        const modResult = handleModKeyShortcuts(e)
        if (modResult !== null) return modResult
      }

      return true
    },
    [ptyIdRef]
  )
}
