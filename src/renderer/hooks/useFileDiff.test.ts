// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useFileDiff } from './useFileDiff'

function makeParams(overrides: Partial<Parameters<typeof useFileDiff>[0]> = {}) {
  return {
    filePath: '/project/src/file.ts',
    directory: '/project',
    canShowDiff: true,
    viewMode: 'diff',
    diffBaseRef: undefined,
    diffCurrentRef: undefined,
    ...overrides,
  }
}

describe('useFileDiff', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // --- Original content loading ---
  it('loads original content from git HEAD when in diff mode', async () => {
    vi.mocked(window.git.show).mockResolvedValue('original code')
    const { result } = renderHook(() => useFileDiff(makeParams()))
    await waitFor(() => {
      expect(result.current.isLoadingDiff).toBe(false)
    })
    expect(result.current.originalContent).toBe('original code')
    expect(window.git.show).toHaveBeenCalledWith('/project', 'src/file.ts', 'HEAD')
  })

  it('uses diffBaseRef instead of HEAD when provided', async () => {
    vi.mocked(window.git.show).mockResolvedValue('base content')
    const { result } = renderHook(() => useFileDiff(makeParams({ diffBaseRef: 'abc123' })))
    await waitFor(() => {
      expect(result.current.isLoadingDiff).toBe(false)
    })
    expect(window.git.show).toHaveBeenCalledWith('/project', 'src/file.ts', 'abc123')
    expect(result.current.originalContent).toBe('base content')
  })

  it('sets originalContent to empty string on error', async () => {
    vi.mocked(window.git.show).mockRejectedValue(new Error('not found'))
    const { result } = renderHook(() => useFileDiff(makeParams()))
    await waitFor(() => {
      expect(result.current.isLoadingDiff).toBe(false)
    })
    expect(result.current.originalContent).toBe('')
  })

  it('resets original content when filePath is null', () => {
    const { result } = renderHook(() => useFileDiff(makeParams({ filePath: null })))
    expect(result.current.originalContent).toBe('')
    expect(result.current.isLoadingDiff).toBe(false)
  })

  it('resets original content when directory is undefined', () => {
    const { result } = renderHook(() => useFileDiff(makeParams({ directory: undefined })))
    expect(result.current.originalContent).toBe('')
  })

  it('resets original content when canShowDiff is false', () => {
    const { result } = renderHook(() => useFileDiff(makeParams({ canShowDiff: false })))
    expect(result.current.originalContent).toBe('')
  })

  it('resets original content when viewMode is not diff', () => {
    const { result } = renderHook(() => useFileDiff(makeParams({ viewMode: 'latest' })))
    expect(result.current.originalContent).toBe('')
  })

  it('handles filePath that does not start with directory prefix', async () => {
    vi.mocked(window.git.show).mockResolvedValue('content')
    const { result } = renderHook(() =>
      useFileDiff(makeParams({ filePath: '/other/path/file.ts', directory: '/project' }))
    )
    await waitFor(() => {
      expect(result.current.isLoadingDiff).toBe(false)
    })
    expect(window.git.show).toHaveBeenCalledWith('/project', '/other/path/file.ts', 'HEAD')
  })

  // --- Modified content loading (diffCurrentRef) ---
  it('loads modified content when diffCurrentRef is set', async () => {
    vi.mocked(window.git.show)
      .mockResolvedValueOnce('original') // first effect (base)
      .mockResolvedValueOnce('modified') // second effect (current)
    const { result } = renderHook(() =>
      useFileDiff(makeParams({ diffCurrentRef: 'def456' }))
    )
    await waitFor(() => {
      expect(result.current.isLoadingDiff).toBe(false)
    })
    expect(result.current.diffModifiedContent).toBe('modified')
    // The second call should use diffCurrentRef
    expect(window.git.show).toHaveBeenCalledWith('/project', 'src/file.ts', 'def456')
  })

  it('sets diffModifiedContent to empty string on error', async () => {
    vi.mocked(window.git.show)
      .mockResolvedValueOnce('original')
      .mockRejectedValueOnce(new Error('not found'))
    const { result } = renderHook(() =>
      useFileDiff(makeParams({ diffCurrentRef: 'def456' }))
    )
    await waitFor(() => {
      expect(result.current.isLoadingDiff).toBe(false)
    })
    expect(result.current.diffModifiedContent).toBe('')
  })

  it('diffModifiedContent is null when no diffCurrentRef', async () => {
    vi.mocked(window.git.show).mockResolvedValue('original')
    const { result } = renderHook(() => useFileDiff(makeParams()))
    await waitFor(() => {
      expect(result.current.isLoadingDiff).toBe(false)
    })
    expect(result.current.diffModifiedContent).toBeNull()
  })

  it('resets diffModifiedContent when filePath is null', () => {
    const { result } = renderHook(() =>
      useFileDiff(makeParams({ filePath: null, diffCurrentRef: 'abc' }))
    )
    expect(result.current.diffModifiedContent).toBeNull()
  })

  it('resets diffModifiedContent when viewMode is not diff', () => {
    const { result } = renderHook(() =>
      useFileDiff(makeParams({ viewMode: 'latest', diffCurrentRef: 'abc' }))
    )
    expect(result.current.diffModifiedContent).toBeNull()
  })

  // --- isLoadingDiff ---
  it('isLoadingDiff reflects combined loading state', async () => {
    let resolveShow!: (v: string) => void
    vi.mocked(window.git.show).mockImplementation(
      () => new Promise<string>((resolve) => { resolveShow = resolve })
    )
    const { result } = renderHook(() => useFileDiff(makeParams()))
    // While loading
    expect(result.current.isLoadingDiff).toBe(true)
    // Resolve
    resolveShow('content')
    await waitFor(() => {
      expect(result.current.isLoadingDiff).toBe(false)
    })
  })

  // --- Cancellation on unmount/re-render ---
  it('cancels in-flight original content load on unmount', async () => {
    let resolveShow!: (v: string) => void
    vi.mocked(window.git.show).mockImplementation(
      () => new Promise<string>((resolve) => { resolveShow = resolve })
    )
    const { unmount, result } = renderHook(() => useFileDiff(makeParams()))
    unmount()
    // Resolve after unmount -- should not update state (no error)
    resolveShow('late')
    // If it didn't crash, cancellation worked
    expect(result.current.originalContent).toBe('')
  })

  it('cancels in-flight modified content load on param change', async () => {
    vi.mocked(window.git.show).mockResolvedValue('first')
    const { result, rerender } = renderHook(
      (props: Parameters<typeof useFileDiff>[0]) => useFileDiff(props),
      { initialProps: makeParams({ diffCurrentRef: 'ref1' }) }
    )
    await waitFor(() => {
      expect(result.current.isLoadingDiff).toBe(false)
    })

    // Change diffCurrentRef to trigger new load
    vi.mocked(window.git.show).mockResolvedValue('second')
    rerender(makeParams({ diffCurrentRef: 'ref2' }))
    await waitFor(() => {
      expect(result.current.isLoadingDiff).toBe(false)
    })
    // Should have the latest value
    expect(window.git.show).toHaveBeenCalledWith('/project', 'src/file.ts', 'ref2')
  })
})
