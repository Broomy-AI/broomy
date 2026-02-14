// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePlanDetection } from './usePlanDetection'

describe('usePlanDetection', () => {
  let sessionIdRef: React.MutableRefObject<string | undefined>
  let setPlanFileRef: React.MutableRefObject<(sessionId: string, planFile: string) => void>
  let mockSetPlanFile: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    mockSetPlanFile = vi.fn()
    sessionIdRef = { current: 'test-session' }
    setPlanFileRef = { current: mockSetPlanFile }
  })

  it('returns a processPlanDetection function', () => {
    const { result } = renderHook(() => usePlanDetection(sessionIdRef, setPlanFileRef))
    expect(typeof result.current).toBe('function')
  })

  it('detects plan file path from terminal data', () => {
    const { result } = renderHook(() => usePlanDetection(sessionIdRef, setPlanFileRef))

    act(() => {
      result.current('Reading /home/user/.claude-personal/plans/my-plan.md')
    })

    expect(mockSetPlanFile).toHaveBeenCalledWith(
      'test-session',
      '/home/user/.claude-personal/plans/my-plan.md',
    )
  })

  it('does not call setPlanFile when no plan file path is in the data', () => {
    const { result } = renderHook(() => usePlanDetection(sessionIdRef, setPlanFileRef))

    act(() => {
      result.current('Some regular terminal output without plan paths')
    })

    expect(mockSetPlanFile).not.toHaveBeenCalled()
  })

  it('does nothing when sessionId is undefined', () => {
    sessionIdRef.current = undefined
    const { result } = renderHook(() => usePlanDetection(sessionIdRef, setPlanFileRef))

    act(() => {
      result.current('Reading /home/user/.claude-personal/plans/my-plan.md')
    })

    expect(mockSetPlanFile).not.toHaveBeenCalled()
  })

  it('strips ANSI escape codes before matching', () => {
    const { result } = renderHook(() => usePlanDetection(sessionIdRef, setPlanFileRef))

    act(() => {
      result.current('\x1b[32mReading /home/user/.claude-personal/plans/plan.md\x1b[0m')
    })

    expect(mockSetPlanFile).toHaveBeenCalledWith(
      'test-session',
      '/home/user/.claude-personal/plans/plan.md',
    )
  })

  it('detects plan file split across multiple data chunks', () => {
    const { result } = renderHook(() => usePlanDetection(sessionIdRef, setPlanFileRef))

    act(() => {
      result.current('Reading /home/user/.claude-per')
    })
    expect(mockSetPlanFile).not.toHaveBeenCalled()

    act(() => {
      result.current('sonal/plans/my-plan.md')
    })
    expect(mockSetPlanFile).toHaveBeenCalledWith(
      'test-session',
      '/home/user/.claude-personal/plans/my-plan.md',
    )
  })

  it('does not call setPlanFile again for the same plan file', () => {
    const { result } = renderHook(() => usePlanDetection(sessionIdRef, setPlanFileRef))

    act(() => {
      result.current('Reading /home/user/.claude-personal/plans/plan.md')
    })
    expect(mockSetPlanFile).toHaveBeenCalledTimes(1)

    act(() => {
      result.current('Still reading /home/user/.claude-personal/plans/plan.md')
    })
    // Should not call again for the same plan file
    expect(mockSetPlanFile).toHaveBeenCalledTimes(1)
  })

  it('calls setPlanFile when a different plan file is detected', () => {
    const { result } = renderHook(() => usePlanDetection(sessionIdRef, setPlanFileRef))

    act(() => {
      result.current('Reading /home/user/.claude-personal/plans/plan-a.md')
    })
    expect(mockSetPlanFile).toHaveBeenCalledTimes(1)

    // Push enough data to flush the buffer past the first match
    act(() => {
      result.current('x'.repeat(1100))
    })

    act(() => {
      result.current('Reading /home/user/.claude-personal/plans/plan-b.md')
    })
    expect(mockSetPlanFile).toHaveBeenCalledTimes(2)
    expect(mockSetPlanFile).toHaveBeenCalledWith(
      'test-session',
      '/home/user/.claude-personal/plans/plan-b.md',
    )
  })

  it('trims buffer to last 1000 characters when it exceeds 1000', () => {
    const { result } = renderHook(() => usePlanDetection(sessionIdRef, setPlanFileRef))

    // Push 1200 characters of padding
    act(() => {
      result.current('x'.repeat(1200))
    })

    // Now push a plan file path
    act(() => {
      result.current('/home/user/.claude-personal/plans/after-trim.md')
    })

    expect(mockSetPlanFile).toHaveBeenCalledWith(
      'test-session',
      '/home/user/.claude-personal/plans/after-trim.md',
    )
  })

  it('matches plan paths with various directory structures', () => {
    const { result } = renderHook(() => usePlanDetection(sessionIdRef, setPlanFileRef))

    act(() => {
      result.current('/Users/someone/project/.claude-personal/plans/deep/nested/plan.md')
    })

    expect(mockSetPlanFile).toHaveBeenCalledWith(
      'test-session',
      '/Users/someone/project/.claude-personal/plans/deep/nested/plan.md',
    )
  })
})
