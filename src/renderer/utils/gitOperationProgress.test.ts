// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { withGitProgress } from './gitOperationProgress'
import { useSessionStore, type SessionStatus } from '../store/sessions'

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('withGitProgress', () => {
  it('calls updateAgentMonitor with working status immediately', async () => {
    const updateSpy = vi.spyOn(useSessionStore.getState(), 'updateAgentMonitor')
    // Need to re-spy on each getState call since the store recreates
    const getStateSpy = vi.spyOn(useSessionStore, 'getState')

    const fn = vi.fn().mockResolvedValue('result')

    const promise = withGitProgress('session-1', fn)
    // Let the microtask (fn) resolve
    await vi.advanceTimersByTimeAsync(0)
    const result = await promise

    expect(result).toBe('result')
    expect(fn).toHaveBeenCalledOnce()
    // getState is called at least once for the initial updateAgentMonitor
    expect(getStateSpy).toHaveBeenCalled()

    getStateSpy.mockRestore()
    updateSpy.mockRestore()
  })

  it('sets working status periodically during the operation', async () => {
    const calls: { id: string; update: { status?: SessionStatus } }[] = []
    const originalGetState = useSessionStore.getState.bind(useSessionStore)
    vi.spyOn(useSessionStore, 'getState').mockImplementation(() => {
      const state = originalGetState()
      return {
        ...state,
        updateAgentMonitor: (id: string, update: { status?: SessionStatus }) => {
          calls.push({ id, update })
          state.updateAgentMonitor(id, update)
        },
      } as ReturnType<typeof useSessionStore.getState>
    })

    let resolve: (value: string) => void
    const fn = vi.fn().mockReturnValue(new Promise<string>((r) => { resolve = r }))

    const promise = withGitProgress('session-1', fn)

    // Initial call
    expect(calls.length).toBe(1)
    expect(calls[0]).toEqual({ id: 'session-1', update: { status: 'working' } })

    // Advance past one interval
    await vi.advanceTimersByTimeAsync(500)
    expect(calls.length).toBe(2)
    expect(calls[1]).toEqual({ id: 'session-1', update: { status: 'working' } })

    // Advance past another interval
    await vi.advanceTimersByTimeAsync(500)
    expect(calls.length).toBe(3)

    // Resolve the operation
    resolve!('done')
    await promise

    // Final call should transition to idle
    const lastCall = calls[calls.length - 1]
    expect(lastCall).toEqual({ id: 'session-1', update: { status: 'idle' } })

    // After resolution, no more calls should happen
    const countAfterResolve = calls.length
    await vi.advanceTimersByTimeAsync(1000)
    expect(calls.length).toBe(countAfterResolve)

    vi.restoreAllMocks()
  })

  it('clears interval when the operation throws', async () => {
    const calls: { id: string; update: { status?: SessionStatus } }[] = []
    const originalGetState = useSessionStore.getState.bind(useSessionStore)
    vi.spyOn(useSessionStore, 'getState').mockImplementation(() => {
      const state = originalGetState()
      return {
        ...state,
        updateAgentMonitor: (id: string, update: { status?: SessionStatus }) => {
          calls.push({ id, update })
          state.updateAgentMonitor(id, update)
        },
      } as ReturnType<typeof useSessionStore.getState>
    })

    const fn = vi.fn().mockRejectedValue(new Error('git failed'))

    await expect(withGitProgress('session-1', fn)).rejects.toThrow('git failed')

    // Should have initial working call + final idle call
    expect(calls.length).toBeGreaterThanOrEqual(2)
    const lastCall = calls[calls.length - 1]
    expect(lastCall).toEqual({ id: 'session-1', update: { status: 'idle' } })

    // After rejection, no more calls
    const countAfterError = calls.length
    await vi.advanceTimersByTimeAsync(1000)
    expect(calls.length).toBe(countAfterError)

    vi.restoreAllMocks()
  })

  it('skips progress tracking when sessionId is null', async () => {
    const getStateSpy = vi.spyOn(useSessionStore, 'getState')
    const fn = vi.fn().mockResolvedValue('result')

    const result = await withGitProgress(null, fn)

    expect(result).toBe('result')
    expect(fn).toHaveBeenCalledOnce()
    // getState should not be called when sessionId is null
    expect(getStateSpy).not.toHaveBeenCalled()

    getStateSpy.mockRestore()
  })

  it('returns the function result', async () => {
    const fn = vi.fn().mockResolvedValue({ success: true, data: 42 })

    const result = await withGitProgress('session-1', fn)

    expect(result).toEqual({ success: true, data: 42 })
  })
})
