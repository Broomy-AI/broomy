// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPtyDataHandler } from './ptyDataHandler'

/** Throttle interval used by the handler's screen sampler (must match SAMPLE_INTERVAL_MS). */
const SAMPLE_MS = 250

interface MockTerminal {
  write: ReturnType<typeof vi.fn>
  scrollToBottom: ReturnType<typeof vi.fn>
  setScreen: (lines: string[]) => void
}

function makeTerminal() {
  let screen: string[] = []
  const term = {
    // xterm's write invokes its callback after the chunk is parsed; the handler
    // schedules screen sampling from that callback. The mock fires it synchronously.
    write: vi.fn((_data: string, cb?: () => void) => { cb?.() }),
    buffer: {
      active: {
        viewportY: 0,
        baseY: 0,
        getLine: (y: number) => (y < screen.length ? { translateToString: () => screen[y] } : undefined),
      },
    },
    cols: 80,
    rows: 24,
    resize: vi.fn(),
    scrollToBottom: vi.fn(),
    parser: { registerCsiHandler: vi.fn().mockReturnValue({ dispose: vi.fn() }) },
    setScreen: (lines: string[]) => { screen = lines },
  }
  return term as unknown as import('@xterm/xterm').Terminal & MockTerminal
}

function makeState() {
  return {
    processPlanDetection: vi.fn(),
    lastUserInputRef: { current: 0 },
    lastInteractionRef: { current: 0 },
    lastStatusRef: { current: 'idle' as 'working' | 'idle' },
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
  })

  it('does not run activity detection for non-agent terminals', () => {
    const handler = createHandler({ isAgent: false })
    handler.handleData('output')
    expect(state.processPlanDetection).not.toHaveBeenCalled()
  })

  describe('activity detection (rendered-change + capped stability lease)', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(1_000_000)
    })
    afterEach(() => { vi.useRealTimers() })

    /** Create an agent handler past its warmup, with a known baseline screen. */
    function agentPastWarmup(baseline: string[]) {
      terminal.setScreen(baseline)
      const handler = createHandler({ isAgent: true })
      vi.advanceTimersByTime(6000) // past the 5s warmup
      return handler
    }

    it('flags working when the rendered screen changes after warmup', () => {
      const handler = agentPastWarmup(['prompt>'])
      terminal.setScreen(['prompt>', 'thinking...'])
      handler.handleData('thinking...')
      vi.advanceTimersByTime(SAMPLE_MS)
      expect(state.scheduleUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'working' }))
      expect(state.lastStatusRef.current).toBe('working')
    })

    it('reports the first-output time as workingStartedAt, not the later sample time', () => {
      const handler = agentPastWarmup(['line 1'])
      const firstOutput = Date.now()
      terminal.setScreen(['line 1', 'work'])
      handler.handleData('work')          // output arrives at firstOutput
      vi.advanceTimersByTime(SAMPLE_MS)    // sample runs SAMPLE_MS later
      // workingStartTime must be measured from the output, so the >=3s unread
      // threshold isn't undercounted by the sampling/debounce delay.
      expect(state.scheduleUpdate).toHaveBeenCalledWith({ status: 'working', workingStartedAt: firstOutput })
      expect(firstOutput).toBeLessThan(Date.now())
    })

    it('never flips an idle session to working on an UNCHANGED repaint — the core fix', () => {
      const handler = agentPastWarmup(['idle footer'])
      // Agent repaints the exact same screen (sync-wrapped), many times.
      for (let i = 0; i < 5; i++) {
        handler.handleData('\x1b[?2026h idle footer \x1b[?2026l')
        vi.advanceTimersByTime(SAMPLE_MS)
      }
      expect(state.scheduleUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'working' }))
      expect(state.lastStatusRef.current).toBe('idle')
    })

    it('idles after the stability cap when an idle TUI keeps repainting the same screen', () => {
      const handler = agentPastWarmup(['line 1'])
      // Real work makes the screen change → working.
      terminal.setScreen(['line 1', 'working...'])
      handler.handleData('working...')
      vi.advanceTimersByTime(SAMPLE_MS)
      expect(state.lastStatusRef.current).toBe('working')

      // Then the agent goes idle but repaints the SAME screen every 500ms.
      state.scheduleUpdate.mockClear()
      for (let i = 0; i < 12; i++) {
        vi.advanceTimersByTime(500)
        handler.handleData('\x1b[?2026h working... \x1b[?2026l') // screen unchanged
        vi.advanceTimersByTime(SAMPLE_MS)
      }
      // Within maxStableOutputMs (3s) of the last real change it must have idled,
      // despite output never stopping.
      expect(state.scheduleUpdate).toHaveBeenCalledWith({ status: 'idle' })
      expect(state.lastStatusRef.current).toBe('idle')
    })

    it('stays working while the screen keeps changing, even past the stability cap', () => {
      const handler = agentPastWarmup(['line 1'])
      terminal.setScreen(['line 1', 'stream 0'])
      handler.handleData('stream 0')
      vi.advanceTimersByTime(SAMPLE_MS)
      expect(state.lastStatusRef.current).toBe('working')

      state.scheduleUpdate.mockClear()
      for (let i = 1; i < 12; i++) {
        vi.advanceTimersByTime(500)
        terminal.setScreen(['line 1', `stream ${i}`]) // screen changes each time
        handler.handleData(`stream ${i}`)
        vi.advanceTimersByTime(SAMPLE_MS)
      }
      expect(state.lastStatusRef.current).toBe('working')
      expect(state.scheduleUpdate).not.toHaveBeenCalledWith({ status: 'idle' })
    })

    it('idles after idleTimeoutMs of true silence', () => {
      const handler = agentPastWarmup(['line 1'])
      terminal.setScreen(['line 1', 'done'])
      handler.handleData('done')
      vi.advanceTimersByTime(SAMPLE_MS)
      expect(state.lastStatusRef.current).toBe('working')

      state.scheduleUpdate.mockClear()
      vi.advanceTimersByTime(1000) // no further output → silence timeout
      expect(state.scheduleUpdate).toHaveBeenCalledWith({ status: 'idle' })
      expect(state.lastStatusRef.current).toBe('idle')
    })

    it('ignores a screen change during the warmup window', () => {
      terminal.setScreen(['a'])
      const handler = createHandler({ isAgent: true })
      vi.advanceTimersByTime(1000) // still within 5s warmup
      terminal.setScreen(['a', 'b'])
      handler.handleData('b')
      vi.advanceTimersByTime(SAMPLE_MS)
      expect(state.scheduleUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'working' }))
    })

    it('clearTimers cancels the pending idle and sample timers', () => {
      const handler = agentPastWarmup(['line 1'])
      terminal.setScreen(['line 1', 'x'])
      handler.handleData('x') // arms a sample; will arm idle once working
      vi.advanceTimersByTime(SAMPLE_MS)
      handler.handleData('\x1b[?2026h x \x1b[?2026l') // another sample pending

      handler.clearTimers()
      state.scheduleUpdate.mockClear()
      vi.advanceTimersByTime(10000)
      expect(state.scheduleUpdate).not.toHaveBeenCalled()
    })

    it('samples only after the write callback fires — a change parsed late is still caught', () => {
      const handler = agentPastWarmup(['line 1'])
      // Simulate a slow/large parse: capture the write callback instead of firing it now.
      let parseComplete: (() => void) | undefined
      vi.mocked(terminal.write).mockImplementation((_d: string, cb?: () => void) => { parseComplete = cb })
      handler.handleData('big burst still parsing...')
      vi.advanceTimersByTime(2000)
      // Parse not done → no sample scheduled → no premature transition.
      expect(state.scheduleUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'working' }))
      // Parse completes with a changed screen → the post-parse sample catches it.
      terminal.setScreen(['line 1', 'big burst parsed'])
      parseComplete?.()
      vi.advanceTimersByTime(SAMPLE_MS)
      expect(state.scheduleUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'working' }))
    })

    it('a sample pending at teardown cannot revive the session', () => {
      const handler = agentPastWarmup(['line 1'])
      terminal.setScreen(['line 1', 'late output'])
      handler.handleData('late output') // schedules a sample
      handler.clearTimers()              // e.g. PTY exit / unmount before it runs
      state.scheduleUpdate.mockClear()
      vi.advanceTimersByTime(SAMPLE_MS + 5000)
      expect(state.scheduleUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'working' }))
    })
  })

  describe('repaint transaction detection', () => {
    it('registers CSI handlers for agent terminals', () => {
      createHandler({ isAgent: true })
      expect(terminal.parser.registerCsiHandler).toHaveBeenCalledTimes(3)
    })

    it('does not register CSI handlers for non-agent terminals', () => {
      createHandler({ isAgent: false })
      expect(terminal.parser.registerCsiHandler).not.toHaveBeenCalled()
    })

    it('scrolls to bottom after a repaint transaction (CSI 3 J inside DEC mode 2026)', () => {
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
      syncSetHandler.cb([2026])
      clearScrollbackHandler.cb([3])
      syncResetHandler.cb([2026])
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
      clearScrollbackHandler.cb([3])
      syncResetHandler.cb([2026])
      vi.advanceTimersByTime(20)
      expect(terminal.scrollToBottom).not.toHaveBeenCalled()
      vi.useRealTimers()
    })

    it('disposes CSI handlers on clearTimers', () => {
      const disposeFns = [vi.fn(), vi.fn(), vi.fn()]
      let callIdx = 0
      vi.mocked(terminal.parser.registerCsiHandler).mockImplementation(() => ({ dispose: disposeFns[callIdx++] }))
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
      syncSetHandler.cb([1049])
      clearScrollbackHandler.cb([3])
      syncResetHandler.cb([1049])
      vi.advanceTimersByTime(20)
      expect(terminal.scrollToBottom).not.toHaveBeenCalled()
      vi.useRealTimers()
    })
  })
})
