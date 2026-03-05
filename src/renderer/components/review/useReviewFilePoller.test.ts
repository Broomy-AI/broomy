// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import '../../../test/react-setup'
import { useReviewFilePoller } from './useReviewFilePoller'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
})

function makeOptions(overrides = {}) {
  return {
    reviewFilePath: '/test/repo/.broomy/output/review.md',
    sessionDirectory: '/test/repo',
    setReviewMarkdown: vi.fn(),
    setWaitingForAgent: vi.fn(),
    ...overrides,
  }
}

describe('useReviewFilePoller', () => {
  it('polls and updates markdown when review.md appears', async () => {
    const markdown = '## Overview\nTest review'
    vi.mocked(window.fs.exists).mockResolvedValue(false)

    const opts = makeOptions()
    renderHook(() => useReviewFilePoller(opts))

    // File doesn't exist yet
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100)
    })
    expect(opts.setReviewMarkdown).not.toHaveBeenCalled()

    // File appears
    vi.mocked(window.fs.exists).mockResolvedValue(true)
    vi.mocked(window.fs.readFile).mockResolvedValue(markdown)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100)
    })

    expect(opts.setReviewMarkdown).toHaveBeenCalledWith(markdown)
    expect(opts.setWaitingForAgent).toHaveBeenCalledWith(false)
  })

  it('resolves include directives in markdown', async () => {
    const mainContent = '## Overview\nSummary\n\n<!-- include: .broomy/review-security.md -->'
    const includedContent = '### Security\nNo issues found.'

    vi.mocked(window.fs.exists).mockImplementation(async (path: string) => {
      if (path.includes('review.md') || path.includes('review-security.md')) return true
      return false
    })
    vi.mocked(window.fs.readFile).mockImplementation(async (path: string) => {
      if (path.includes('review-security.md')) return includedContent
      if (path.includes('review.md')) return mainContent
      return ''
    })

    const opts = makeOptions()
    renderHook(() => useReviewFilePoller(opts))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100)
    })

    const calledWith = opts.setReviewMarkdown.mock.calls[0][0] as string
    expect(calledWith).toContain('### Security')
    expect(calledWith).toContain('No issues found.')
    expect(calledWith).not.toContain('<!-- include:')
  })

  it('shows pending placeholder for missing include files', async () => {
    const mainContent = '## Overview\n<!-- include: .broomy/review-perf.md -->'

    vi.mocked(window.fs.exists).mockImplementation(async (path: string) => {
      if (path.includes('review.md')) return true
      return false
    })
    vi.mocked(window.fs.readFile).mockImplementation(async (path: string) => {
      if (path.includes('review.md')) return mainContent
      return ''
    })

    const opts = makeOptions()
    renderHook(() => useReviewFilePoller(opts))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100)
    })

    const calledWith = opts.setReviewMarkdown.mock.calls[0][0] as string
    expect(calledWith).toContain('*Pending: .broomy/review-perf.md...*')
  })

  it('detects file deletion', async () => {
    const markdown = '## Test'
    vi.mocked(window.fs.exists).mockResolvedValue(true)
    vi.mocked(window.fs.readFile).mockResolvedValue(markdown)

    const opts = makeOptions()
    renderHook(() => useReviewFilePoller(opts))

    // First poll loads the file
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100)
    })
    expect(opts.setReviewMarkdown).toHaveBeenCalledWith(markdown)

    // File gets deleted
    vi.mocked(window.fs.exists).mockResolvedValue(false)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100)
    })

    expect(opts.setReviewMarkdown).toHaveBeenCalledWith(null)
  })

  it('skips update when content has not changed', async () => {
    const markdown = '## Stable content'
    vi.mocked(window.fs.exists).mockResolvedValue(true)
    vi.mocked(window.fs.readFile).mockResolvedValue(markdown)

    const opts = makeOptions()
    renderHook(() => useReviewFilePoller(opts))

    // First poll
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100)
    })
    expect(opts.setReviewMarkdown).toHaveBeenCalledTimes(1)

    // Second poll - same content
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100)
    })
    // Should not call again since content is same and no includes changed
    expect(opts.setReviewMarkdown).toHaveBeenCalledTimes(1)
  })

  it('re-resolves includes even when main content unchanged', async () => {
    const mainContent = '## Overview\n<!-- include: .broomy/sub.md -->'

    vi.mocked(window.fs.exists).mockImplementation(async (path: string) => {
      if (path.includes('review.md')) return true
      return false  // sub.md doesn't exist yet
    })
    vi.mocked(window.fs.readFile).mockImplementation(async (path: string) => {
      if (path.includes('review.md')) return mainContent
      return ''
    })

    const opts = makeOptions()
    renderHook(() => useReviewFilePoller(opts))

    // First poll - sub.md missing
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100)
    })
    const firstCall = opts.setReviewMarkdown.mock.calls[0][0] as string
    expect(firstCall).toContain('*Pending: .broomy/sub.md...*')

    // Now sub.md appears
    vi.mocked(window.fs.exists).mockResolvedValue(true)
    vi.mocked(window.fs.readFile).mockImplementation(async (path: string) => {
      if (path.includes('sub.md')) return 'Sub analysis done.'
      if (path.includes('review.md')) return mainContent
      return ''
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100)
    })

    const lastCall = opts.setReviewMarkdown.mock.calls.at(-1)![0] as string
    expect(lastCall).toContain('Sub analysis done.')
  })

  it('handles read errors gracefully', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(true)
    vi.mocked(window.fs.readFile).mockRejectedValue(new Error('read error'))

    const opts = makeOptions()
    renderHook(() => useReviewFilePoller(opts))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100)
    })

    // Should not crash, should not update markdown
    expect(opts.setReviewMarkdown).not.toHaveBeenCalled()
  })

  it('handles include read errors gracefully', async () => {
    const mainContent = '## Overview\n<!-- include: .broomy/broken.md -->'

    vi.mocked(window.fs.exists).mockImplementation(async (path: string) => {
      if (path.includes('review.md')) return true
      if (path.includes('broken.md')) return true
      return false
    })
    vi.mocked(window.fs.readFile).mockImplementation(async (path: string) => {
      if (path.includes('broken.md')) throw new Error('read error')
      if (path.includes('review.md')) return mainContent
      return ''
    })

    const opts = makeOptions()
    renderHook(() => useReviewFilePoller(opts))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100)
    })

    const calledWith = opts.setReviewMarkdown.mock.calls[0][0] as string
    expect(calledWith).toContain('*Pending: .broomy/broken.md...*')
  })
})
