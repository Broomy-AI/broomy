/**
 * Sets up and manages the xterm.js terminal instance including PTY creation, resize handling, buffer restoration, and scroll tracking.
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SerializeAddon } from '@xterm/addon-serialize'

import { useSessionStore } from '../store/sessions'
import { useRepoStore } from '../store/repos'
import { terminalBufferRegistry } from '../utils/terminalBufferRegistry'
import { useTerminalKeyboard } from './useTerminalKeyboard'
import { usePlanDetection } from './usePlanDetection'
import { createPtyDataHandler } from './ptyDataHandler'

export interface TerminalConfig {
  sessionId: string | undefined
  cwd: string
  command: string | undefined
  env: Record<string, string> | undefined
  isAgentTerminal: boolean
  isServicesTerminal?: boolean
  restartKey: number
  isolated?: boolean
  repoRootDir?: string
  /** Store session ID — used to subscribe to activation state without re-rendering. */
  storeSessionId?: string
  /** Tab ID within the session — used with storeSessionId to detect activation. */
  tabId?: string
}

export interface ExitInfo {
  code: number
  message: string
  detail?: string
}

export interface TerminalSetupResult {
  terminalRef: React.MutableRefObject<XTerm | null>
  ptyIdRef: React.MutableRefObject<string | null>
  isActiveRef: React.MutableRefObject<boolean>
  showScrollButton: boolean
  handleScrollToBottom: () => void
  exitInfo: ExitInfo | null
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

export interface ViewportHelpers {
  isAtBottom: () => boolean
}

function createViewportHelpers(terminal: XTerm): ViewportHelpers {
  const isAtBottom = () => {
    const buffer = terminal.buffer.active
    return buffer.viewportY >= buffer.baseY
  }

  return { isAtBottom }
}

// ── Scroll tracking setup ────────────────────────────────────────────

interface ScrollTrackingState {
  pendingScrollRAF: number
}

interface ScrollTrackingResult {
  state: ScrollTrackingState
  updateFollowingFromScroll: (e: Event) => void
  handleKeyScroll: (e: KeyboardEvent) => void
}

function createScrollTracking(
  terminal: XTerm,
  helpers: ViewportHelpers,
  isFollowingRef: React.MutableRefObject<boolean>,
  setShowScrollButton: React.Dispatch<React.SetStateAction<boolean>>,
): ScrollTrackingResult {
  const state: ScrollTrackingState = { pendingScrollRAF: 0 }

  const updateFollowingFromScroll = (e: Event) => {
    // Immediately disengage following on upward scroll gestures.
    const isScrollUp = e instanceof WheelEvent && e.deltaY < 0
    if (isScrollUp) {
      isFollowingRef.current = false
      if (state.pendingScrollRAF) {
        cancelAnimationFrame(state.pendingScrollRAF)
        state.pendingScrollRAF = 0
      }
    }

    requestAnimationFrame(() => {
      const atBottom = helpers.isAtBottom()
      // Only re-engage following on downward scroll that reaches bottom.
      // Don't override the explicit upward-scroll disengage — the rAF may
      // fire before the viewport has actually moved, falsely reading "at bottom".
      if (!isScrollUp) {
        isFollowingRef.current = atBottom
      }
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
  const { sessionId, command, env, isAgentTerminal, cwd, isolated, repoRootDir } = config

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

  const isActiveRef = useRef(true)
  const dataHandlerRef = useRef<{ flush: () => void } | null>(null)
  const [exitInfo, setExitInfo] = useState<ExitInfo | null>(null)

  const commandRef = useRef(command)
  commandRef.current = command
  const envRef = useRef(env)
  envRef.current = env
  const isAgentTerminalRef = useRef(isAgentTerminal)
  isAgentTerminalRef.current = isAgentTerminal
  const cwdRef = useRef(cwd)
  cwdRef.current = cwd
  const isolatedRef = useRef(isolated)
  isolatedRef.current = isolated
  const repoRootDirRef = useRef(repoRootDir)
  repoRootDirRef.current = repoRootDir

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
    const delay = update.status === 'working' ? 150 : 300
    updateTimeoutRef.current = setTimeout(flushUpdate, delay)
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
    isActiveRef, dataHandlerRef,
    showScrollButton, setShowScrollButton,
    exitInfo, setExitInfo,
    commandRef, envRef, isAgentTerminalRef, cwdRef, isolatedRef, repoRootDirRef,
    updateAgentMonitorRef, markSessionReadRef,
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
  const { sessionId, isAgentTerminal, restartKey, storeSessionId, tabId } = config
  const s = useTerminalState(config)
  const defaultShell = useRepoStore((state) => state.defaultShell)

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
      cursorBlink: !document.documentElement.classList.contains('e2e-stable'),
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

    // xterm.js 6 uses a canvas renderer by default, which is performant enough.
    // The WebGL addon is intentionally not loaded — it crashes the GPU process
    // on some hardware, causing a white screen / sad-face. Revisit later.

    // Register all terminals in the buffer registry so content is accessible.
    // Agent terminals are keyed by sessionId; non-agent terminals use the pty ID.
    const registryKey = isAgent ? sessionId : `${sessionId}-user`
    terminalBufferRegistry.register(registryKey, () => {
      try { return serializeAddon.serialize() } catch { return '' }
    })

    const helpers = createViewportHelpers(terminal)
    const scrollTracking = createScrollTracking(terminal, helpers, s.isFollowingRef, s.setShowScrollButton)

    let onRenderRAF = 0
    terminal.onRender(() => {
      if (!s.isActiveRef.current) return // skip render work for background terminals
      if (onRenderRAF) return
      onRenderRAF = requestAnimationFrame(() => {
        onRenderRAF = 0
        const atBottom = helpers.isAtBottom()
        const shouldShow = !atBottom && terminal.buffer.active.baseY > 0
        s.setShowScrollButton(prev => prev === shouldShow ? prev : shouldShow)
      })
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
    let isStale = false

    // Register onData/onExit listeners BEFORE pty.create() so we don't miss
    // early messages from container setup (which fires async immediately).
    const dataHandler = createPtyDataHandler({
      terminal,
      isAgent,
      command: cmd,
      state: s,
      effectStartTime,
      isActiveRef: s.isActiveRef,
    })
    s.dataHandlerRef.current = dataHandler
    const removeDataListener = window.pty.onData(id, dataHandler.handleData)

    const removeExitListener = window.pty.onExit(id, (exitCode: number) => {
      terminal.write(`\r\n[Process exited with code ${exitCode}]\r\n`)
      if (exitCode === 137) {
        if (s.isolatedRef.current) {
          terminal.write(`The process was killed (SIGKILL) \u2014 likely by Docker\u2019s out-of-memory killer.\r\n`)
          terminal.write(`Try increasing Docker Desktop\u2019s memory in Settings \u2192 Resources \u2192 Memory.\r\n`)
          s.setExitInfo({
            code: 137,
            message: 'Agent killed by Docker out-of-memory killer (SIGKILL)',
            detail: 'Docker Desktop runs all containers in a shared Linux VM with a fixed memory ceiling. When total memory across all containers exceeds this limit, the Linux OOM killer picks a process to terminate.\n\nTo fix this, either:\n\u2022 Increase Docker Desktop\u2019s memory limit in Settings \u2192 Resources \u2192 Memory\n\u2022 Reduce the number or size of other running containers, since they compete for the same memory budget',
          })
        } else {
          terminal.write(`The process was killed (SIGKILL).\r\n`)
          s.setExitInfo({ code: 137, message: 'Process killed (SIGKILL)' })
        }
      } else if (isAgent) {
        s.setExitInfo({
          code: exitCode,
          message: exitCode === 0 ? 'Agent process has exited.' : `Agent process exited with code ${exitCode}.`,
        })
      }
      if (isAgent && s.sessionIdRef.current) {
        s.lastStatusRef.current = 'idle'
        s.scheduleUpdate({ status: 'idle' })
      }
    })

    s.cleanupRef.current = () => { isStale = true; dataHandler.clearTimers(); removeDataListener(); removeExitListener() }

    // Register terminal→PTY input handler BEFORE spawning the PTY so that
    // xterm.js automatic responses (e.g. DSR cursor-position replies) are
    // forwarded immediately. Without this, agents like Codex that query
    // cursor position on startup may time out and crash.
    terminal.onData((data) => {
      // xterm.js fires onData for both real user keystrokes AND automatic
      // responses to terminal queries (e.g. cursor position reports \x1b[row;colR
      // in response to DSR \x1b[6n). Ink-based TUIs like Codex send these queries
      // constantly during rendering. If we count auto-responses as user input,
      // the activity detector stays permanently "paused" and never shows "working".
      const isAutoResponse = /^\x1b\[\d+;\d+R$/.test(data)
      if (!isAutoResponse) {
        s.lastUserInputRef.current = Date.now()
        if (s.sessionIdRef.current) s.markSessionReadRef.current(s.sessionIdRef.current)
      }
      void window.pty.write(id, data)
    })

    window.pty.create({ id, cwd: effectCwd, command: cmd, sessionId, env: envVars, shell: defaultShell || undefined, isolated: s.isolatedRef.current, repoRootDir: s.repoRootDirRef.current })
      .then(() => {
        // Guard against stale effect: terminal may have been disposed during async setup
        if (isStale) return

        if (isAgentTerminal && sessionId) s.setAgentPtyId(sessionId, id)
      })
      .catch((err: unknown) => {
        if (isStale) return
        const errorMsg = `Failed to start terminal: ${err instanceof Error ? err.message : String(err)}`
        console.error('[useTerminalSetup]', errorMsg)
        terminal.write(`\r\n\x1b[31mError: Failed to start terminal\x1b[0m\r\n`)
        terminal.write(`\x1b[33m${err instanceof Error ? err.message : String(err)}\x1b[0m\r\n`)
      })

    let ptyResizeTimeout: ReturnType<typeof setTimeout> | null = null
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0] as ResizeObserverEntry | undefined
      if (!entry || entry.contentRect.width === 0 || entry.contentRect.height === 0) return
      // Debounce fit() and pty.resize() together so xterm and the child process
      // learn about the new size atomically. Without this, TUI agents like Codex
      // render frames for the old size into a terminal that already changed,
      // leaving orphaned lines and blank gaps in the scrollback.
      if (ptyResizeTimeout) clearTimeout(ptyResizeTimeout)
      ptyResizeTimeout = setTimeout(() => {
        try { fitAddon.fit() } catch { /* ignore */ }
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
      if (scrollTracking.state.pendingScrollRAF) cancelAnimationFrame(scrollTracking.state.pendingScrollRAF)
      if (onRenderRAF) cancelAnimationFrame(onRenderRAF)
      s.cleanupRef.current?.()
      if (s.ptyIdRef.current) { void window.pty.kill(s.ptyIdRef.current); s.ptyIdRef.current = null }
      terminal.dispose()
      if (s.updateTimeoutRef.current) clearTimeout(s.updateTimeoutRef.current)
      if (s.idleTimeoutRef.current) clearTimeout(s.idleTimeoutRef.current)
      if (isAgent && s.sessionIdRef.current && s.lastStatusRef.current === 'working') {
        s.updateAgentMonitorRef.current(s.sessionIdRef.current, { status: 'idle' })
      }
      terminalBufferRegistry.unregister(registryKey)
    }
  }, [sessionId, restartKey]) // Recreate terminal when session identity changes or on restart

  // Subscribe to store for activation changes — imperative only, no re-render.
  useEffect(() => {
    if (!storeSessionId || !tabId) return
    // Derive initial state
    const initState = useSessionStore.getState()
    const initSession = initState.sessions.find((ss) => ss.id === storeSessionId)
    const resolveTabId = (s_: { terminalTabs: { activeTabId: string | null } } | undefined) =>
      s_?.terminalTabs.activeTabId ?? '__agent__'
    s.isActiveRef.current = initState.activeSessionId === storeSessionId && resolveTabId(initSession) === tabId

    return useSessionStore.subscribe((state, prevState) => {
      const session = state.sessions.find((ss) => ss.id === storeSessionId)
      const prevSession = prevState.sessions.find((ss) => ss.id === storeSessionId)
      const isNowActive = state.activeSessionId === storeSessionId && resolveTabId(session) === tabId
      const wasActive = prevState.activeSessionId === storeSessionId && resolveTabId(prevSession) === tabId
      if (isNowActive === wasActive) return
      s.isActiveRef.current = isNowActive
      s.lastInteractionRef.current = Date.now()
      if (isNowActive) {
        // Fit first so the terminal has correct dimensions before flushing.
        // Without this, buffered TUI frames render at stale dimensions and
        // leave orphaned lines / blank gaps in the scrollback.
        try { s.fitAddonRef.current?.fit() } catch { /* ignore */ }
        s.dataHandlerRef.current?.flush()
        requestAnimationFrame(() => {
          s.terminalRef.current?.focus()
        })
      }
    })
  }, [storeSessionId, tabId])

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

  return { terminalRef: s.terminalRef, ptyIdRef: s.ptyIdRef, isActiveRef: s.isActiveRef, showScrollButton: s.showScrollButton, handleScrollToBottom: s.handleScrollToBottom, exitInfo: s.exitInfo }
}
