// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSessionUsageStats, _resetForTesting } from './usePtyStats'

beforeEach(() => {
  _resetForTesting()
  vi.mocked(window.pty.getStats).mockReset()
  vi.mocked(window.pty.getStats).mockResolvedValue({})
})

afterEach(() => {
  _resetForTesting()
})

const flush = async () => {
  // Yield to the microtask queue so the poll's resolved Promise can settle
  await Promise.resolve()
  await Promise.resolve()
}

describe('useSessionUsageStats', () => {
  it('returns undefined when no stats exist for the session', async () => {
    const { result } = renderHook(() => useSessionUsageStats('session-1'))
    await act(async () => { await flush() })
    expect(result.current).toBeUndefined()
  })

  it('exposes stats for the requested session after the first poll', async () => {
    vi.mocked(window.pty.getStats).mockResolvedValueOnce({
      'session-1': { rssMb: 250, cpuPct: 3.2, ptyCount: 2 },
    })
    const { result } = renderHook(() => useSessionUsageStats('session-1'))
    await act(async () => { await flush() })
    expect(result.current).toEqual({ rssMb: 250, cpuPct: 3.2, ptyCount: 2 })
  })

  it('isolates sessions — only the requested one is returned', async () => {
    vi.mocked(window.pty.getStats).mockResolvedValueOnce({
      'session-1': { rssMb: 100, cpuPct: 1.0, ptyCount: 1 },
      'session-2': { rssMb: 200, cpuPct: 2.0, ptyCount: 2 },
    })
    const { result: r1 } = renderHook(() => useSessionUsageStats('session-1'))
    const { result: r2 } = renderHook(() => useSessionUsageStats('session-2'))
    await act(async () => { await flush() })
    expect(r1.current?.rssMb).toBe(100)
    expect(r2.current?.rssMb).toBe(200)
  })

  it('stops polling once every subscriber unmounts', async () => {
    const { unmount } = renderHook(() => useSessionUsageStats('session-1'))
    await act(async () => { await flush() })
    const callsBefore = vi.mocked(window.pty.getStats).mock.calls.length
    unmount()
    // No new mounts → poller should be idle. We can't directly test the timer
    // is cleared, but verify a follow-up tick won't call getStats by waiting
    // a short real-time interval and confirming call count is unchanged.
    await new Promise((r) => setTimeout(r, 10))
    expect(vi.mocked(window.pty.getStats).mock.calls.length).toBe(callsBefore)
  })
})
