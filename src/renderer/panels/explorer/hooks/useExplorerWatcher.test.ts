// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, cleanup } from '@testing-library/react'
import '../../../../test/react-setup'
import { useExplorerWatcher } from './useExplorerWatcher'

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('useExplorerWatcher', () => {
  it('sets up a recursive watcher for the directory', () => {
    const refreshTree = vi.fn().mockResolvedValue(undefined)
    renderHook(() => useExplorerWatcher('/repo', refreshTree))

    expect(window.fs.watch).toHaveBeenCalledWith('explorer-/repo', '/repo', { recursive: true })
    expect(window.fs.onChange).toHaveBeenCalledWith('explorer-/repo', expect.any(Function))
  })

  it('does not set up a watcher when directory is undefined', () => {
    const refreshTree = vi.fn().mockResolvedValue(undefined)
    renderHook(() => useExplorerWatcher(undefined, refreshTree))

    expect(window.fs.watch).not.toHaveBeenCalled()
  })

  it('debounces refreshTree calls on file changes', () => {
    let changeHandler: (() => void) | undefined
    vi.mocked(window.fs.onChange).mockImplementation((_id, cb) => {
      changeHandler = cb as () => void
      return () => {}
    })

    const refreshTree = vi.fn().mockResolvedValue(undefined)
    renderHook(() => useExplorerWatcher('/repo', refreshTree))

    // Trigger multiple rapid changes
    changeHandler!()
    changeHandler!()
    changeHandler!()

    // Not called yet — debounced
    expect(refreshTree).not.toHaveBeenCalled()

    // Advance past debounce
    vi.advanceTimersByTime(500)
    expect(refreshTree).toHaveBeenCalledTimes(1)
  })

  it('cleans up watcher on unmount', () => {
    const removeListener = vi.fn()
    vi.mocked(window.fs.onChange).mockReturnValue(removeListener)

    const refreshTree = vi.fn().mockResolvedValue(undefined)
    const { unmount } = renderHook(() => useExplorerWatcher('/repo', refreshTree))

    unmount()

    expect(removeListener).toHaveBeenCalled()
    expect(window.fs.unwatch).toHaveBeenCalledWith('explorer-/repo')
  })

  it('switches watcher when directory changes', () => {
    const removeListener = vi.fn()
    vi.mocked(window.fs.onChange).mockReturnValue(removeListener)

    const refreshTree = vi.fn().mockResolvedValue(undefined)
    const { rerender } = renderHook(
      ({ dir }) => useExplorerWatcher(dir, refreshTree),
      { initialProps: { dir: '/repo-a' } },
    )

    expect(window.fs.watch).toHaveBeenCalledWith('explorer-/repo-a', '/repo-a', { recursive: true })

    rerender({ dir: '/repo-b' })

    // Old watcher cleaned up
    expect(removeListener).toHaveBeenCalled()
    expect(window.fs.unwatch).toHaveBeenCalledWith('explorer-/repo-a')
    // New watcher started
    expect(window.fs.watch).toHaveBeenCalledWith('explorer-/repo-b', '/repo-b', { recursive: true })
  })
})
