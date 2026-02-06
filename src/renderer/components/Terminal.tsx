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
  const lastUserInputRef = useRef<number>(0)
  const lastInteractionRef = useRef<number>(0)
  const ptyIdRef = useRef<string | null>(null)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const { addError } = useErrorStore()
  const updateAgentMonitor = useSessionStore((state) => state.updateAgentMonitor)
  const markSessionRead = useSessionStore((state) => state.markSessionRead)
  const setAgentPtyId = useSessionStore((state) => state.setAgentPtyId)

  const updateAgentMonitorRef = useRef(updateAgentMonitor)
  updateAgentMonitorRef.current = updateAgentMonitor
  const markSessionReadRef = useRef(markSessionRead)
  markSessionReadRef.current = markSessionRead

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

  const handleScrollToBottom = useCallback(() => {
    terminalRef.current?.scrollToBottom()
    setShowScrollButton(false)
  }, [])

  useEffect(() => {
    if (!containerRef.current || !sessionId) return

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

    if (isAgentTerminal && sessionId) {
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
      return buffer.viewportY >= buffer.baseY - 3
    }

    // Update "Go to End" button after every render — catches fit()-induced
    // displacement, data writes, and user scrolls. No scroll enforcement.
    terminal.onRender(() => {
      setShowScrollButton(!isAtBottom() && terminal.buffer.active.baseY > 0)
    })

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

    window.pty.create({ id, cwd, command, sessionId, env })
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
          terminal.write(data)

          // Activity detection for agent terminals
          if (isAgentTerminal && data.length > 0 && (Date.now() - effectStartTime >= 5000)) {
            const now = Date.now()
            const timeSinceInput = now - lastUserInputRef.current
            const timeSinceInteraction = now - lastInteractionRef.current
            const isPaused = timeSinceInput < 200 || timeSinceInteraction < 200

            if (isPaused) {
              if (idleTimeoutRef.current) {
                clearTimeout(idleTimeoutRef.current)
              }
              idleTimeoutRef.current = setTimeout(() => {
                lastStatusRef.current = 'idle'
                scheduleUpdate({ status: 'idle' })
              }, 1000)
              return
            }

            if (idleTimeoutRef.current) {
              clearTimeout(idleTimeoutRef.current)
            }

            lastStatusRef.current = 'working'
            scheduleUpdate({ status: 'working' })

            idleTimeoutRef.current = setTimeout(() => {
              lastStatusRef.current = 'idle'
              scheduleUpdate({ status: 'idle' })
            }, 1000)
          }
        })

        const removeExitListener = window.pty.onExit(id, (exitCode) => {
          terminal.write(`\r\n[Process exited with code ${exitCode}]\r\n`)
          if (isAgentTerminal && sessionIdRef.current) {
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
        addError(errorMsg)
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
      terminal.scrollToBottom()
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
      resizeObserver.disconnect()
      if (ptyResizeTimeout) clearTimeout(ptyResizeTimeout)
      cleanupRef.current?.()
      if (ptyIdRef.current) {
        window.pty.kill(ptyIdRef.current)
        ptyIdRef.current = null
      }
      terminal.dispose()
      if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current)
      if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current)
      if (isAgentTerminal && sessionIdRef.current && lastStatusRef.current === 'working') {
        updateAgentMonitorRef.current(sessionIdRef.current, { status: 'idle' })
      }
      if (isAgentTerminal && sessionId) {
        terminalBufferRegistry.unregister(sessionId)
      }
    }
  }, [sessionId, cwd, command, env, isAgentTerminal, addError])

  // Fit when terminal becomes visible (e.g., tab switch)
  useEffect(() => {
    lastInteractionRef.current = Date.now()
    if (isActive && fitAddonRef.current) {
      requestAnimationFrame(() => {
        try { fitAddonRef.current?.fit() } catch { /* ignore */ }
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
    <div className="h-full w-full p-2 relative">
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
