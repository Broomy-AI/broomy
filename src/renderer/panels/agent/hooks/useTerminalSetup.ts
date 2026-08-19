/**
 * Sets up and manages the xterm.js terminal instance including PTY creation,
 * resize handling, buffer restoration, and scroll tracking.
 *
 * Scroll strategy (replicates Wave Terminal exactly):
 * - Track at-bottom state via DOM scrollTop on .xterm-viewport (xterm 5.x).
 * - Generous threshold: within 50% of viewport height counts as "at bottom".
 * - wasRecentlyAtBottom(): true if at bottom now OR was within last 1000ms.
 * - Cache at-bottom state in ResizeObserver before debounced fit runs.
 * - After resize, scrollToBottom() with 20ms delay if was recently at bottom.
 * - Repaint transactions (CSI 3 J inside DEC mode 2026) detected in
 *   ptyDataHandler.ts — only scroll to bottom if wasRecentlyAtBottom().
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal as XTerm, type ILinkHandler, type IDisposable } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SerializeAddon } from '@xterm/addon-serialize'

import { useSessionStore } from '../../../store/sessions'
import { useRepoStore } from '../../../store/repos'
import { terminalBufferRegistry } from '../../../shared/utils/terminalBufferRegistry'
import { ptyCaptureRegistry } from '../../../shared/utils/ptyCaptureRegistry'
import { useTerminalKeyboard } from './useTerminalKeyboard'
import { createLinkWiring } from './terminalLinks'
import { registerFilePathLinks } from './terminalPathLinkProvider'
import { usePlanDetection } from '../../../features/git/hooks/usePlanDetection'
import { createPtyDataHandler } from './ptyDataHandler'
import { ScrollLog, scrollLogRegistry } from '../utils/scrollLog'
import type { ScrollSource } from '../utils/scrollLog'
import type { ShellKind } from '../../../../shared/shellQuote'
import { useSettingsStore } from '../../../store/settings'
import { resolveTerminalContrast } from '../../../../shared/appearance'
import { XTERM_THEMES } from '../../../shared/theme/xtermTheme'
import { useTerminalAppearance } from './useTerminalAppearance'

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
  /** Shell parser family of the live PTY, for quoting dropped file paths. null until create resolves. */
  shellKindRef: React.MutableRefObject<ShellKind | null>
  isActiveRef: React.MutableRefObject<boolean>
  showScrollButton: boolean
  handleScrollToBottom: () => void
  exitInfo: ExitInfo | null
}

// ── Xterm theme ──────────────────────────────────────────────────────
// Lives in shared/theme/xtermTheme.ts so it can vary per theme. The dark values
// there are byte-identical to the ones that used to be inline here.

// ── At-bottom detection (Wave Terminal approach) ─────────────────────
//
// Uses DOM scrollTop on .xterm-viewport (xterm 5.x uses native scrollbar).
// Generous threshold: within 50% of viewport height counts as "at bottom".
// This prevents false "user scrolled up" detection from small perturbations.

function isAtBottom(viewportEl: HTMLElement | null): boolean {
  if (!viewportEl) return true
  const { scrollTop, scrollHeight, clientHeight } = viewportEl
  return scrollTop + clientHeight >= scrollHeight - clientHeight * 0.5
}

// ── Scroll state tracker (Wave Terminal approach) ────────────────────
//
// Tracks at-bottom state with a time-based heuristic. wasRecentlyAtBottom()
// returns true if at bottom now OR was within the last 1000ms. This bridges
// the gap during resize where xterm briefly reports "not at bottom".

/** Time window (ms) during which wasRecentlyAtBottom() returns true. */
const RECENTLY_AT_BOTTOM_MS = 1000

interface ScrollState {
  setAtBottom: (atBottom: boolean) => void
  wasRecentlyAtBottom: () => boolean
  cleanup: () => void
}

function createScrollState(viewportEl: HTMLElement | null): ScrollState {
  let lastAtBottomTime = Date.now()
  let lastScrollAtBottom = true

  const setAtBottom = (atBottom: boolean) => {
    if (lastScrollAtBottom && !atBottom) {
      lastAtBottomTime = Date.now()
    }
    lastScrollAtBottom = atBottom
    if (atBottom) {
      lastAtBottomTime = Date.now()
    }
  }

  const wasRecentlyAtBottom = () => {
    if (lastScrollAtBottom) return true
    return Date.now() - lastAtBottomTime <= RECENTLY_AT_BOTTOM_MS
  }

  // Track at-bottom state via viewport scroll events (Wave's handleViewportScroll)
  const handleScroll = () => {
    setAtBottom(isAtBottom(viewportEl))
  }

  if (viewportEl) {
    viewportEl.addEventListener('scroll', handleScroll)
  }

  const cleanup = () => {
    if (viewportEl) {
      viewportEl.removeEventListener('scroll', handleScroll)
    }
  }

  return { setAtBottom, wasRecentlyAtBottom, cleanup }
}

