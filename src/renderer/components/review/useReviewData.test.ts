// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import '../../../test/react-setup'
import { useReviewData } from './useReviewData'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  // Default mocks
  vi.mocked(window.fs.exists).mockResolvedValue(false)
  vi.mocked(window.git.branchChanges).mockResolvedValue({ files: [], baseBranch: 'main', mergeBase: 'abc1234' })
})

describe('useReviewData', () => {
  it('returns initial state', () => {
    const { result } = renderHook(() =>
      useReviewData('session-1', '/test/repo', 'main')
    )

    expect(result.current.reviewMarkdown).toBeNull()
    expect(result.current.waitingForAgent).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.fetching).toBe(false)
  })

  it('computes correct file paths', () => {
    const { result } = renderHook(() =>
      useReviewData('session-1', '/test/repo', 'main')
    )

    expect(result.current.broomyDir).toBe('/test/repo/.broomy')
    expect(result.current.outputDir).toBe('/test/repo/.broomy/output')
    expect(result.current.reviewFilePath).toBe('/test/repo/.broomy/output/review.md')
    expect(result.current.promptFilePath).toBe('/test/repo/.broomy/output/review-prompt.md')
  })

  it('loads review markdown on mount when file exists', async () => {
    const markdown = '## Overview\nThis PR adds a feature.'

    vi.mocked(window.fs.exists).mockImplementation(async (path: string) => {
      return path.includes('review.md')
    })
    vi.mocked(window.fs.readFile).mockImplementation(async (path: string) => {
      if (path.includes('review.md')) return markdown
      return ''
    })

    const { result } = renderHook(() =>
      useReviewData('session-1', '/test/repo', 'main')
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })

    expect(result.current.reviewMarkdown).toEqual(markdown)
  })

  it('resets state when session changes', async () => {
    const { result, rerender } = renderHook(
      ({ sessionId }) => useReviewData(sessionId, '/test/repo', 'main'),
      { initialProps: { sessionId: 'session-1' } }
    )

    // Set some state
    act(() => {
      result.current.setError('some error')
      result.current.setWaitingForAgent(true)
    })

    expect(result.current.error).toBe('some error')

    // Change session
    rerender({ sessionId: 'session-2' })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })

    expect(result.current.error).toBeNull()
    expect(result.current.waitingForAgent).toBe(false)
    expect(result.current.reviewMarkdown).toBeNull()
  })

  it('computes merge-base from git', async () => {
    vi.mocked(window.git.branchChanges).mockResolvedValue({
      files: [],
      baseBranch: 'main',
      mergeBase: 'def5678',
    })

    const { result } = renderHook(() =>
      useReviewData('session-1', '/test/repo', 'main')
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })

    expect(result.current.mergeBase).toBe('def5678')
  })

  it('provides setter functions', () => {
    const { result } = renderHook(() =>
      useReviewData('session-1', '/test/repo', 'main')
    )

    expect(typeof result.current.setReviewMarkdown).toBe('function')
    expect(typeof result.current.setWaitingForAgent).toBe('function')
    expect(typeof result.current.setError).toBe('function')
    expect(typeof result.current.setFetching).toBe('function')
  })

  it('sets mergeBase to empty string when branchChanges fails', async () => {
    vi.mocked(window.git.branchChanges).mockRejectedValue(new Error('git error'))

    const { result } = renderHook(() =>
      useReviewData('session-1', '/test/repo', 'main')
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })

    expect(result.current.mergeBase).toBe('')
  })

  it('handles review markdown loading error gracefully', async () => {
    vi.mocked(window.fs.exists).mockImplementation(async (path: string) => {
      if (path.includes('review.md')) return true
      return false
    })
    vi.mocked(window.fs.readFile).mockRejectedValue(new Error('read error'))

    const { result } = renderHook(() =>
      useReviewData('session-1', '/test/repo', 'main')
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })

    expect(result.current.reviewMarkdown).toBeNull()
  })

  it('polls for review.md changes and updates reviewMarkdown', async () => {
    const markdown = '## Overview\nNew review content.'

    // Start with no files
    vi.mocked(window.fs.exists).mockResolvedValue(false)

    const { result } = renderHook(() =>
      useReviewData('session-1', '/test/repo', 'main')
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })

    expect(result.current.reviewMarkdown).toBeNull()

    // Now make the review.md appear
    vi.mocked(window.fs.exists).mockImplementation(async (path: string) => {
      if (path.includes('review.md')) return true
      return false
    })
    vi.mocked(window.fs.readFile).mockImplementation(async (path: string) => {
      if (path.includes('review.md')) return markdown
      return ''
    })

    // Advance past the 1-second polling interval
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100)
    })

    expect(result.current.reviewMarkdown).toEqual(markdown)
    expect(result.current.waitingForAgent).toBe(false)
  })

  it('calls branchChanges without baseBranch when prBaseBranch is empty', async () => {
    vi.mocked(window.git.branchChanges).mockResolvedValue({
      files: [],
      baseBranch: 'main',
      mergeBase: 'abc1234',
    })

    renderHook(() =>
      useReviewData('session-1', '/test/repo')
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })

    expect(window.git.branchChanges).toHaveBeenCalledWith('/test/repo', undefined)
  })

  it('skips merge-base fetch when sessionDirectory is empty', async () => {
    renderHook(() =>
      useReviewData('session-1', '', 'main')
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })

    expect(window.git.branchChanges).not.toHaveBeenCalled()
  })
})
