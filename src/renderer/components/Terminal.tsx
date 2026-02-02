import { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { useErrorStore } from '../store/errors'
import '@xterm/xterm/css/xterm.css'

interface TerminalProps {
  sessionId?: string
  cwd: string
  command?: string
}

export default function Terminal({ sessionId, cwd, command }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const [ptyId, setPtyId] = useState<string | null>(null)
  const { addError } = useErrorStore()

  useEffect(() => {
    if (!containerRef.current || !sessionId) return

    // Create terminal
    const terminal = new XTerm({
      theme: {
        background: '#1a1a1a',
        foreground: '#e0e0e0',
        cursor: '#e0e0e0',
        cursorAccent: '#1a1a1a',
        selectionBackground: '#4a9eff40',
        black: '#1a1a1a',
        brightBlack: '#3a3a3a',
        red: '#f87171',
        brightRed: '#fca5a5',
        green: '#4ade80',
        brightGreen: '#86efac',
        yellow: '#facc15',
        brightYellow: '#fde047',
        blue: '#4a9eff',
        brightBlue: '#93c5fd',
        magenta: '#c084fc',
        brightMagenta: '#d8b4fe',
        cyan: '#22d3ee',
        brightCyan: '#67e8f9',
        white: '#e0e0e0',
        brightWhite: '#ffffff',
      },
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 10000,
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)

    terminal.open(containerRef.current)
    fitAddon.fit()

    // Intercept keyboard shortcuts - dispatch custom event for Layout to handle
    terminal.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      // Let Cmd/Ctrl + 1/2/3/4/5/6 pass through to the app
      if (e.metaKey || e.ctrlKey) {
        if (['1', '2', '3', '4', '5', '6'].includes(e.key)) {
          // Dispatch custom event for Layout to handle (xterm may block normal bubbling)
          window.dispatchEvent(new CustomEvent('app:toggle-panel', {
            detail: { key: e.key }
          }))
          return false // Don't handle in terminal
        }
      }
      return true // Handle normally in terminal
    })

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    // Create PTY
    const id = `${sessionId}-${Date.now()}`
    window.pty.create({ id, cwd, command })
      .then(() => {
        setPtyId(id)

        // Connect terminal input to PTY
        terminal.onData((data) => {
          window.pty.write(id, data)
        })

        // Connect PTY output to terminal
        const removeDataListener = window.pty.onData(id, (data) => {
          terminal.write(data)
        })

        // Handle PTY exit
        const removeExitListener = window.pty.onExit(id, (exitCode) => {
          terminal.write(`\r\n[Process exited with code ${exitCode}]\r\n`)
        })

        // Store cleanup functions
        cleanupRef.current = () => {
          removeDataListener()
          removeExitListener()
        }
      })
      .catch((err) => {
        const errorMsg = `Failed to start terminal: ${err.message || err}`
        addError(errorMsg)
        terminal.write(`\r\n\x1b[31mError: Failed to start terminal\x1b[0m\r\n`)
        terminal.write(`\x1b[33m${err.message || err}\x1b[0m\r\n`)
      })

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit()
      if (id) {
        window.pty.resize(id, terminal.cols, terminal.rows)
      }
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
      cleanupRef.current?.()
      if (ptyId) {
        window.pty.kill(ptyId)
      }
      terminal.dispose()
    }
  }, [sessionId, cwd, command])

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (fitAddonRef.current && terminalRef.current && ptyId) {
        fitAddonRef.current.fit()
        window.pty.resize(ptyId, terminalRef.current.cols, terminalRef.current.rows)
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [ptyId])

  if (!sessionId) {
    return (
      <div className="h-full flex items-center justify-center text-text-secondary">
        Select a session to view terminal
      </div>
    )
  }

  return <div ref={containerRef} className="h-full w-full" />
}
