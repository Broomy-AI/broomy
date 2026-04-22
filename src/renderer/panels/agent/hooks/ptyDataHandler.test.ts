// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPtyDataHandler } from './ptyDataHandler'

vi.mock('../utils/terminalActivityDetector', () => ({
  evaluateActivity: vi.fn().mockReturnValue({ status: null, scheduleIdle: false }),
}))

function makeTerminal() {
  return {
    write: vi.fn(),
    buffer: { active: { viewportY: 0, baseY: 0 } },
    cols: 80,
    rows: 24,
    resize: vi.fn(),
    scrollToBottom: vi.fn(),
    parser: {
      registerCsiHandler: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    },
  } as unknown as import('@xterm/xterm').Terminal
}

function makeState() {
  return {
    processPlanDetection: vi.fn(),
    lastUserInputRef: { current: 0 },
    lastInteractionRef: { current: 0 },
    lastStatusRef: { current: 'idle' as const },
    idleTimeoutRef: { current: null } as { current: ReturnType<typeof setTimeout> | null },
    scheduleUpdate: vi.fn(),
  }
}

describe('createPtyDataHandler', () => {
  let terminal: ReturnType<typeof makeTerminal>
  let state: ReturnType<typeof makeState>

  beforeEach(() => {
    vi.clearAllMocks()
    terminal = makeTerminal()
    state = makeState()
  })

  function createHandler(overrides: { isAgent?: boolean } = {}) {
    return createPtyDataHandler({
      terminal,
      isAgent: overrides.isAgent ?? false,
      state,
      effectStartTime: Date.now(),
    })
  }

  it('writes data to terminal', () => {
    const handler = createHandler()
    handler.handleData('hello')
    expect(terminal.write).toHaveBeenCalledWith('hello')
  })

  it('does not call scrollToBottom on regular data — only on repaint transactions', () => {
    const handler = createHandler()
    handler.handleData('data')
    expect(terminal.scrollToBottom).not.toHaveBeenCalled()
  })

  it('always writes data to terminal regardless of visibility', () => {
    const handler = createHandler()
    handler.handleData('hello')
    handler.handleData(' world')
    expect(terminal.write).toHaveBeenCalledTimes(2)
    expect(terminal.write).toHaveBeenCalledWith('hello')
    expect(terminal.write).toHaveBeenCalledWith(' world')
  })

  it('runs activity detection for agent terminals', async () => {
    const { evaluateActivity } = await import('../utils/terminalActivityDetector')
    vi.mocked(evaluateActivity).mockReturnValue({ status: 'working', scheduleIdle: true })

    const handler = createHandler({ isAgent: true })
    handler.handleData('output')

    expect(evaluateActivity).toHaveBeenCalled()
    expect(state.scheduleUpdate).toHaveBeenCalledWith({ status: 'working' })
  })

  it('does not run activity detection for non-agent terminals', () => {
    const handler = createHandler({ isAgent: false })
    handler.handleData('output')
    expect(state.processPlanDetection).not.toHaveBeenCalled()
  })

  it('schedules idle timeout when scheduleIdle is true and status is not working', async () => {
    vi.useFakeTimers()
    const { evaluateActivity } = await import('../utils/terminalActivityDetector')
    vi.mocked(evaluateActivity).mockReturnValue({ status: null, scheduleIdle: true })

    const handler = createHandler({ isAgent: true })
    handler.handleData('output')

    // Idle timeout not yet fired
    expect(state.scheduleUpdate).not.toHaveBeenCalledWith({ status: 'idle' })

    // Existing idle timeout should have been cleared and a new one scheduled
    vi.advanceTimersByTime(1000)
    expect(state.lastStatusRef.current).toBe('idle')
    expect(state.scheduleUpdate).toHaveBeenCalledWith({ status: 'idle' })

    vi.useRealTimers()
  })

  it('clears previous idle timeout when scheduleIdle and status is not working', async () => {
    vi.useFakeTimers()
    const { evaluateActivity } = await import('../utils/terminalActivityDetector')
    vi.mocked(evaluateActivity).mockReturnValue({ status: null, scheduleIdle: true })

    const handler = createHandler({ isAgent: true })
    // Set up an existing idle timeout
    state.idleTimeoutRef.current = setTimeout(() => {}, 5000)
    handler.handleData('output')

    // The old timeout should have been replaced
    vi.advanceTimersByTime(1000)
    expect(state.scheduleUpdate).toHaveBeenCalledWith({ status: 'idle' })

    vi.useRealTimers()
  })

  describe('repaint transaction detection', () => {
    it('registers CSI handlers for agent terminals', () => {
      createHandler({ isAgent: true })
      // Should register 3 CSI handlers: sync set, clear scrollback, sync reset
      expect(terminal.parser.registerCsiHandler).toHaveBeenCalledTimes(3)
    })

    it('does not register CSI handlers for non-agent terminals', () => {
      createHandler({ isAgent: false })
      expect(terminal.parser.registerCsiHandler).not.toHaveBeenCalled()
    })

    it('scrolls to bottom after a repaint transaction (CSI 3 J inside DEC mode 2026)', () => {
      vi.useFakeTimers()

      // Capture the CSI handler callbacks
      const handlers: { prefix?: string; final: string; cb: (params: (number | number[])[]) => void }[] = []
      vi.mocked(terminal.parser.registerCsiHandler).mockImplementation(
        (id: { prefix?: string; final: string }, cb: (params: (number | number[])[]) => boolean | Promise<boolean>) => {
          handlers.push({ ...id, cb: cb as (params: (number | number[])[]) => void })
          return { dispose: vi.fn() }
        },
      )

      createHandler({ isAgent: true })

      // Find handlers by their signature
      const syncSetHandler = handlers.find(h => h.prefix === '?' && h.final === 'h')!
      const clearScrollbackHandler = handlers.find(h => h.final === 'J' && !h.prefix)!
      const syncResetHandler = handlers.find(h => h.prefix === '?' && h.final === 'l')!

      // Simulate: DEC mode 2026 set → CSI 3 J → DEC mode 2026 reset
      syncSetHandler.cb([2026])
      clearScrollbackHandler.cb([3])
      syncResetHandler.cb([2026])

      // scrollToBottom should be called after 20ms delay
      expect(terminal.scrollToBottom).not.toHaveBeenCalled()
      vi.advanceTimersByTime(20)
      expect(terminal.scrollToBottom).toHaveBeenCalledTimes(1)

      vi.useRealTimers()
    })

    it('does not scroll to bottom if CSI 3 J is not inside a sync transaction', () => {
      vi.useFakeTimers()

      const handlers: { prefix?: string; final: string; cb: (params: (number | number[])[]) => void }[] = []
      vi.mocked(terminal.parser.registerCsiHandler).mockImplementation(
        (id: { prefix?: string; final: string }, cb: (params: (number | number[])[]) => boolean | Promise<boolean>) => {
          handlers.push({ ...id, cb: cb as (params: (number | number[])[]) => void })
          return { dispose: vi.fn() }
        },
      )

      createHandler({ isAgent: true })

      const clearScrollbackHandler = handlers.find(h => h.final === 'J' && !h.prefix)!
      const syncResetHandler = handlers.find(h => h.prefix === '?' && h.final === 'l')!

      // CSI 3 J without prior DEC mode 2026 set
      clearScrollbackHandler.cb([3])
      syncResetHandler.cb([2026])

      vi.advanceTimersByTime(20)
      expect(terminal.scrollToBottom).not.toHaveBeenCalled()

      vi.useRealTimers()
    })

    it('does not scroll if repaint transaction exceeds timeout', () => {
      vi.useFakeTimers()

      const handlers: { prefix?: string; final: string; cb: (params: (number | number[])[]) => void }[] = []
      vi.mocked(terminal.parser.registerCsiHandler).mockImplementation(
        (id: { prefix?: string; final: string }, cb: (params: (number | number[])[]) => boolean | Promise<boolean>) => {
          handlers.push({ ...id, cb: cb as (params: (number | number[])[]) => void })
          return { dispose: vi.fn() }
        },
      )

      createHandler({ isAgent: true })

      const syncSetHandler = handlers.find(h => h.prefix === '?' && h.final === 'h')!
      const clearScrollbackHandler = handlers.find(h => h.final === 'J' && !h.prefix)!
      const syncResetHandler = handlers.find(h => h.prefix === '?' && h.final === 'l')!

      // Start transaction
      syncSetHandler.cb([2026])
      clearScrollbackHandler.cb([3])

      // Wait longer than MAX_REPAINT_TRANSACTION_MS (2000ms)
      vi.advanceTimersByTime(2100)

      // End transaction — too late
      syncResetHandler.cb([2026])
      vi.advanceTimersByTime(20)
      expect(terminal.scrollToBottom).not.toHaveBeenCalled()

      vi.useRealTimers()
    })

    it('disposes CSI handlers on clearTimers', () => {
      const disposeFns = [vi.fn(), vi.fn(), vi.fn()]
      let callIdx = 0
      vi.mocked(terminal.parser.registerCsiHandler).mockImplementation(() => {
        return { dispose: disposeFns[callIdx++] }
      })

      const handler = createHandler({ isAgent: true })
      handler.clearTimers()

      disposeFns.forEach(fn => expect(fn).toHaveBeenCalled())
    })

    it('ignores non-2026 DEC mode params', () => {
      vi.useFakeTimers()

      const handlers: { prefix?: string; final: string; cb: (params: (number | number[])[]) => void }[] = []
      vi.mocked(terminal.parser.registerCsiHandler).mockImplementation(
        (id: { prefix?: string; final: string }, cb: (params: (number | number[])[]) => boolean | Promise<boolean>) => {
          handlers.push({ ...id, cb: cb as (params: (number | number[])[]) => void })
          return { dispose: vi.fn() }
        },
      )

      createHandler({ isAgent: true })

      const syncSetHandler = handlers.find(h => h.prefix === '?' && h.final === 'h')!
      const clearScrollbackHandler = handlers.find(h => h.final === 'J' && !h.prefix)!
      const syncResetHandler = handlers.find(h => h.prefix === '?' && h.final === 'l')!

      // Use a different DEC mode (not 2026)
      syncSetHandler.cb([1049])
      clearScrollbackHandler.cb([3])
      syncResetHandler.cb([1049])

      vi.advanceTimersByTime(20)
      expect(terminal.scrollToBottom).not.toHaveBeenCalled()

      vi.useRealTimers()
    })

    it('ignores non-3 erase params (e.g. CSI 2 J)', () => {
      vi.useFakeTimers()

      const handlers: { prefix?: string; final: string; cb: (params: (number | number[])[]) => void }[] = []
      vi.mocked(terminal.parser.registerCsiHandler).mockImplementation(
        (id: { prefix?: string; final: string }, cb: (params: (number | number[])[]) => boolean | Promise<boolean>) => {
          handlers.push({ ...id, cb: cb as (params: (number | number[])[]) => void })
          return { dispose: vi.fn() }
        },
      )

      createHandler({ isAgent: true })

      const syncSetHandler = handlers.find(h => h.prefix === '?' && h.final === 'h')!
      const clearScrollbackHandler = handlers.find(h => h.final === 'J' && !h.prefix)!
      const syncResetHandler = handlers.find(h => h.prefix === '?' && h.final === 'l')!

      // CSI 2 J (clear screen, not scrollback)
      syncSetHandler.cb([2026])
      clearScrollbackHandler.cb([2])
      syncResetHandler.cb([2026])

      vi.advanceTimersByTime(20)
      expect(terminal.scrollToBottom).not.toHaveBeenCalled()

      vi.useRealTimers()
    })
  })
})