// ── Scroll tracking ─────────────────────────────────────────────────
//
// Observes user gestures (wheel, keyboard) to manage the "Go to End" button.

interface ScrollTrackingResult {
  updateFollowingFromScroll: (e: Event) => void
  handleKeyScroll: (e: KeyboardEvent) => void
}

interface ScrollTrackingArgs {
  terminal: XTerm
  setShowScrollButton: React.Dispatch<React.SetStateAction<boolean>>
  scrollLog: ScrollLog
  viewportEl: HTMLElement | null
}

function createScrollTracking(args: ScrollTrackingArgs): ScrollTrackingResult {
  const { terminal, setShowScrollButton, scrollLog, viewportEl } = args

  const logScroll = (source: ScrollSource, detail?: string) => {
    scrollLog.add({
      source,
      viewportY: terminal.buffer.active.viewportY,
      baseY: terminal.buffer.active.baseY,
      scrollTop: viewportEl?.scrollTop,
      scrollHeight: viewportEl?.scrollHeight,
      clientHeight: viewportEl?.clientHeight,
      following: isAtBottom(viewportEl),
      detail,
    })
  }

  const updateFollowingFromScroll = (e: Event) => {
    if (e instanceof WheelEvent && e.deltaY < 0) {
      logScroll('wheel-up')
    } else {
      logScroll('wheel-down')
    }

    requestAnimationFrame(() => {
      const atBottom = isAtBottom(viewportEl)
      setShowScrollButton(!atBottom && terminal.buffer.active.baseY > 0)
    })
  }

  const handleKeyScroll = (e: KeyboardEvent) => {
    if (e.key === 'PageUp' || (e.shiftKey && e.key === 'ArrowUp')) {
      logScroll(e.key === 'PageUp' ? 'key-pageup' : 'key-shift-arrow')
    }
    if (e.key === 'PageUp' || e.key === 'PageDown' ||
        (e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown'))) {
      requestAnimationFrame(() => {
        const atBottom = isAtBottom(viewportEl)
        setShowScrollButton(!atBottom && terminal.buffer.active.baseY > 0)
      })
    }
  }

  return { updateFollowingFromScroll, handleKeyScroll }
}

// ── Resize observer (Wave Terminal approach) ─────────────────────────
//
// Captures at-bottom state in ResizeObserver BEFORE debounced fit runs.
// After fit, if was recently at bottom, scrollToBottom() with 20ms delay.

interface ResizeObserverSetup {
  observer: ResizeObserver
  cachedAtBottomForResize: { value: boolean | null }
  cleanup: () => void
}

interface ResizeObserverArgs {
  terminal: XTerm; fitAddon: FitAddon; ptyIdRef: React.MutableRefObject<string | null>
  isActiveRef: React.MutableRefObject<boolean>
  scrollState: ScrollState
  scrollLog: ScrollLog; viewportEl: HTMLElement | null
}

function createResizeObserver(args: ResizeObserverArgs): ResizeObserverSetup {
  const { terminal, fitAddon, ptyIdRef, isActiveRef, scrollState, scrollLog, viewportEl } = args
  let ptyResizeTimeout: ReturnType<typeof setTimeout> | null = null
  let scrollToBottomTimeout: ReturnType<typeof setTimeout> | null = null
  const cachedAtBottomForResize = { value: null as boolean | null }

  const observer = new ResizeObserver((entries) => {
    if (!isActiveRef.current) return
    const entry = entries[0] as ResizeObserverEntry | undefined
    if (!entry || entry.contentRect.width === 0 || entry.contentRect.height === 0) return

    // Capture at-bottom state NOW, before the debounced fit changes dimensions
    // (Wave's cachedAtBottomForResize pattern)
    if (cachedAtBottomForResize.value === null) {
      cachedAtBottomForResize.value = scrollState.wasRecentlyAtBottom()
    }

    if (ptyResizeTimeout) clearTimeout(ptyResizeTimeout)
    ptyResizeTimeout = setTimeout(() => {
      const atBottomBeforeFit = cachedAtBottomForResize.value
      cachedAtBottomForResize.value = null

      const oldCols = terminal.cols
      const oldRows = terminal.rows
      try { fitAddon.fit() } catch { /* ignore */ }
      if (terminal.cols !== oldCols || terminal.rows !== oldRows) {
        scrollLog.add({
          source: 'resize',
          viewportY: terminal.buffer.active.viewportY,
          baseY: terminal.buffer.active.baseY,
          scrollTop: viewportEl?.scrollTop,
          scrollHeight: viewportEl?.scrollHeight,
          clientHeight: viewportEl?.clientHeight,
          following: isAtBottom(viewportEl),
          detail: `${oldCols}x${oldRows} -> ${terminal.cols}x${terminal.rows}`,
        })
      }
      if (ptyIdRef.current && terminal.cols > 0 && terminal.rows > 0) {
        void window.pty.resize(ptyIdRef.current, terminal.cols, terminal.rows)
      }

      // If we were at bottom before resize, scroll back to bottom after
      // xterm has had a chance to reflow content. (Wave's exact pattern)
      if (atBottomBeforeFit) {
        if (scrollToBottomTimeout) clearTimeout(scrollToBottomTimeout)
        scrollToBottomTimeout = setTimeout(() => {
          terminal.scrollToBottom()
          scrollState.setAtBottom(true)
          scrollToBottomTimeout = null
        }, 20)
      }
    }, 100)
  })

  const cleanup = () => {
    observer.disconnect()
    if (ptyResizeTimeout) clearTimeout(ptyResizeTimeout)
    if (scrollToBottomTimeout) clearTimeout(scrollToBottomTimeout)
  }

  return { observer, cachedAtBottomForResize, cleanup }
}

// ── Terminal state hook (refs, store wiring, callbacks) ──────────────

function useTerminalState(config: TerminalConfig) {
  const { sessionId, command, env, isAgentTerminal, cwd, isolated, repoRootDir } = config

  const terminalRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  // Exposed so the appearance effect can preserve bottom-following across a refit.
  const scrollStateRef = useRef<ScrollState | null>(null)
  const serializeAddonRef = useRef<SerializeAddon | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const updateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastStatusRef = useRef<'working' | 'idle'>('idle')
  const lastUserInputRef = useRef<number>(0)
  const lastInteractionRef = useRef<number>(0)
  const ptyIdRef = useRef<string | null>(null)
  const shellKindRef = useRef<ShellKind | null>(null)
  const [showScrollButton, setShowScrollButton] = useState(false)

  const isActiveRef = useRef(true)
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

  const pendingUpdateRef = useRef<{ status?: 'working' | 'idle' | 'error'; lastMessage?: string; workingStartedAt?: number } | null>(null)

  const flushUpdate = useCallback(() => {
    if (pendingUpdateRef.current && sessionIdRef.current) {
      updateAgentMonitorRef.current(sessionIdRef.current, pendingUpdateRef.current)
      pendingUpdateRef.current = null
    }
  }, [])

  const scheduleUpdate = useCallback((update: { status?: 'working' | 'idle' | 'error'; lastMessage?: string; workingStartedAt?: number }) => {
    // Preserve status EDGES: if this update flips the status away from one that's
    // still pending, flush that first so the store observes BOTH transitions.
    // Merging working+idle into one pending object would drop the working→idle
    // edge (e.g. idle arriving within the debounce, or a fast process exit),
    // suppressing the "check me" unread LED and the broomy:agent-finished event.
    const pending = pendingUpdateRef.current
    if (update.status !== undefined && pending?.status !== undefined && pending.status !== update.status) {
      flushUpdate()
    }
    pendingUpdateRef.current = { ...pendingUpdateRef.current, ...update }
    if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current)
    const delay = update.status === 'working' ? 150 : 300
    updateTimeoutRef.current = setTimeout(flushUpdate, delay)
  }, [flushUpdate])

  const handleScrollToBottom = useCallback(() => {
    terminalRef.current?.scrollToBottom()
    setShowScrollButton(false)
  }, [])

  return {
    terminalRef, fitAddonRef, serializeAddonRef, cleanupRef, scrollStateRef,
    updateTimeoutRef, idleTimeoutRef, lastStatusRef,
    lastUserInputRef, lastInteractionRef, ptyIdRef, shellKindRef,
    isActiveRef,
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
/**
 * Construct the xterm instance with the user's current appearance settings.
 * Reads settings imperatively (getState) so the caller's setup effect need not
 * depend on them — see the call site for why that dependency is deliberately avoided.
 */
function createConfiguredTerminal(linkHandler: ILinkHandler): XTerm {
  const { appearance, resolvedTheme } = useSettingsStore.getState()
  return new XTerm({
    theme: XTERM_THEMES[resolvedTheme],
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    fontSize: appearance.editorFontSize,
    lineHeight: appearance.terminalLineHeight,
    cursorBlink: !document.documentElement.classList.contains('e2e-stable'),
    cursorStyle: 'bar',
    scrollback: 5000,
    minimumContrastRatio: resolveTerminalContrast(appearance.terminalContrast, resolvedTheme),
    macOptionIsMeta: true,
    // Route OSC 8 hyperlinks through the same gated handler as detected URL text (#149).
    linkHandler,
  })
}


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

    // Appearance is read imperatively inside createConfiguredTerminal rather than
    // as a hook dependency. THIS EFFECT'S CLEANUP KILLS THE PTY — adding theme or
    // fontSize to its deps would destroy the running agent on every appearance
    // change. The separate effect below applies changes to the live terminal instead.
    // `file://` OSC 8 links (Claude Code chips) open host files, so they're allowed only for
    // non-isolated terminals — the same reason the bare-path provider below is host-only.
    const links = createLinkWiring(containerRef.current, effectCwd, !s.isolatedRef.current)
    const terminal = createConfiguredTerminal(links.linkHandler)
    // The wiring is built first (the constructor takes `linkHandler`), so the buffer an OSC 8
    // hover reads its row from is handed over here.
    links.attachTerminal(terminal)

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)

    const serializeAddon = new SerializeAddon()
    terminal.loadAddon(serializeAddon)
    s.serializeAddonRef.current = serializeAddon

    terminal.loadAddon(links.addon)

    // Existing file paths are linkified too (#153), sharing the URL links' modifier gate and
    // hover hint so the two kinds of link behave identically. Host terminals only: an
    // isolated/devcontainer session's paths are container-side and would not resolve here.
    const filePathLinks: IDisposable | null = s.isolatedRef.current
      ? null
      : registerFilePathLinks(terminal, effectCwd, links.hint)

    terminal.open(containerRef.current)

    // xterm 5.x uses DOM rendering by default. The WebGL addon is intentionally
    // not loaded — it crashes the GPU process on some hardware, causing a white
    // screen / sad-face. The DOM renderer is reliable and fast enough.

    // Register all terminals in the buffer registry so content is accessible.
    // Agent terminals are keyed by sessionId; non-agent terminals use the pty ID.
    const registryKey = isAgent ? sessionId : `${sessionId}-user`
    terminalBufferRegistry.register(registryKey, () => {
      try { return serializeAddon.serialize() } catch { return '' }
    })

    // Raw byte capture for Cmd+Shift+C debug dumps (asciinema v2 format).
    ptyCaptureRegistry.init(registryKey, terminal.cols, terminal.rows, {
      TERM: 'xterm-256color',
      ...(envVars || {}),
    })
    terminal.onResize(({ cols, rows }) => ptyCaptureRegistry.recordResize(registryKey, cols, rows))

    const viewportEl = containerRef.current.querySelector<HTMLElement>('.xterm-viewport')

    // ── Scroll state tracking (Wave Terminal approach) ───────────────
    const scrollState = createScrollState(viewportEl)
    s.scrollStateRef.current = scrollState

    // ── Scroll event log for debugging ──────────────────────────────
    const scrollLog = new ScrollLog()
    scrollLogRegistry.register(registryKey, scrollLog)

    const scrollTracking = createScrollTracking({
      terminal, setShowScrollButton: s.setShowScrollButton, scrollLog, viewportEl,
    })

    // Update scroll button visibility on render
    let onRenderRAF = 0
    terminal.onRender(() => {
      if (!s.isActiveRef.current) return
      if (onRenderRAF) return
      onRenderRAF = requestAnimationFrame(() => {
        onRenderRAF = 0
        const atBottom = isAtBottom(viewportEl)
        const shouldShow = !atBottom && terminal.buffer.active.baseY > 0
        s.setShowScrollButton(prev => prev === shouldShow ? prev : shouldShow)
      })
    })

    // Use CAPTURE phase on the container so our handlers fire BEFORE xterm's
    // handlers on child elements. xterm.js may call stopPropagation() on wheel
    // events, but capture-phase listeners on an ancestor fire first.
    const scrollContainer = containerRef.current
    scrollContainer.addEventListener('wheel', scrollTracking.updateFollowingFromScroll, { capture: true, passive: true })
    scrollContainer.addEventListener('touchmove', scrollTracking.updateFollowingFromScroll, { capture: true, passive: true })
    scrollContainer.addEventListener('keydown', scrollTracking.handleKeyScroll, { capture: true })

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
    // Reset before create resolves so a stale kind from a prior PTY can never
    // pair with this new id and mis-quote a drop during a restart.
    s.shellKindRef.current = null
    let isStale = false

    // Register onData/onExit listeners BEFORE pty.create() so we don't miss
    // early messages from container setup (which fires async immediately).
    const dataHandler = createPtyDataHandler({
      terminal,
      isAgent,
      state: s,
      effectStartTime,
      wasRecentlyAtBottom: scrollState.wasRecentlyAtBottom,
    })
    const removeDataListener = window.pty.onData(id, (data: string) => {
      ptyCaptureRegistry.recordOutput(registryKey, data)
      dataHandler.handleData(data)
    })

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
      // Stop activity detection so a screen sample still pending from output
      // just before exit can't revive the finished session back to "working".
      dataHandler.clearTimers()
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
      .then((result) => {
        // Guard against stale effect: terminal may have been disposed during async setup
        if (isStale) return

        // Record the shell parser family for quoting dropped file paths.
        s.shellKindRef.current = result.shellKind
        if (isAgentTerminal && sessionId) s.setAgentPtyId(sessionId, id)
      })
      .catch((err: unknown) => {
        if (isStale) return
        const errorMsg = `Failed to start terminal: ${err instanceof Error ? err.message : String(err)}`
        console.error('[useTerminalSetup]', errorMsg)
        terminal.write(`\r\n\x1b[31mError: Failed to start terminal\x1b[0m\r\n`)
        terminal.write(`\x1b[33m${err instanceof Error ? err.message : String(err)}\x1b[0m\r\n`)
      })

    const resizeSetup = createResizeObserver({
      terminal, fitAddon, ptyIdRef: s.ptyIdRef, isActiveRef: s.isActiveRef,
      scrollState, scrollLog, viewportEl,
    })
    const containerEl = containerRef.current
    resizeSetup.observer.observe(containerEl)

    return () => {
      scrollContainer.removeEventListener('wheel', scrollTracking.updateFollowingFromScroll, { capture: true })
      scrollContainer.removeEventListener('touchmove', scrollTracking.updateFollowingFromScroll, { capture: true })
      scrollContainer.removeEventListener('keydown', scrollTracking.handleKeyScroll, { capture: true })
      resizeSetup.cleanup()
      scrollState.cleanup()
      if (onRenderRAF) cancelAnimationFrame(onRenderRAF)
      s.cleanupRef.current?.()
      if (s.ptyIdRef.current) { void window.pty.kill(s.ptyIdRef.current); s.ptyIdRef.current = null }
      s.shellKindRef.current = null
      filePathLinks?.dispose() // before terminal.dispose(): stops any in-flight existence check's callback
      terminal.dispose()
      links.dispose()
      if (s.updateTimeoutRef.current) clearTimeout(s.updateTimeoutRef.current)
      if (s.idleTimeoutRef.current) clearTimeout(s.idleTimeoutRef.current)
      if (isAgent && s.sessionIdRef.current && s.lastStatusRef.current === 'working') {
        s.updateAgentMonitorRef.current(s.sessionIdRef.current, { status: 'idle' })
      }
      terminalBufferRegistry.unregister(registryKey)
      scrollLogRegistry.unregister(registryKey)
      ptyCaptureRegistry.dispose(registryKey)
    }
  }, [sessionId, restartKey, config.command]) // Recreate terminal when session identity, command, or restart key changes

  // Applied to the live terminal in its own hook — never through the construction
  // effect above, whose cleanup kills the PTY.
  useTerminalAppearance(s)

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
        requestAnimationFrame(() => {
          // Fit the terminal to its container — the ResizeObserver skips
          // inactive tabs, so dimensions may be stale or zero.
          try { s.fitAddonRef.current?.fit() } catch { /* ignore */ }
          const term = s.terminalRef.current
          if (s.ptyIdRef.current && term && term.cols > 0 && term.rows > 0) {
            void window.pty.resize(s.ptyIdRef.current, term.cols, term.rows)
          }
          term?.focus()
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

  return { terminalRef: s.terminalRef, ptyIdRef: s.ptyIdRef, shellKindRef: s.shellKindRef, isActiveRef: s.isActiveRef, showScrollButton: s.showScrollButton, handleScrollToBottom: s.handleScrollToBottom, exitInfo: s.exitInfo }
}
