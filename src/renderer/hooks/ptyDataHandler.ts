/**
 * Handles incoming PTY data by writing to the xterm instance and detecting agent activity transitions.
 *
 * Scroll pinning is handled natively by xterm.js 6 — it keeps the viewport
 * at the bottom when data arrives (if already there) and stays put when
 * the user has scrolled away.  We do NOT call scrollToBottom() ourselves.
 */
import { Terminal as XTerm } from '@xterm/xterm'
import { evaluateActivity } from '../utils/terminalActivityDetector'

interface TerminalStateForPtyData {
  processPlanDetection: (data: string) => void
  lastUserInputRef: React.MutableRefObject<number>
  lastInteractionRef: React.MutableRefObject<number>
  lastStatusRef: React.MutableRefObject<'working' | 'idle'>
  idleTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
  scheduleUpdate: (update: { status?: 'working' | 'idle' | 'error'; lastMessage?: string }) => void
}

interface CreatePtyDataHandlerArgs {
  terminal: XTerm
  isAgent: boolean
  command: string | undefined
  state: TerminalStateForPtyData
  effectStartTime: number
  isActiveRef: React.MutableRefObject<boolean>
}

/** Maximum buffer size (5 MB) to prevent unbounded memory growth for background terminals. */
export const MAX_BUFFER_SIZE = 5 * 1024 * 1024

interface PtyDataHandlerController {
  handleData: (data: string) => void
  clearTimers: () => void
  /** Flush buffered data to the terminal (call when terminal becomes visible). */
  flush: () => void
}

export function createPtyDataHandler(args: CreatePtyDataHandlerArgs): PtyDataHandlerController {
  const { terminal, isAgent, command, state, effectStartTime, isActiveRef } = args
  // Codex (Ink-based TUI) uses cursor movement to redraw in-place. Buffering
  // these frames and replaying them in a batch corrupts the scrollback with
  // duplicate status bars and blank gaps. Disable buffering entirely for Codex.
  const skipBuffering = isAgent && !!command && /\bcodex\b/i.test(command)
  const bufferedChunks: string[] = []
  let bufferedSize = 0

  const processActivityDetection = (data: string) => {
    if (!isAgent) return

    state.processPlanDetection(data)
    const now = Date.now()
    const result = evaluateActivity(data.length, now, {
      lastUserInput: state.lastUserInputRef.current,
      lastInteraction: state.lastInteractionRef.current,
      lastStatus: state.lastStatusRef.current,
      startTime: effectStartTime,
    })
    if (result.status === 'working') {
      if (state.idleTimeoutRef.current) clearTimeout(state.idleTimeoutRef.current)
      state.lastStatusRef.current = 'working'
      state.scheduleUpdate({ status: 'working' })
    }
    if (result.scheduleIdle) {
      if (result.status !== 'working' && state.idleTimeoutRef.current) clearTimeout(state.idleTimeoutRef.current)
      state.idleTimeoutRef.current = setTimeout(() => {
        state.lastStatusRef.current = 'idle'
        state.scheduleUpdate({ status: 'idle' })
      }, 1000)
    }
  }

  const handleData = (data: string) => {
    // Activity detection is cheap — always run it even for background terminals
    processActivityDetection(data)

    if (!isActiveRef.current && !skipBuffering) {
      // Buffer data for background terminals instead of writing to xterm
      bufferedChunks.push(data)
      bufferedSize += data.length
      // Cap buffer at MAX_BUFFER_SIZE: drop oldest chunks when exceeded
      while (bufferedSize > MAX_BUFFER_SIZE && bufferedChunks.length > 1) {
        const dropped = bufferedChunks.shift()!
        bufferedSize -= dropped.length
      }
      return
    }

    terminal.write(data)
  }

  const flush = () => {
    if (bufferedChunks.length === 0) return
    const all = bufferedChunks.join('')
    bufferedChunks.length = 0
    bufferedSize = 0
    terminal.write(all)
  }

  const clearTimers = () => {
    // no-op — kept for interface compatibility
  }

  return { handleData, clearTimers, flush }
}
