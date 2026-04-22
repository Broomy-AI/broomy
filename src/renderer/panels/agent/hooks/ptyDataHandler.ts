/**
 * Handles incoming PTY data by writing to the xterm instance and detecting agent activity transitions.
 *
 * Scroll pinning is handled natively by xterm.js 6 — it keeps the viewport
 * at the bottom when data arrives (if already there) and stays put when
 * the user has scrolled away.  We do NOT call scrollToBottom() ourselves,
 * EXCEPT after detecting a repaint transaction (CSI 3 J inside DEC mode 2026).
 *
 * Claude Code emits CSI 3 J (clear scrollback) then repaints the session,
 * wrapped in DEC mode 2026 (synchronized output). The clear causes scrollTop
 * to drop to 0 (empty buffer), and xterm's heuristics fail. We detect the
 * transaction boundary and scroll to bottom after the repaint completes.
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
  state: TerminalStateForPtyData
  effectStartTime: number
  /** Returns true if the terminal was recently at the bottom (Wave Terminal approach). */
  wasRecentlyAtBottom?: () => boolean
}

interface PtyDataHandlerController {
  handleData: (data: string) => void
  clearTimers: () => void
}

// Maximum time (ms) between CSI 3 J and DEC mode 2026 reset to still count
// as a repaint transaction. Matches Wave Terminal's constant.
const MAX_REPAINT_TRANSACTION_MS = 2000

/**
 * Registers CSI handlers on the terminal to detect Claude Code's
 * clear-and-repaint pattern (CSI 3 J inside DEC mode 2026).
 *
 * Returns a cleanup function that disposes the handlers.
 */
function setupRepaintDetection(terminal: XTerm, wasRecentlyAtBottom?: () => boolean): { cleanup: () => void } {
  let inSyncTransaction = false
  let inRepaintTransaction = false
  let lastClearScrollbackTs = 0
  let scrollToBottomTimer: ReturnType<typeof setTimeout> | null = null

  // DEC mode 2026 set — start of synchronized output transaction
  const syncSetHandler = terminal.parser.registerCsiHandler(
    { prefix: '?', final: 'h' },
    (params) => {
      if (params[0] === 2026) {
        inSyncTransaction = true
      }
      return false // don't consume — let xterm process it
    },
  )

  // CSI 3 J — clear scrollback. If inside a sync transaction, this is
  // the start of a repaint (Claude Code pattern).
  const clearScrollbackHandler = terminal.parser.registerCsiHandler(
    { final: 'J' },
    (params) => {
      if (params[0] === 3 && inSyncTransaction) {
        inRepaintTransaction = true
        lastClearScrollbackTs = Date.now()
      }
      return false
    },
  )

  // DEC mode 2026 reset — end of synchronized output transaction.
  // If this was a repaint transaction, scroll to bottom after a short delay
  // to let xterm finish rendering the repainted content.
  const syncResetHandler = terminal.parser.registerCsiHandler(
    { prefix: '?', final: 'l' },
    (params) => {
      if (params[0] === 2026) {
        const wasRepaint = inRepaintTransaction
        inSyncTransaction = false
        inRepaintTransaction = false

        // Only scroll to bottom if the user was recently at the bottom.
        // If they intentionally scrolled up, don't yank them back down.
        // (Wave Terminal's wasRecentlyAtBottom guard)
        const shouldScroll = wasRepaint
          && Date.now() - lastClearScrollbackTs <= MAX_REPAINT_TRANSACTION_MS
          && (!wasRecentlyAtBottom || wasRecentlyAtBottom())
        if (shouldScroll) {
          if (scrollToBottomTimer) clearTimeout(scrollToBottomTimer)
          scrollToBottomTimer = setTimeout(() => {
            terminal.scrollToBottom()
            scrollToBottomTimer = null
          }, 20)
        }
      }
      return false
    },
  )

  const cleanup = () => {
    syncSetHandler.dispose()
    clearScrollbackHandler.dispose()
    syncResetHandler.dispose()
    if (scrollToBottomTimer) clearTimeout(scrollToBottomTimer)
  }

  return { cleanup }
}

export function createPtyDataHandler(args: CreatePtyDataHandlerArgs): PtyDataHandlerController {
  const { terminal, isAgent, state, effectStartTime, wasRecentlyAtBottom } = args

  // Set up repaint transaction detection for agent terminals
  const repaintDetection = isAgent ? setupRepaintDetection(terminal, wasRecentlyAtBottom) : null

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
    processActivityDetection(data)
    terminal.write(data)
  }

  const clearTimers = () => {
    repaintDetection?.cleanup()
  }

  return { handleData, clearTimers }
}
