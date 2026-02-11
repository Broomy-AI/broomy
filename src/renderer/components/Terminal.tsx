import { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SerializeAddon } from '@xterm/addon-serialize'
import { useErrorStore } from '../store/errors'
import { useSessionStore } from '../store/sessions'
import { terminalBufferRegistry } from '../utils/terminalBufferRegistry'
import { stripAnsi } from '../utils/stripAnsi'
import { evaluateActivity } from '../utils/terminalActivityDetector'
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
  const lastUserInputRef = useRef<number>(0)
  const lastInteractionRef = useRef<number>(0)
  const ptyIdRef = useRef<string | null>(null)
  const commandRef = useRef(command)
  commandRef.current = command
  const envRef = useRef(env)
  envRef.current = env
  const isAgentTerminalRef = useRef(isAgentTerminal)
  isAgentTerminalRef.current = isAgentTerminal
  const cwdRef = useRef(cwd)
  cwdRef.current = cwd
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [restartKey, setRestartKey] = useState(0)
  const isFollowingRef = useRef(true)
  const { addError } = useErrorStore()
  const addErrorRef = useRef(addError)
  addErrorRef.current = addError
  const updateAgentMonitor = useSessionStore((state) => state.updateAgentMonitor)
  const markSessionRead = useSessionStore((state) => state.markSessionRead)
  const setPlanFile = useSessionStore((state) => state.setPlanFile)
  const setAgentPtyId = useSessionStore((state) => state.setAgentPtyId)

  const updateAgentMonitorRef = useRef(updateAgentMonitor)
  updateAgentMonitorRef.current = updateAgentMonitor
  const markSessionReadRef = useRef(markSessionRead)
  markSessionReadRef.current = markSessionRead
  const setPlanFileRef = useRef(setPlanFile)
  setPlanFileRef.current = setPlanFile

  // Rolling buffer for plan file detection (agent terminals only)
  const planDetectionBufferRef = useRef('')
  const lastDetectedPlanRef = useRef<string | null>(null)

  const sessionIdRef = useRef(sessionId)
  sessionIdRef.current = sessionId

  const pendingUpdateRef = useRef<{ status?: 'working' | 'idle' | 'error'; lastMessage?: string } | null>(null)

  const flushUpdate = useCallback(() => {
    if (pendingUpdateRef.current && sessionIdRef.current) {
      updateAgentMonitorRef.current(sessionIdRef.current, pendingUpdateRef.current)
      pendingUpdateRef.current = null
    }
  }, [])

  const scheduleUpdate = useCallback((update: { status?: 'working' | 'idle' | 'error'; lastMessage?: string }) => {
    pendingUpdateRef.current = {
      ...pendingUpdateRef.current,
      ...update,
    }
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current)
    }
    if (update.status === 'working') {
      flushUpdate()
    } else {
      updateTimeoutRef.current = setTimeout(flushUpdate, 300)
    }
  }, [flushUpdate])

  const handleContextMenu = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault()
    const hasSelection = terminalRef.current?.hasSelection() ?? false
    const items = [
      { id: 'copy', label: 'Copy', enabled: hasSelection },
      { id: 'paste', label: 'Paste' },
      ...(isAgentTerminal ? [
        { id: 'sep', label: '', type: 'separator' as const },
        { id: 'restart-agent', label: 'Restart Agent' },
      ] : []),
    ]
    const result = await window.menu.popup(items)
    if (result === 'copy' && terminalRef.current) {
      const text = terminalRef.current.getSelection()
      if (text) navigator.clipboard.writeText(text)
    } else if (result === 'paste' && ptyIdRef.current) {
      const text = await navigator.clipboard.readText()
      if (text) window.pty.write(ptyIdRef.current, text)
    } else if (result === 'restart-agent') {
      setRestartKey((k) => k + 1)
    }
  }, [isAgentTerminal])

  const handleScrollToBottom = useCallback(() => {
    terminalRef.current?.scrollToBottom()
    isFollowingRef.current = true
    setShowScrollButton(false)
  }, [])

  useEffect(() => {
    if (!containerRef.current || !sessionId) return

    // Capture ref values at effect creation time — these won't change for a given session
    const isAgent = isAgentTerminalRef.current
    const cmd = commandRef.current
    const envVars = envRef.current
    const effectCwd = cwdRef.current
    const effectStartTime = Date.now()

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
      scrollback: 5000,
      minimumContrastRatio: 7,
      macOptionIsMeta: true,
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)

    const serializeAddon = new SerializeAddon()
    terminal.loadAddon(serializeAddon)
    serializeAddonRef.current = serializeAddon

    terminal.open(containerRef.current)

    if (isAgent && sessionId) {
      terminalBufferRegistry.register(sessionId, () => {
        try {
          return serializeAddon.serialize()
        } catch {
          return ''
        }
      })
    }

    const isAtBottom = () => {
      const buffer = terminal.buffer.active
      return buffer.viewportY >= buffer.baseY - 1
    }

    // Track whether we just wrote data — helps diagnose desyncs
    let lastWriteTime = 0
    // Pending rAF id for scroll-to-bottom retry (lets us cancel on user scroll)
    let pendingScrollRAF = 0

    // Cache the xterm viewport element for cheap desync checks
    const viewportEl = containerRef.current!.querySelector('.xterm-viewport') as HTMLElement | null

    // Force xterm to recalculate the viewport scroll area.
    // Works around an xterm.js issue where the DOM scroll area height gets
    // out of sync with the buffer, making scrollback unreachable.
    // We toggle terminal.resize() by ±1 row to force syncScrollArea() —
    // the intermediate state is never painted because the browser batches
    // DOM updates within a single JS turn.
    const forceViewportSync = () => {
      const { cols, rows } = terminal
      if (cols > 0 && rows > 1) {
        terminal.resize(cols, rows + 1)
        terminal.resize(cols, rows)
      }
    }

    // Check if the viewport scroll area is desynced from the buffer.
    // Returns true if buffer has scrollback content but the DOM viewport
    // isn't scrollable (scrollHeight ≈ clientHeight).
    const isViewportDesynced = () => {
      if (!viewportEl) return false
      return terminal.buffer.active.baseY > 0 &&
        viewportEl.scrollHeight <= viewportEl.clientHeight + 1
    }

    // Debounce timer for proactive viewport sync checks after data writes
    let syncCheckTimeout: ReturnType<typeof setTimeout> | null = null

    // Update the scroll button visibility on render frames.
    // NOTE: We intentionally do NOT auto-correct scroll position here.
    // The write callback handles scrolling, and onRender just updates the UI.
    // Previous auto-correct here caused a race: onRender fired before the
    // wheel handler's rAF could disengage following mode, so scrollToBottom()
    // fought user scroll attempts.
    terminal.onRender(() => {
      const atBottom = isAtBottom()
      setShowScrollButton(!atBottom && terminal.buffer.active.baseY > 0)
    })

    // Track user-initiated scrolls to update following mode.
    // After a user scroll, check if they ended up at the bottom:
    //   - At bottom → re-engage following (auto-scroll on new output)
    //   - Not at bottom → disengage following (user is reading scrollback)
    const updateFollowingFromScroll = (e: Event) => {
      // Immediately disengage following on upward scroll gestures.
      // This MUST happen synchronously — if we wait for rAF, the onRender
      // handler would see isFollowing=true and fight the user's scroll.
      if (e instanceof WheelEvent && e.deltaY < 0) {
        // If the viewport is desynced, fix it immediately so this scroll
        // gesture actually works (user shouldn't have to scroll twice).
        if (isViewportDesynced()) {
          forceViewportSync()
        }
        isFollowingRef.current = false
        // Cancel any pending scroll-to-bottom retry from a recent write
        if (pendingScrollRAF) {
          cancelAnimationFrame(pendingScrollRAF)
          pendingScrollRAF = 0
        }
      }

      requestAnimationFrame(() => {
        const atBottom = isAtBottom()
        isFollowingRef.current = atBottom
        setShowScrollButton(!atBottom && terminal.buffer.active.baseY > 0)
      })
    }
    const handleKeyScroll = (e: KeyboardEvent) => {
      if (e.key === 'PageUp' || (e.shiftKey && e.key === 'ArrowUp')) {
        // Immediately disengage following on upward keyboard scroll
        isFollowingRef.current = false
        if (pendingScrollRAF) {
          cancelAnimationFrame(pendingScrollRAF)
          pendingScrollRAF = 0
        }
      }
      if (e.key === 'PageUp' || e.key === 'PageDown' ||
          (e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown'))) {
        requestAnimationFrame(() => {
          const atBottom = isAtBottom()
          isFollowingRef.current = atBottom
          setShowScrollButton(!atBottom && terminal.buffer.active.baseY > 0)
        })
      }
    }
    containerRef.current.addEventListener('wheel', updateFollowingFromScroll, { passive: true })
    containerRef.current.addEventListener('touchmove', updateFollowingFromScroll, { passive: true })
    containerRef.current.addEventListener('keydown', handleKeyScroll)
    const scrollContainer = containerRef.current

    // Initial fit
    requestAnimationFrame(() => {
      if (containerRef.current && containerRef.current.offsetWidth > 0 && containerRef.current.offsetHeight > 0) {
        try { fitAddon.fit() } catch { /* ignore */ }
      }
    })

    // Keyboard shortcuts
    terminal.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'Tab') {
        return false
      }
      if (e.shiftKey && e.key === 'Enter') {
        if (e.type === 'keydown' && ptyIdRef.current) {
          window.pty.write(ptyIdRef.current, '\x1b[13;2u')
        }
        return false
      }
      if (e.metaKey && e.key === 'ArrowLeft') {
        if (e.type === 'keydown' && ptyIdRef.current) {
          window.pty.write(ptyIdRef.current, '\x01')
        }
        return false
      }
      if (e.metaKey && e.key === 'ArrowRight') {
        if (e.type === 'keydown' && ptyIdRef.current) {
          window.pty.write(ptyIdRef.current, '\x05')
        }
        return false
      }
      if (e.type !== 'keydown') return true
      if (e.metaKey && e.key === 'Backspace') {
        if (ptyIdRef.current) {
          window.pty.write(ptyIdRef.current, '\x15')
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
    })

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    const id = `${sessionId}-${Date.now()}`
    ptyIdRef.current = id

    window.pty.create({ id, cwd: effectCwd, command: cmd, sessionId, env: envVars })
      .then(() => {
        // Expose PTY ID to session store for review panel to send commands
        if (isAgentTerminal && sessionId) {
          setAgentPtyId(sessionId, id)
        }

        terminal.onData((data) => {
          lastUserInputRef.current = Date.now()
          if (sessionIdRef.current) {
            markSessionReadRef.current(sessionIdRef.current)
          }
          window.pty.write(id, data)
        })

        const removeDataListener = window.pty.onData(id, (data) => {
          terminal.write(data, () => {
            lastWriteTime = Date.now()
            // After the write is parsed and applied to the buffer,
            // scroll to bottom if we're in following mode.
            if (isFollowingRef.current) {
              terminal.scrollToBottom()
              // If the DOM scroll area height is stale (hasn't been updated
              // by xterm's render yet), scrollToBottom() gets clamped by the
              // browser. Retry after the next frame when the DOM is current.
              if (!isAtBottom()) {
                pendingScrollRAF = requestAnimationFrame(() => {
                  pendingScrollRAF = 0
                  if (isFollowingRef.current) {
                    terminal.scrollToBottom()
                  }
                })
              }
            }
          })

          // Proactive viewport desync check — debounced so we don't
          // do the DOM read on every single data chunk.
          if (!syncCheckTimeout) {
            syncCheckTimeout = setTimeout(() => {
              syncCheckTimeout = null
              if (isViewportDesynced()) {
                forceViewportSync()
              }
            }, 500)
          }

          // Plan file detection for agent terminals
          if (isAgent && sessionIdRef.current) {
            const stripped = stripAnsi(data)
            planDetectionBufferRef.current += stripped
            if (planDetectionBufferRef.current.length > 1000) {
              planDetectionBufferRef.current = planDetectionBufferRef.current.slice(-1000)
            }
            const planMatch = planDetectionBufferRef.current.match(/\/[^\s)]+\.claude-personal\/plans\/[^\s)]+\.md/)
            if (planMatch && planMatch[0] !== lastDetectedPlanRef.current) {
              lastDetectedPlanRef.current = planMatch[0]
              setPlanFileRef.current(sessionIdRef.current, planMatch[0])
            }
          }

          // Activity detection for agent terminals
          if (isAgent) {
            const now = Date.now()
            const result = evaluateActivity(data.length, now, {
              lastUserInput: lastUserInputRef.current,
              lastInteraction: lastInteractionRef.current,
              lastStatus: lastStatusRef.current,
              startTime: effectStartTime,
            })

            if (result.status === 'working') {
              if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current)
              lastStatusRef.current = 'working'
              scheduleUpdate({ status: 'working' })
            }

            if (result.scheduleIdle) {
              if (result.status !== 'working' && idleTimeoutRef.current) {
                clearTimeout(idleTimeoutRef.current)
              }
              idleTimeoutRef.current = setTimeout(() => {
                lastStatusRef.current = 'idle'
                scheduleUpdate({ status: 'idle' })
              }, 1000)
            }
          }
        })

        const removeExitListener = window.pty.onExit(id, (exitCode) => {
          terminal.write(`\r\n[Process exited with code ${exitCode}]\r\n`)
          if (isAgent && sessionIdRef.current) {
            lastStatusRef.current = 'idle'
            scheduleUpdate({ status: 'idle' })
          }
        })

        cleanupRef.current = () => {
          removeDataListener()
          removeExitListener()
        }
      })
      .catch((err) => {
        const errorMsg = `Failed to start terminal: ${err.message || err}`
        addErrorRef.current(errorMsg)
        terminal.write(`\r\n\x1b[31mError: Failed to start terminal\x1b[0m\r\n`)
        terminal.write(`\x1b[33m${err.message || err}\x1b[0m\r\n`)
      })

    // fit() immediately on every resize so the grid stays in sync with the container.
    // Only debounce the PTY resize IPC (which triggers remote re-rendering).
    let ptyResizeTimeout: ReturnType<typeof setTimeout> | null = null
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry || entry.contentRect.width === 0 || entry.contentRect.height === 0) {
        return
      }
      try { fitAddon.fit() } catch { /* ignore */ }
      if (isFollowingRef.current) {
        terminal.scrollToBottom()
        // fit() changes terminal dimensions which can leave the DOM stale.
        // Retry scroll after the next frame.
        if (!isAtBottom()) {
          pendingScrollRAF = requestAnimationFrame(() => {
            pendingScrollRAF = 0
            if (isFollowingRef.current) {
              terminal.scrollToBottom()
            }
          })
        }
      }
      if (ptyResizeTimeout) clearTimeout(ptyResizeTimeout)
      ptyResizeTimeout = setTimeout(() => {
        if (ptyIdRef.current && terminal.cols > 0 && terminal.rows > 0) {
          window.pty.resize(ptyIdRef.current, terminal.cols, terminal.rows)
        }
      }, 100)
    })
    const containerEl = containerRef.current
    resizeObserver.observe(containerEl)

    return () => {
      scrollContainer.removeEventListener('wheel', updateFollowingFromScroll)
      scrollContainer.removeEventListener('touchmove', updateFollowingFromScroll)
      scrollContainer.removeEventListener('keydown', handleKeyScroll)
      resizeObserver.disconnect()
      if (ptyResizeTimeout) clearTimeout(ptyResizeTimeout)
      if (syncCheckTimeout) clearTimeout(syncCheckTimeout)
      if (pendingScrollRAF) cancelAnimationFrame(pendingScrollRAF)
      cleanupRef.current?.()
      if (ptyIdRef.current) {
        window.pty.kill(ptyIdRef.current)
        ptyIdRef.current = null
      }
      terminal.dispose()
      if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current)
      if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current)
      if (isAgent && sessionIdRef.current && lastStatusRef.current === 'working') {
        updateAgentMonitorRef.current(sessionIdRef.current, { status: 'idle' })
      }
      if (isAgent && sessionId) {
        terminalBufferRegistry.unregister(sessionId)
      }
    }
  }, [sessionId, restartKey]) // Recreate terminal when session identity changes or on restart

  // Fit and focus when terminal becomes visible (e.g., tab switch or session selection)
  useEffect(() => {
    lastInteractionRef.current = Date.now()
    if (isActive) {
      requestAnimationFrame(() => {
        try { fitAddonRef.current?.fit() } catch { /* ignore */ }
        terminalRef.current?.focus()
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
    <div className="h-full w-full p-2 relative" onContextMenu={handleContextMenu}>
      <div ref={containerRef} className="h-full w-full" />
      {showScrollButton && (
        <button
          onClick={handleScrollToBottom}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-1.5 text-xs font-medium rounded-full bg-accent text-white hover:bg-accent/80 shadow-lg transition-colors z-10"
        >
          Go to End &#x2193;
        </button>
      )}
    </div>
  )
}
