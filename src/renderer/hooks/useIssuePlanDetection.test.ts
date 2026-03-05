// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import '../../test/setup'
import { useIssuePlanDetection } from './useIssuePlanDetection'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useIssuePlanDetection', () => {
  it('returns false when sessionId is null', () => {
    const { result } = renderHook(() => useIssuePlanDetection(null, '/repos/project'))
    expect(result.current).toBe(false)
  })

  it('returns false when directory is undefined', () => {
    const { result } = renderHook(() => useIssuePlanDetection('session-1', undefined))
    expect(result.current).toBe(false)
  })

  it('checks file existence on mount', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(true as never)

    let result: { current: boolean }
    await act(async () => {
      const hook = renderHook(() => useIssuePlanDetection('session-1', '/repos/project'))
      result = hook.result
    })

    expect(result!.current).toBe(true)
    expect(window.fs.exists).toHaveBeenCalledWith('/repos/project/.broomy/output/plan.md')
  })

  it('sets up a file watcher', () => {
    vi.mocked(window.fs.exists).mockResolvedValue(false as never)

    renderHook(() => useIssuePlanDetection('session-1', '/repos/project'))

    expect(window.fs.watch).toHaveBeenCalledWith('issue-plan-session-1', '/repos/project')
    expect(window.fs.onChange).toHaveBeenCalledWith('issue-plan-session-1', expect.any(Function))
  })

  it('re-checks on watcher events with debounce', async () => {
    vi.useFakeTimers()
    vi.mocked(window.fs.exists).mockResolvedValue(false as never)

    let onChangeCallback: (event: { filename: string }) => void = () => {}
    vi.mocked(window.fs.onChange).mockImplementation((_id, cb) => {
      onChangeCallback = cb as typeof onChangeCallback
      return () => {}
    })

    renderHook(() => useIssuePlanDetection('session-1', '/repos/project'))

    // Clear the initial exists call
    vi.mocked(window.fs.exists).mockClear()
    vi.mocked(window.fs.exists).mockResolvedValue(true as never)

    // Trigger onChange
    act(() => {
      onChangeCallback({ filename: 'plan.md' })
    })

    // Before debounce, no new exists call
    expect(window.fs.exists).not.toHaveBeenCalled()

    // After debounce
    await act(async () => {
      vi.advanceTimersByTime(500)
    })

    expect(window.fs.exists).toHaveBeenCalledWith('/repos/project/.broomy/output/plan.md')

    vi.useRealTimers()
  })

  it('cleans up watcher on unmount', () => {
    vi.mocked(window.fs.exists).mockResolvedValue(false as never)
    const removeListener = vi.fn()
    vi.mocked(window.fs.onChange).mockReturnValue(removeListener)

    const { unmount } = renderHook(() => useIssuePlanDetection('session-1', '/repos/project'))

    unmount()

    expect(removeListener).toHaveBeenCalled()
    expect(window.fs.unwatch).toHaveBeenCalledWith('issue-plan-session-1')
  })
})
