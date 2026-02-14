import { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SerializeAddon } from '@xterm/addon-serialize'
import { useErrorStore } from '../store/errors'
import { useSessionStore } from '../store/sessions'
import { terminalBufferRegistry } from '../utils/terminalBufferRegistry'
import { evaluateActivity } from '../utils/terminalActivityDetector'
import { useTerminalKeyboard } from './useTerminalKeyboard'
import { usePlanDetection } from './usePlanDetection'

export interface TerminalConfig {
  sessionId: string | undefined
  cwd: string
  command: string | undefined
  env: Record<string, string> | undefined
  isAgentTerminal: boolean
  isActive: boolean
  restartKey: number
}

export interface TerminalSetupResult {
  terminalRef: React.MutableRefObject<XTerm | null>
  ptyIdRef: React.MutableRefObject<string | null>
  showScrollButton: boolean
  handleScrollToBottom: () => void
}

// ── Xterm theme (module-level constant) ──────────────────────────────

const XTERM_THEME = {
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
} as const

// ── Viewport helpers factory ─────────────────────────────────────────

interface ViewportHelpers {
  isAtBottom: () => boolean
  forceViewportSync: () => void
  isViewportDesynced: () => boolean
  isScrollStuck: (direction: 1 | -1) => boolean
}

function createViewportHelpers(terminal: XTerm, viewportEl: HTMLElement | null): ViewportHelpers {
  const isAtBottom = () => {
    const buffer = terminal.buffer.active
    return buffer.viewportY >= buffer.baseY - 1
  }

  // Force xterm to recalculate the viewport scroll area.
  // Works around an xterm.js issue where the DOM scroll area height gets
  // out of sync with the buffer, making scrollback unreachable.
  // We toggle terminal.resize() by +/-1 row to force syncScrollArea() --
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
  // isn't scrollable (scrollHeight ~= clientHeight).
  const isViewportDesynced = () => {
    if (!viewportEl) return false
    return terminal.buffer.active.baseY > 0 &&
      viewportEl.scrollHeight <= viewportEl.clientHeight + 1
  }

  // Check if we can scroll further in the given direction but DOM won't move.
  // direction: 1 = down, -1 = up
  const isScrollStuck = (direction: 1 | -1): boolean => {
    if (!viewportEl) return false
    const buffer = terminal.buffer.active
    if (direction === 1) {
      const notAtBufferBottom = buffer.viewportY < buffer.baseY
      const domAtBottom = viewportEl.scrollTop >= viewportEl.scrollHeight - viewportEl.clientHeight - 1
      return notAtBufferBottom && domAtBottom
    } else {
      const notAtBufferTop = buffer.viewportY > 0
      const domAtTop = viewportEl.scrollTop <= 1
      return notAtBufferTop && domAtTop
    }
  }

  return { isAtBottom, forceViewportSync, isViewportDesynced, isScrollStuck }
}

// ── Scroll tracking setup ────────────────────────────────────────────

interface ScrollTrackingState {
  pendingScrollRAF: number
  stuckScrollCount: number
  lastStuckSyncTime: number
}

interface ScrollTrackingResult {
  state: ScrollTrackingState
  updateFollowingFromScroll: (e: Event) => void
  handleKeyScroll: (e: KeyboardEvent) => void
}

