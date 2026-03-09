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

  it('does not set up a file watcher', () => {
    vi.mocked(window.fs.exists).mockResolvedValue(false as never)

    renderHook(() => useIssuePlanDetection('session-1', '/repos/project'))

    expect(window.fs.watch).not.toHaveBeenCalled()
    expect(window.fs.onChange).not.toHaveBeenCalled()
  })
})
