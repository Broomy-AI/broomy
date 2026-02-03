import { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SerializeAddon } from '@xterm/addon-serialize'
import { useErrorStore } from '../store/errors'
import { useSessionStore } from '../store/sessions'
import { ClaudeHooksStateTracker, type HookEvent } from '../utils/claudeHooksState'
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
  const hooksTrackerRef = useRef<ClaudeHooksStateTracker | null>(null)
  const updateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hooksCleanupRef = useRef<(() => void) | null>(null)
  const lastStatusRef = useRef<'working' | 'waiting' | 'idle'>('idle')
  const lastUserInputRef = useRef<number>(0)  // Track when user last typed
  const lastInteractionRef = useRef<number>(0)  // Track focus/session changes
  const lastHooksUpdateRef = useRef<number>(0)  // Track when hooks last provided an update
  const [ptyId, setPtyId] = useState<string | null>(null)
  // Track if user has scrolled up (disable auto-scroll)
  const isFollowingRef = useRef(true)
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

    // Create hooks tracker for agent terminals
    // Status detection is handled entirely by hooks (PreToolUse, PostToolUse, PermissionRequest, Stop)
    if (isAgentTerminal) {
      hooksTrackerRef.current = new ClaudeHooksStateTracker()

      // Start watching for hook events
      window.hooks.clear(sessionId).then(() => {
        window.hooks.watch(sessionId)
      })

      // Listen for hook events
      const removeHooksListener = window.hooks.onEvent(sessionId, (event: HookEvent) => {
        if (!hooksTrackerRef.current) return

        const state = hooksTrackerRef.current.processEvent(event)

        // Hook events are authoritative - update immediately
        const update: { status?: 'working' | 'waiting' | 'idle' | 'error'; lastMessage?: string; waitingType?: 'tool' | 'question' | 'prompt' | null } = {}

        if (state.status) {
          update.status = state.status
        }
        if (state.lastMessage) {
          update.lastMessage = state.lastMessage
        }
        if (state.waitingType !== undefined) {
          update.waitingType = state.waitingType
        }

        // Mark that hooks provided this update - prevent terminal parsing from overwriting for 2 seconds
        lastHooksUpdateRef.current = Date.now()

        scheduleUpdate(update)
      })

      hooksCleanupRef.current = () => {
        removeHooksListener()
        window.hooks.unwatch(sessionId)
      }
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

    // Track scroll position to implement follow mode
    // When user scrolls up, disable auto-scroll; when they scroll to bottom, re-enable
    const checkIfAtBottom = () => {
      const buffer = terminal.buffer.active
      // We're at bottom if viewport is at or very close to the base (within 2 rows)
      const atBottom = buffer.viewportY >= buffer.baseY - 2
      isFollowingRef.current = atBottom
    }

    // Listen for scroll events
    terminal.onScroll(() => {
      checkIfAtBottom()
    })

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    // Create PTY (pass sessionId for hooks integration and agent env vars)
    const id = `${sessionId}-${Date.now()}`
    window.pty.create({ id, cwd, command, sessionId, env })
      .then(() => {
        setPtyId(id)

        // Connect terminal input to PTY
        terminal.onData((data) => {
          lastUserInputRef.current = Date.now()  // Track user typing
          window.pty.write(id, data)
        })

        // Connect PTY output to terminal
        const removeDataListener = window.pty.onData(id, (data) => {
          terminal.write(data)

          // Auto-scroll to bottom if in follow mode
          if (isFollowingRef.current) {
            terminal.scrollToBottom()
          }

          // Simple activity detection: any terminal output = working
          // Just pause briefly after user interaction to avoid false positives
          if (isAgentTerminal && data.length > 0) {
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
                scheduleUpdate({ status: 'idle', waitingType: null })
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
              scheduleUpdate({ status: 'idle', waitingType: null })
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
      hooksCleanupRef.current?.()
      if (ptyId) {
        window.pty.kill(ptyId)
      }
      terminal.dispose()
      // Clean up hooks tracker and timeouts
      hooksTrackerRef.current?.reset()
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

  // Scroll to bottom when terminal becomes active (and reset to follow mode)
  // Also track session changes to suppress activity detection briefly
  useEffect(() => {
    lastInteractionRef.current = Date.now()  // Session switched
    if (isActive && terminalRef.current) {
      // Small delay to ensure terminal is visible and rendered
      const timeout = setTimeout(() => {
        terminalRef.current?.scrollToBottom()
        isFollowingRef.current = true
      }, 50)
      return () => clearTimeout(timeout)
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

  return <div ref={containerRef} className="h-full w-full p-2" />
}