function createScrollTracking(
  terminal: XTerm,
  viewportEl: HTMLElement | null,
  helpers: ViewportHelpers,
  isFollowingRef: React.MutableRefObject<boolean>,
  setShowScrollButton: React.Dispatch<React.SetStateAction<boolean>>,
): ScrollTrackingResult {
  const state: ScrollTrackingState = { pendingScrollRAF: 0, stuckScrollCount: 0, lastStuckSyncTime: 0 }

  // Track user-initiated scrolls to update following mode.
  // After a user scroll, check if they ended up at the bottom:
  //   - At bottom -> re-engage following (auto-scroll on new output)
  //   - Not at bottom -> disengage following (user is reading scrollback)
  const updateFollowingFromScroll = (e: Event) => {
    // Immediately disengage following on upward scroll gestures.
    // This MUST happen synchronously -- if we wait for rAF, the onRender
    // handler would see isFollowing=true and fight the user's scroll.
    if (e instanceof WheelEvent && e.deltaY < 0) {
      isFollowingRef.current = false
      if (state.pendingScrollRAF) {
        cancelAnimationFrame(state.pendingScrollRAF)
        state.pendingScrollRAF = 0
      }
    }

    // Unified stuck scroll detection for both directions.
    if (e instanceof WheelEvent) {
      const direction = e.deltaY > 0 ? 1 : -1
      const scrollTopBefore = viewportEl?.scrollTop ?? 0
      const viewportYBefore = terminal.buffer.active.viewportY

      requestAnimationFrame(() => {
        const scrollTopAfter = viewportEl?.scrollTop ?? 0
        const viewportYAfter = terminal.buffer.active.viewportY
        const scrollMoved = Math.abs(scrollTopAfter - scrollTopBefore) > 0.5
        const bufferMoved = viewportYAfter !== viewportYBefore

        if (!scrollMoved && !bufferMoved && helpers.isScrollStuck(direction)) {
          const now = Date.now()
          state.stuckScrollCount++
          if (state.stuckScrollCount >= 2 && now - state.lastStuckSyncTime > 500) {
            helpers.forceViewportSync()
            state.lastStuckSyncTime = now
            state.stuckScrollCount = 0
          }
        } else if (scrollMoved || bufferMoved) {
          state.stuckScrollCount = 0
        }

        const atBottom = helpers.isAtBottom()
        isFollowingRef.current = atBottom
        setShowScrollButton(!atBottom && terminal.buffer.active.baseY > 0)
      })
      return
    }

    requestAnimationFrame(() => {
      const atBottom = helpers.isAtBottom()
      isFollowingRef.current = atBottom
      setShowScrollButton(!atBottom && terminal.buffer.active.baseY > 0)
    })
  }

  const handleKeyScroll = (e: KeyboardEvent) => {
    if (e.key === 'PageUp' || (e.shiftKey && e.key === 'ArrowUp')) {
      isFollowingRef.current = false
      if (state.pendingScrollRAF) {
        cancelAnimationFrame(state.pendingScrollRAF)
        state.pendingScrollRAF = 0
      }
    }
    if (e.key === 'PageUp' || e.key === 'PageDown' ||
        (e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown'))) {
      requestAnimationFrame(() => {
        const atBottom = helpers.isAtBottom()
        isFollowingRef.current = atBottom
        setShowScrollButton(!atBottom && terminal.buffer.active.baseY > 0)
      })
    }
  }

  return { state, updateFollowingFromScroll, handleKeyScroll }
}

// ── Terminal state hook (refs, store wiring, callbacks) ──────────────

function useTerminalState(config: TerminalConfig) {
  const { sessionId, command, env, isAgentTerminal, cwd } = config

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
  const isFollowingRef = useRef(true)
  const [showScrollButton, setShowScrollButton] = useState(false)

  const commandRef = useRef(command)
  commandRef.current = command
  const envRef = useRef(env)
  envRef.current = env
  const isAgentTerminalRef = useRef(isAgentTerminal)
  isAgentTerminalRef.current = isAgentTerminal
  const cwdRef = useRef(cwd)
  cwdRef.current = cwd

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

  const sessionIdRef = useRef(sessionId)
  sessionIdRef.current = sessionId

  const handleKeyEvent = useTerminalKeyboard(ptyIdRef)
  const processPlanDetection = usePlanDetection(sessionIdRef, setPlanFileRef)

  const pendingUpdateRef = useRef<{ status?: 'working' | 'idle' | 'error'; lastMessage?: string } | null>(null)

  const flushUpdate = useCallback(() => {
    if (pendingUpdateRef.current && sessionIdRef.current) {
      updateAgentMonitorRef.current(sessionIdRef.current, pendingUpdateRef.current)
      pendingUpdateRef.current = null
    }
  }, [])

  const scheduleUpdate = useCallback((update: { status?: 'working' | 'idle' | 'error'; lastMessage?: string }) => {
    pendingUpdateRef.current = { ...pendingUpdateRef.current, ...update }
    if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current)
    if (update.status === 'working') {
      flushUpdate()
    } else {
      updateTimeoutRef.current = setTimeout(flushUpdate, 300)
    }
  }, [flushUpdate])

  const handleScrollToBottom = useCallback(() => {
    terminalRef.current?.scrollToBottom()
    isFollowingRef.current = true
    setShowScrollButton(false)
  }, [])

  return {
    terminalRef, fitAddonRef, serializeAddonRef, cleanupRef,
    updateTimeoutRef, idleTimeoutRef, lastStatusRef,
    lastUserInputRef, lastInteractionRef, ptyIdRef, isFollowingRef,
    showScrollButton, setShowScrollButton,
    commandRef, envRef, isAgentTerminalRef, cwdRef,
    addErrorRef, updateAgentMonitorRef, markSessionReadRef,
    sessionIdRef, setAgentPtyId,
    handleKeyEvent, processPlanDetection,
    scheduleUpdate, handleScrollToBottom,
  }
}

