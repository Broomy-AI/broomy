import { useCallback } from 'react'

/**
 * Returns a custom key event handler for xterm.js terminals.
 * Handles Shift+Enter, Cmd+Left/Right (home/end), Cmd+Backspace (kill line),
 * and Cmd/Ctrl+1-6 panel toggle shortcuts.
 */
export function useTerminalKeyboard(ptyIdRef: React.MutableRefObject<string | null>) {
  return useCallback(
    (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'Tab') {
        return false
      }
      if (e.shiftKey && e.key === 'Enter') {
        if (e.type === 'keydown' && ptyIdRef.current) {
          void window.pty.write(ptyIdRef.current, '\x1b[13;2u')
        }
        return false
      }
      if (e.metaKey && e.key === 'ArrowLeft') {
        if (e.type === 'keydown' && ptyIdRef.current) {
          void window.pty.write(ptyIdRef.current, '\x01')
        }
        return false
      }
      if (e.metaKey && e.key === 'ArrowRight') {
        if (e.type === 'keydown' && ptyIdRef.current) {
          void window.pty.write(ptyIdRef.current, '\x05')
        }
        return false
      }
      if (e.type !== 'keydown') return true
      if (e.metaKey && e.key === 'Backspace') {
        if (ptyIdRef.current) {
          void window.pty.write(ptyIdRef.current, '\x15')
        }
        return false
      }
      if (e.metaKey || e.ctrlKey) {
        if (['1', '2', '3', '4', '5', '6'].includes(e.key)) {
          window.dispatchEvent(new CustomEvent('app:toggle-panel', {
            detail: { key: e.key }
          }))
          return false
        }
      }
      return true
    },
    [ptyIdRef]
  )
}
