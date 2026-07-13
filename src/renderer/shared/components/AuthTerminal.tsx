/**
 * Minimal xterm.js terminal for running interactive auth commands like `gh auth login`.
 * Creates a PTY, renders output, and forwards keystrokes. The parent controls lifecycle
 * via the `onDone` callback and unmounting (which kills the PTY).
 */
import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'

import '@xterm/xterm/css/xterm.css'

const XTERM_THEME = {
  background: '#1a1a1a',
  foreground: '#e0e0e0',
  cursor: '#e0e0e0',
}

export function AuthTerminal({ ptyId, onDone }: { ptyId: string; onDone: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      theme: XTERM_THEME,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      scrollback: 1000,
      rows: 14,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerRef.current)
    fitAddon.fit()

    // Forward keystrokes to PTY
    term.onData((data) => {
      void window.pty.write(ptyId, data)
    })

    // Receive PTY output
    const unsubData = window.pty.onData(ptyId, (data) => {
      term.write(data)
    })

    const resizeObserver = new ResizeObserver(() => fitAddon.fit())
    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
      unsubData()
      term.dispose()
      void window.pty.kill(ptyId)
    }
  }, [ptyId])

  return (
    <div className="flex flex-col gap-2">
      <div ref={containerRef} className="h-[300px] rounded border border-border overflow-hidden" />
      <div className="flex justify-end">
        <button
          onClick={onDone}
          className="px-4 py-2 text-sm rounded bg-accent text-on-accent hover:bg-accent/80 transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  )
}
