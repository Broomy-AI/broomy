import { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SerializeAddon } from '@xterm/addon-serialize'
import { useErrorStore } from '../store/errors'
import { useSessionStore } from '../store/sessions'
import { terminalBufferRegistry } from '../utils/terminalBufferRegistry'
import '@xterm/xterm/css/xterm.css'

interface TerminalProps {
  sessionId?: string
  cwd: string
  command?: string
  env?: Record<string, string>
  isAgentTerminal?: boolean
  isActive?: boolean
}

export default function Terminal({ sessionId, cwd, command, env, isAgentTerminal = false, isActive = false }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const serializeAddonRef = useRef<SerializeAddon | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const updateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastStatusRef = useRef<'working' | 'idle'>('idle')
  const lastUserInputRef = useRef<number>(0)  // Track when user last typed
  const lastInteractionRef = useRef<number>(0)  // Track focus/session changes
  const [ptyId, setPtyId] = useState<string | null>(null)
  const { addError } = useErrorStore()
  const updateAgentMonitor = useSessionStore((state) => state.updateAgentMonitor)
  const markSessionRead = useSessionStore((state) => state.markSessionRead)

  // Use ref for updateAgentMonitor to avoid effect re-runs
  const updateAgentMonitorRef = useRef(updateAgentMonitor)
  updateAgentMonitorRef.current = updateAgentMonitor
  const markSessionReadRef = useRef(markSessionRead)
  markSessionReadRef.current = markSessionRead

  // Use ref for sessionId to avoid effect re-runs
  const sessionIdRef = useRef(sessionId)
  sessionIdRef.current = sessionId

  // Debounced update to avoid flicker - collects updates over 300ms
  const pendingUpdateRef = useRef<{ status?: 'working' | 'idle' | 'error'; lastMessage?: string } | null>(null)

  // Stable flush function using refs
  const flushUpdate = useCallback(() => {
    if (pendingUpdateRef.current && sessionIdRef.current) {
      updateAgentMonitorRef.current(sessionIdRef.current, pendingUpdateRef.current)
      pendingUpdateRef.current = null
    }
  }, [])

  // Stable schedule function
  const scheduleUpdate = useCallback((update: { status?: 'working' | 'idle' | 'error'; lastMessage?: string }) => {
    // Merge with pending update
    pendingUpdateRef.current = {
      ...pendingUpdateRef.current,
      ...update,
    }

    // Clear existing timeout
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current)
    }

    // Flush immediately for status changes to 'working' (responsive feedback)
    // Debounce for idle transitions (avoid flicker when activity resumes quickly)
    if (update.status === 'working') {
      flushUpdate()
    } else {
      updateTimeoutRef.current = setTimeout(flushUpdate, 300)
    }
  }, [flushUpdate])

  useEffect(() => {
    if (!containerRef.current || !sessionId) return

    // Grace period: ignore status updates for 5 seconds after terminal creation
    // to avoid false "needs attention" on startup when the agent does initial output
    const effectStartTime = Date.now()

    // Create terminal
    const terminal = new XTerm({
      theme: {
        background: '#1a1a1a',
        foreground: '#e0e0e0',
        cursor: '#e0e0e0',
        cursorAccent: '#1a1a1a',
        selectionBackground: '#4a9eff40',
        black: '#5c5c5c',
        brightBlack: '#888888',
        red: '#ff6b6b',
        brightRed: '#ff9999',
        green: '#69db7c',
        brightGreen: '#8ce99a',
        yellow: '#ffd43b',
        brightYellow: '#ffe066',
        blue: '#74c0fc',
        brightBlue: '#a5d8ff',
        magenta: '#da77f2',
        brightMagenta: '#e599f7',
        cyan: '#66d9e8',
        brightCyan: '#99e9f2',
        white: '#e8e8e8',
        brightWhite: '#ffffff',
      },
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 10000,
      minimumContrastRatio: 7,
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
        fitAndScroll()
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

    // Helper: fit terminal, preserving scroll position. If viewport was at
    // the bottom before fit, scroll back to bottom after (since fit can
    // displace the viewport). xterm natively auto-scrolls on new content
    // when at the bottom, so we don't need custom follow-mode tracking.
    const fitAndScroll = () => {
      try {
        const buffer = terminal.buffer.active
        const wasAtBottom = buffer.viewportY >= buffer.baseY - 3
        fitAddon.fit()
        if (wasAtBottom) {
          terminal.scrollToBottom()
        }
      } catch (e) {
        // Ignore fit errors
      }
    }

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    // Create PTY (pass sessionId and agent env vars)
    const id = `${sessionId}-${Date.now()}`
    window.pty.create({ id, cwd, command, sessionId, env })
      .then(() => {
        setPtyId(id)

        // Connect terminal input to PTY
        terminal.onData((data) => {
          lastUserInputRef.current = Date.now()  // Track user typing
          // Typing clears "needs attention" - if you're typing, you're paying attention
          if (sessionIdRef.current) {
            markSessionReadRef.current(sessionIdRef.current)
          }
          window.pty.write(id, data)
        })

        // Connect PTY output to terminal
        // xterm natively auto-scrolls when viewport is at bottom - no manual scrollToBottom needed
        const removeDataListener = window.pty.onData(id, (data) => {
          terminal.write(data)

          // Simple activity detection: any terminal output = working
          // Just pause briefly after user interaction to avoid false positives
          // Skip status updates during startup grace period to avoid false "needs attention"
          if (isAgentTerminal && data.length > 0 && (Date.now() - effectStartTime >= 5000)) {
            const now = Date.now()
            const timeSinceInput = now - lastUserInputRef.current
            const timeSinceInteraction = now - lastInteractionRef.current
            const isPaused = timeSinceInput < 200 || timeSinceInteraction < 200

            // During pause: don't update status to working, but still set idle timeout
            // This handles the case where user presses Escape to stop Claude -
            // we don't want to show "working" for the stop message, but we do want
            // to eventually show "idle" if nothing else happens
            if (isPaused) {
              // Clear and reset idle timeout - if no non-paused activity for 1 second, go idle
              if (idleTimeoutRef.current) {
                clearTimeout(idleTimeoutRef.current)
              }
              idleTimeoutRef.current = setTimeout(() => {
                lastStatusRef.current = 'idle'
                scheduleUpdate({ status: 'idle' })
              }, 1000)
              return
            }

            // Clear idle timeout since we got activity
            if (idleTimeoutRef.current) {
              clearTimeout(idleTimeoutRef.current)
            }

            lastStatusRef.current = 'working'
            scheduleUpdate({ status: 'working' })

            // Set idle timeout - if no activity for 1 second, mark as idle
            idleTimeoutRef.current = setTimeout(() => {
              lastStatusRef.current = 'idle'
              scheduleUpdate({ status: 'idle' })
            }, 1000)
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
      fitAndScroll()
      // Only resize PTY if we have valid dimensions
      if (id && terminal.cols > 0 && terminal.rows > 0) {
        window.pty.resize(id, terminal.cols, terminal.rows)
      }
    })
    const containerEl = containerRef.current
    resizeObserver.observe(containerEl)

    return () => {
      resizeObserver.disconnect()
      cleanupRef.current?.()
      if (ptyId) {
        window.pty.kill(ptyId)
      }
      terminal.dispose()
      // Clean up timeouts
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
  // Note: env is included to recreate PTY if env changes, but this is rare
  }, [sessionId, cwd, command, env, isAgentTerminal, addError])

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (fitAddonRef.current && terminalRef.current && ptyId) {
        try {
          const buffer = terminalRef.current.buffer.active
          const wasAtBottom = buffer.viewportY >= buffer.baseY - 3
          fitAddonRef.current.fit()
          if (wasAtBottom) {
            terminalRef.current.scrollToBottom()
          }
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
  // Also track session changes to suppress activity detection briefly
  useEffect(() => {
    lastInteractionRef.current = Date.now()  // Session switched
    if (isActive && terminalRef.current && fitAddonRef.current) {
      // Use rAF to ensure the container is visible and has dimensions before fitting
      requestAnimationFrame(() => {
        try {
          fitAddonRef.current?.fit()
        } catch (e) {
          // Ignore fit errors
        }
        terminalRef.current?.scrollToBottom()
      })
    }
  }, [isActive])

  // Track window focus/blur to suppress activity detection briefly
  useEffect(() => {
    const handleFocusChange = () => {
      lastInteractionRef.current = Date.now()
    }
    window.addEventListener('focus', handleFocusChange)
    window.addEventListener('blur', handleFocusChange)
    return () => {
      window.removeEventListener('focus', handleFocusChange)
      window.removeEventListener('blur', handleFocusChange)
    }
  }, [])

  if (!sessionId) {
    return (
      <div className="h-full flex items-center justify-center text-text-secondary">
        Select a session to view terminal
      </div>
    )
  }

  return (
    <div className="h-full w-full p-2">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  )
}
