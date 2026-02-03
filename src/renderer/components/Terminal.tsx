import { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SerializeAddon } from '@xterm/addon-serialize'
import { useErrorStore } from '../store/errors'
import { useSessionStore } from '../store/sessions'
import { ClaudeOutputParser } from '../utils/claudeOutputParser'
import { terminalBufferRegistry } from '../utils/terminalBufferRegistry'
import '@xterm/xterm/css/xterm.css'

interface TerminalProps {
  sessionId?: string
  cwd: string
  command?: string
  isAgentTerminal?: boolean
  isActive?: boolean
}

export default function Terminal({ sessionId, cwd, command, isAgentTerminal = false, isActive = false }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const serializeAddonRef = useRef<SerializeAddon | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const parserRef = useRef<ClaudeOutputParser | null>(null)
  const updateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [ptyId, setPtyId] = useState<string | null>(null)
  const { addError } = useErrorStore()
  const updateAgentMonitor = useSessionStore((state) => state.updateAgentMonitor)

  // Use ref for updateAgentMonitor to avoid effect re-runs
  const updateAgentMonitorRef = useRef(updateAgentMonitor)
  updateAgentMonitorRef.current = updateAgentMonitor

  // Use ref for sessionId to avoid effect re-runs
  const sessionIdRef = useRef(sessionId)
  sessionIdRef.current = sessionId

  // Debounced update to avoid flicker - collects updates over 300ms
  const pendingUpdateRef = useRef<{ status?: 'working' | 'waiting' | 'idle' | 'error'; lastMessage?: string; waitingType?: 'tool' | 'question' | 'prompt' | null } | null>(null)

  // Stable flush function using refs
  const flushUpdate = useCallback(() => {
    if (pendingUpdateRef.current && sessionIdRef.current) {
      updateAgentMonitorRef.current(sessionIdRef.current, pendingUpdateRef.current)
      pendingUpdateRef.current = null
    }
  }, [])

  // Stable schedule function
  const scheduleUpdate = useCallback((update: { status?: 'working' | 'waiting' | 'idle' | 'error'; lastMessage?: string; waitingType?: 'tool' | 'question' | 'prompt' | null }) => {
    // Merge with pending update
    pendingUpdateRef.current = {
      ...pendingUpdateRef.current,
      ...update,
    }

    // Clear existing timeout and schedule new one
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current)
    }
    updateTimeoutRef.current = setTimeout(flushUpdate, 300)
  }, [flushUpdate])

  useEffect(() => {
    if (!containerRef.current || !sessionId) return

    // Create parser for agent terminals
    if (isAgentTerminal) {
      parserRef.current = new ClaudeOutputParser()
    }

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

    const serializeAddon = new SerializeAddon()
    terminal.loadAddon(serializeAddon)
    serializeAddonRef.current = serializeAddon

    terminal.open(containerRef.current)

    // Register buffer getter for copy functionality (agent terminals only)
    if (isAgentTerminal && sessionId) {
      terminalBufferRegistry.register(sessionId, () => {
        try {
          return serializeAddon.serialize()
        } catch {
          return ''
        }
      })
    }

    // Wait for next frame to ensure container has dimensions before fitting
    requestAnimationFrame(() => {
      if (containerRef.current && containerRef.current.offsetWidth > 0 && containerRef.current.offsetHeight > 0) {
        try {
          fitAddon.fit()
        } catch (e) {
          // Ignore fit errors during initialization
        }
      }
    })

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

          // Parse output for agent terminals
          if (isAgentTerminal && parserRef.current) {
            const result = parserRef.current.processData(data)

            // Clear idle timeout since we got data
            if (idleTimeoutRef.current) {
              clearTimeout(idleTimeoutRef.current)
            }

            // Schedule update if we detected changes
            // Only include fields that have actual values to avoid overwriting good data with undefined
            if (result.status || result.message) {
              const update: { status?: 'working' | 'waiting' | 'idle' | 'error'; lastMessage?: string; waitingType?: 'tool' | 'question' | 'prompt' | null } = {}
              if (result.status) {
                update.status = result.status
              }
              if (result.message) {
                update.lastMessage = result.message
              }
              if (result.waitingType !== undefined) {
                update.waitingType = result.waitingType
              }
              scheduleUpdate(update)
            }

            // Set idle timeout - if no data for 2 seconds and not waiting, might be idle
            idleTimeoutRef.current = setTimeout(() => {
              const idleResult = parserRef.current?.checkIdle()
              if (idleResult && idleResult.status === 'idle') {
                scheduleUpdate({ status: 'idle', waitingType: null })
              }
            }, 2000)
          }
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

    // Handle resize - but don't resize when terminal is hidden (would send 0x0 to PTY)
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      // Skip resize if container has no size (hidden)
      if (!entry || entry.contentRect.width === 0 || entry.contentRect.height === 0) {
        return
      }
      try {
        fitAddon.fit()
        // Only resize PTY if we have valid dimensions
        if (id && terminal.cols > 0 && terminal.rows > 0) {
          window.pty.resize(id, terminal.cols, terminal.rows)
        }
      } catch (e) {
        // Ignore fit errors (can happen if terminal not fully initialized)
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
      // Clean up parser and timeouts
      parserRef.current?.reset()
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current)
      }
      if (idleTimeoutRef.current) {
        clearTimeout(idleTimeoutRef.current)
      }
      // Unregister buffer getter
      if (isAgentTerminal && sessionId) {
        terminalBufferRegistry.unregister(sessionId)
      }
    }
    // Note: scheduleUpdate is stable (uses refs internally) so not needed in deps
  }, [sessionId, cwd, command, isAgentTerminal, addError])

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (fitAddonRef.current && terminalRef.current && ptyId) {
        try {
          fitAddonRef.current.fit()
          if (terminalRef.current.cols > 0 && terminalRef.current.rows > 0) {
            window.pty.resize(ptyId, terminalRef.current.cols, terminalRef.current.rows)
          }
        } catch (e) {
          // Ignore fit errors
        }
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [ptyId])

  // Scroll to bottom when terminal becomes active
  useEffect(() => {
    if (isActive && terminalRef.current) {
      // Small delay to ensure terminal is visible and rendered
      const timeout = setTimeout(() => {
        terminalRef.current?.scrollToBottom()
      }, 50)
      return () => clearTimeout(timeout)
    }
  }, [isActive])

  if (!sessionId) {
    return (
      <div className="h-full flex items-center justify-center text-text-secondary">
        Select a session to view terminal
      </div>
    )
  }

  return <div ref={containerRef} className="h-full w-full p-2" />
}