// ── Main hook ────────────────────────────────────────────────────────

/**
 * Custom hook that encapsulates all xterm.js terminal setup, PTY creation,
 * scroll following logic, activity detection, and cleanup.
 */
export function useTerminalSetup(
  config: TerminalConfig,
  containerRef: React.RefObject<HTMLDivElement | null>,
): TerminalSetupResult {
  const { sessionId, isAgentTerminal, isActive, restartKey } = config
  const s = useTerminalState(config)

  // Main terminal setup effect
  useEffect(() => {
    if (!containerRef.current || !sessionId) return

    const isAgent = s.isAgentTerminalRef.current
    const cmd = s.commandRef.current
    const envVars = s.envRef.current
    const effectCwd = s.cwdRef.current
    const effectStartTime = Date.now()

    const terminal = new XTerm({
      theme: XTERM_THEME,
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
    s.serializeAddonRef.current = serializeAddon

    terminal.open(containerRef.current)

    if (isAgent && sessionId) {
      terminalBufferRegistry.register(sessionId, () => {
        try { return serializeAddon.serialize() } catch { return '' }
      })
    }

    const viewportEl = containerRef.current.querySelector<HTMLElement>('.xterm-viewport')
    const helpers = createViewportHelpers(terminal, viewportEl)
    const scrollTracking = createScrollTracking(terminal, viewportEl, helpers, s.isFollowingRef, s.setShowScrollButton)

    let syncCheckTimeout: ReturnType<typeof setTimeout> | null = null

    terminal.onRender(() => {
      const atBottom = helpers.isAtBottom()
      s.setShowScrollButton(!atBottom && terminal.buffer.active.baseY > 0)
    })

    containerRef.current.addEventListener('wheel', scrollTracking.updateFollowingFromScroll, { passive: true })
    containerRef.current.addEventListener('touchmove', scrollTracking.updateFollowingFromScroll, { passive: true })
    containerRef.current.addEventListener('keydown', scrollTracking.handleKeyScroll)
    const scrollContainer = containerRef.current

    requestAnimationFrame(() => {
      if (containerRef.current && containerRef.current.offsetWidth > 0 && containerRef.current.offsetHeight > 0) {
        try { fitAddon.fit() } catch { /* ignore */ }
      }
    })

    terminal.attachCustomKeyEventHandler(s.handleKeyEvent)
    s.terminalRef.current = terminal
    s.fitAddonRef.current = fitAddon

    const id = `${sessionId}-${Date.now()}`
    s.ptyIdRef.current = id

    window.pty.create({ id, cwd: effectCwd, command: cmd, sessionId, env: envVars })
      .then(() => {
        if (isAgentTerminal && sessionId) s.setAgentPtyId(sessionId, id)

        terminal.onData((data) => {
          s.lastUserInputRef.current = Date.now()
          if (s.sessionIdRef.current) s.markSessionReadRef.current(s.sessionIdRef.current)
          void window.pty.write(id, data)
        })

        const removeDataListener = window.pty.onData(id, (data: string) => {
          terminal.write(data, () => {
            if (s.isFollowingRef.current) {
              terminal.scrollToBottom()
              if (!helpers.isAtBottom()) {
                scrollTracking.state.pendingScrollRAF = requestAnimationFrame(() => {
                  scrollTracking.state.pendingScrollRAF = 0
                  if (s.isFollowingRef.current) terminal.scrollToBottom()
                })
              }
            }
          })

          if (!syncCheckTimeout) {
            syncCheckTimeout = setTimeout(() => {
              syncCheckTimeout = null
              if (helpers.isViewportDesynced() || helpers.isScrollStuck(1) || helpers.isScrollStuck(-1)) {
                helpers.forceViewportSync()
              }
            }, 500)
          }

          if (isAgent) {
            s.processPlanDetection(data)
            const now = Date.now()
            const result = evaluateActivity(data.length, now, {
              lastUserInput: s.lastUserInputRef.current,
              lastInteraction: s.lastInteractionRef.current,
              lastStatus: s.lastStatusRef.current,
              startTime: effectStartTime,
            })
            if (result.status === 'working') {
              if (s.idleTimeoutRef.current) clearTimeout(s.idleTimeoutRef.current)
              s.lastStatusRef.current = 'working'
              s.scheduleUpdate({ status: 'working' })
            }
            if (result.scheduleIdle) {
              if (result.status !== 'working' && s.idleTimeoutRef.current) clearTimeout(s.idleTimeoutRef.current)
              s.idleTimeoutRef.current = setTimeout(() => {
                s.lastStatusRef.current = 'idle'
                s.scheduleUpdate({ status: 'idle' })
              }, 1000)
            }
          }
        })

        const removeExitListener = window.pty.onExit(id, (exitCode: number) => {
          terminal.write(`\r\n[Process exited with code ${exitCode}]\r\n`)
          if (isAgent && s.sessionIdRef.current) {
            s.lastStatusRef.current = 'idle'
            s.scheduleUpdate({ status: 'idle' })
          }
        })

        s.cleanupRef.current = () => { removeDataListener(); removeExitListener() }
      })
      .catch((err: unknown) => {
        const errorMsg = `Failed to start terminal: ${err instanceof Error ? err.message : String(err)}`
        s.addErrorRef.current(errorMsg)
        terminal.write(`\r\n\x1b[31mError: Failed to start terminal\x1b[0m\r\n`)
        terminal.write(`\x1b[33m${err instanceof Error ? err.message : String(err)}\x1b[0m\r\n`)
      })

    let ptyResizeTimeout: ReturnType<typeof setTimeout> | null = null
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0] as ResizeObserverEntry | undefined
      if (!entry || entry.contentRect.width === 0 || entry.contentRect.height === 0) return
      try { fitAddon.fit() } catch { /* ignore */ }
      if (s.isFollowingRef.current) {
        terminal.scrollToBottom()
        if (!helpers.isAtBottom()) {
          scrollTracking.state.pendingScrollRAF = requestAnimationFrame(() => {
            scrollTracking.state.pendingScrollRAF = 0
            if (s.isFollowingRef.current) terminal.scrollToBottom()
          })
        }
      }
      if (ptyResizeTimeout) clearTimeout(ptyResizeTimeout)
      ptyResizeTimeout = setTimeout(() => {
        if (s.ptyIdRef.current && terminal.cols > 0 && terminal.rows > 0) {
          void window.pty.resize(s.ptyIdRef.current, terminal.cols, terminal.rows)
        }
      }, 100)
    })
    const containerEl = containerRef.current
    resizeObserver.observe(containerEl)

    return () => {
      scrollContainer.removeEventListener('wheel', scrollTracking.updateFollowingFromScroll)
      scrollContainer.removeEventListener('touchmove', scrollTracking.updateFollowingFromScroll)
      scrollContainer.removeEventListener('keydown', scrollTracking.handleKeyScroll)
      resizeObserver.disconnect()
      if (ptyResizeTimeout) clearTimeout(ptyResizeTimeout)
      if (syncCheckTimeout) clearTimeout(syncCheckTimeout)
      if (scrollTracking.state.pendingScrollRAF) cancelAnimationFrame(scrollTracking.state.pendingScrollRAF)
      s.cleanupRef.current?.()
      if (s.ptyIdRef.current) { void window.pty.kill(s.ptyIdRef.current); s.ptyIdRef.current = null }
      terminal.dispose()
      if (s.updateTimeoutRef.current) clearTimeout(s.updateTimeoutRef.current)
      if (s.idleTimeoutRef.current) clearTimeout(s.idleTimeoutRef.current)
      if (isAgent && s.sessionIdRef.current && s.lastStatusRef.current === 'working') {
        s.updateAgentMonitorRef.current(s.sessionIdRef.current, { status: 'idle' })
      }
      if (isAgent && sessionId) terminalBufferRegistry.unregister(sessionId)
    }
  }, [sessionId, restartKey]) // Recreate terminal when session identity changes or on restart

  // Fit and focus when terminal becomes visible (e.g., tab switch or session selection)
  useEffect(() => {
    s.lastInteractionRef.current = Date.now()
    if (isActive) {
      requestAnimationFrame(() => {
        try { s.fitAddonRef.current?.fit() } catch { /* ignore */ }
        s.terminalRef.current?.focus()
      })
    }
  }, [isActive])

  // Track window focus/blur to suppress activity detection briefly
  useEffect(() => {
    const handleFocusChange = () => { s.lastInteractionRef.current = Date.now() }
    window.addEventListener('focus', handleFocusChange)
    window.addEventListener('blur', handleFocusChange)
    return () => {
      window.removeEventListener('focus', handleFocusChange)
      window.removeEventListener('blur', handleFocusChange)
    }
  }, [])

  return { terminalRef: s.terminalRef, ptyIdRef: s.ptyIdRef, showScrollButton: s.showScrollButton, handleScrollToBottom: s.handleScrollToBottom }
}
