// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPtyDataHandler, MAX_BUFFER_SIZE } from './ptyDataHandler'

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
  } as unknown as import('@xterm/xterm').Terminal
}

function makeState() {
  return {
    processPlanDetection: vi.fn(),
    lastUserInputRef: { current: 0 },
    lastInteractionRef: { current: 0 },
    lastStatusRef: { current: 'idle' as const },
    idleTimeoutRef: { current: null },
    scheduleUpdate: vi.fn(),
  }
}

describe('createPtyDataHandler', () => {
  let terminal: ReturnType<typeof makeTerminal>
  let state: ReturnType<typeof makeState>
  let isActiveRef: { current: boolean }

  beforeEach(() => {
    vi.clearAllMocks()
    terminal = makeTerminal()
    state = makeState()
    isActiveRef = { current: true }
  })

  function createHandler(overrides: { isAgent?: boolean; command?: string } = {}) {
    return createPtyDataHandler({
      terminal,
      isAgent: overrides.isAgent ?? false,
      command: overrides.command,
      state,
      effectStartTime: Date.now(),
      isActiveRef,
    })
  }

  it('writes data to terminal when active', () => {
    const handler = createHandler()
    handler.handleData('hello')
    expect(terminal.write).toHaveBeenCalledWith('hello')
  })

  it('does not call scrollToBottom — xterm 6 handles scroll pinning natively', () => {
    const handler = createHandler()
    handler.handleData('data')
    // scrollToBottom should never be called by the data handler
    expect((terminal as { scrollToBottom?: unknown }).scrollToBottom).toBeUndefined()
  })

  it('buffers data when inactive instead of writing to terminal', () => {
    isActiveRef.current = false
    const handler = createHandler()
    handler.handleData('hello')
    handler.handleData(' world')
    expect(terminal.write).not.toHaveBeenCalled()
  })

  it('flushes buffered data as a single write', () => {
    isActiveRef.current = false
    const handler = createHandler()
    handler.handleData('hello')
    handler.handleData(' world')
    handler.handleData('!')

    isActiveRef.current = true
    handler.flush()

    expect(terminal.write).toHaveBeenCalledTimes(1)
    expect(terminal.write).toHaveBeenCalledWith('hello world!')
  })

  it('flush is a no-op when buffer is empty', () => {
    const handler = createHandler()
    handler.flush()
    expect(terminal.write).not.toHaveBeenCalled()
  })

  it('clears buffer after flush', () => {
    isActiveRef.current = false
    const handler = createHandler()
    handler.handleData('data')
    handler.flush()
    // Second flush should be a no-op
    vi.mocked(terminal.write).mockClear()
    handler.flush()
    expect(terminal.write).not.toHaveBeenCalled()
  })

  it('caps buffer at MAX_BUFFER_SIZE by dropping oldest chunks', () => {
    isActiveRef.current = false
    const handler = createHandler()

    // Write chunks that exceed MAX_BUFFER_SIZE
    const chunkSize = 1024 * 1024 // 1MB
    const chunk = 'x'.repeat(chunkSize)
    for (let i = 0; i < 7; i++) {
      handler.handleData(chunk)
    }

    // Flush and check the total size is <= MAX_BUFFER_SIZE
    handler.flush()
    expect(terminal.write).toHaveBeenCalledTimes(1)
    const writtenData = vi.mocked(terminal.write).mock.calls[0][0] as string
    expect(writtenData.length).toBeLessThanOrEqual(MAX_BUFFER_SIZE)
    // Should have dropped earliest chunks
    expect(writtenData.length).toBeGreaterThan(0)
  })

  it('skips buffering for codex terminals (writes through when inactive)', () => {
    isActiveRef.current = false
    const handler = createHandler({ isAgent: true, command: 'codex' })
    handler.handleData('hello')
    handler.handleData(' world')
    expect(terminal.write).toHaveBeenCalledTimes(2)
  })

  it('still buffers non-codex agent terminals when inactive', () => {
    isActiveRef.current = false
    const handler = createHandler({ isAgent: true, command: 'claude' })
    handler.handleData('hello')
    expect(terminal.write).not.toHaveBeenCalled()
  })

  it('still runs activity detection when inactive (agent terminal)', async () => {
    const { evaluateActivity } = await import('../utils/terminalActivityDetector')
    vi.mocked(evaluateActivity).mockReturnValue({ status: 'working', scheduleIdle: true })

    isActiveRef.current = false
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

  describe('clearTimers', () => {
    it('is a no-op (kept for interface compatibility)', () => {
      const handler = createHandler()
      handler.clearTimers()
      // Should not throw
    })
  })
})
