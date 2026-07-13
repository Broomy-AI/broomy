/**
 * Applies appearance changes to a LIVE xterm instance.
 *
 * This is a separate hook, and a separate effect, for a load-bearing reason: the
 * terminal-construction effect in useTerminalSetup tears down the terminal and
 * KILLS THE PTY in its cleanup. Putting the theme or font size in that effect's
 * dependency array would destroy the running agent every time a setting changed.
 * So the terminal is built once, and mutated in place thereafter.
 */
import { useEffect } from 'react'
import type { Terminal as XTerm } from '@xterm/xterm'
import type { FitAddon } from '@xterm/addon-fit'
import { useSettingsStore } from '../../../store/settings'
import { XTERM_THEMES } from '../../../shared/theme/xtermTheme'

interface ScrollStateLike {
  wasRecentlyAtBottom: () => boolean
  setAtBottom: (atBottom: boolean) => void
}

export interface TerminalAppearanceRefs {
  terminalRef: React.MutableRefObject<XTerm | null>
  fitAddonRef: React.MutableRefObject<FitAddon | null>
  ptyIdRef: React.MutableRefObject<string | null>
  scrollStateRef: React.MutableRefObject<ScrollStateLike | null>
}

export function useTerminalAppearance(refs: TerminalAppearanceRefs): void {
  const { terminalRef, fitAddonRef, ptyIdRef, scrollStateRef } = refs
  useEffect(() => {
    return useSettingsStore.subscribe((state, prev) => {
      const term = terminalRef.current
      if (!term) return

      const next = state.appearance
      const before = prev.appearance

      if (state.resolvedTheme !== prev.resolvedTheme) {
        term.options.theme = XTERM_THEMES[state.resolvedTheme]
      }
      if (next.terminalContrast !== before.terminalContrast) {
        term.options.minimumContrastRatio = next.terminalContrast
      }

      const metricsChanged =
        next.editorFontSize !== before.editorFontSize ||
        next.terminalLineHeight !== before.terminalLineHeight
      if (!metricsChanged) return

      // Capture bottom-following BEFORE the reflow, exactly as the resize path does.
      // Without it, changing the font size while an agent is streaming yanks the user
      // off the tail of the output.
      const wasAtBottom = scrollStateRef.current?.wasRecentlyAtBottom() ?? true

      term.options.fontSize = next.editorFontSize
      term.options.lineHeight = next.terminalLineHeight

      // A font change does not resize the container, so the ResizeObserver never
      // fires. Without an explicit fit + pty.resize the remote side keeps its old
      // winsize and the agent's TUI wraps at the wrong column.
      requestAnimationFrame(() => {
        try {
          fitAddonRef.current?.fit()
        } catch {
          // addon-fit bails on a hidden parent; the tab refits on activation anyway.
        }
        if (ptyIdRef.current && term.cols > 0 && term.rows > 0) {
          void window.pty.resize(ptyIdRef.current, term.cols, term.rows)
        }
        if (wasAtBottom) {
          setTimeout(() => {
            term.scrollToBottom()
            scrollStateRef.current?.setAtBottom(true)
          }, 20)
        }
      })
    })
  }, [terminalRef, fitAddonRef, ptyIdRef, scrollStateRef])
}
