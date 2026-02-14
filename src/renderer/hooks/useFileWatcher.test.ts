// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFileWatcher } from './useFileWatcher'

describe('useFileWatcher', () => {
  let onChangeCallback: (() => void) | null = null
  const mockRemoveListener = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    onChangeCallback = null

    // Capture the onChange callback when registered
    vi.mocked(window.fs.onChange).mockImplementation((_watcherId, callback) => {
      onChangeCallback = () => callback({ eventType: 'change', filename: 'file.ts' })
      return mockRemoveListener
    })
    vi.mocked(window.fs.watch).mockResolvedValue({ success: true })
    vi.mocked(window.fs.unwatch).mockResolvedValue({ success: true })
    vi.mocked(window.fs.readFile).mockResolvedValue('original content')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const defaultParams = {
    filePath: '/test/file.ts',
    content: 'original content',
    setContent: vi.fn(),
    isDirty: false,
    onDirtyStateChange: vi.fn(),
    setIsDirty: vi.fn(),
  }

  describe('watcher setup', () => {
    it('sets up file watcher on mount', () => {
      renderHook(() => useFileWatcher(defaultParams))

      expect(window.fs.watch).toHaveBeenCalledWith('fileviewer-/test/file.ts', '/test/file.ts')
      expect(window.fs.onChange).toHaveBeenCalledWith('fileviewer-/test/file.ts', expect.any(Function))
    })

    it('does not set up watcher without filePath', () => {
      renderHook(() => useFileWatcher({ ...defaultParams, filePath: null }))

      expect(window.fs.watch).not.toHaveBeenCalled()
      expect(window.fs.onChange).not.toHaveBeenCalled()
    })

    it('cleans up watcher on unmount', () => {
      const { unmount } = renderHook(() => useFileWatcher(defaultParams))

      unmount()

      expect(mockRemoveListener).toHaveBeenCalled()
      expect(window.fs.unwatch).toHaveBeenCalledWith('fileviewer-/test/file.ts')
    })

    it('resets fileChangedOnDisk when filePath changes', () => {
      const { result, rerender } = renderHook(
        ({ filePath }) => useFileWatcher({ ...defaultParams, filePath }),
        { initialProps: { filePath: '/test/file1.ts' as string | null } }
      )

      expect(result.current.fileChangedOnDisk).toBe(false)

      rerender({ filePath: '/test/file2.ts' })
      expect(result.current.fileChangedOnDisk).toBe(false)
    })
  })

  describe('file change detection', () => {
    it('updates content when file changes on disk and not dirty', async () => {
      const setContent = vi.fn()
      renderHook(() => useFileWatcher({ ...defaultParams, setContent }))

      vi.mocked(window.fs.readFile).mockResolvedValue('new content')

      // Trigger file change
      onChangeCallback!()

      // Wait for debounce (300ms)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300)
      })

      expect(window.fs.readFile).toHaveBeenCalledWith('/test/file.ts')
      expect(setContent).toHaveBeenCalledWith('new content')
    })

    it('sets fileChangedOnDisk when dirty and file changes', async () => {
      const { result } = renderHook(() =>
        useFileWatcher({ ...defaultParams, isDirty: true })
      )

      vi.mocked(window.fs.readFile).mockResolvedValue('different content')

      onChangeCallback!()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(300)
      })

      expect(result.current.fileChangedOnDisk).toBe(true)
    })

    it('ignores change if content is the same', async () => {
      const setContent = vi.fn()
      renderHook(() => useFileWatcher({ ...defaultParams, setContent }))

      // Return same content as current
      vi.mocked(window.fs.readFile).mockResolvedValue('original content')

      onChangeCallback!()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(300)
      })

      expect(setContent).not.toHaveBeenCalled()
    })

    it('debounces multiple rapid changes', async () => {
      renderHook(() => useFileWatcher(defaultParams))

      vi.mocked(window.fs.readFile).mockResolvedValue('new content')

      // Trigger multiple changes rapidly
      onChangeCallback!()
      await vi.advanceTimersByTimeAsync(100)
      onChangeCallback!()
      await vi.advanceTimersByTimeAsync(100)
      onChangeCallback!()

      // Wait for full debounce
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300)
      })

      // Should only read once (the last debounced call)
      expect(window.fs.readFile).toHaveBeenCalledTimes(1)
    })

    it('handles read errors gracefully', async () => {
      renderHook(() => useFileWatcher(defaultParams))

      vi.mocked(window.fs.readFile).mockRejectedValue(new Error('file deleted'))

      onChangeCallback!()

      // Should not throw
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300)
      })
    })
  })

  describe('handleKeepLocalChanges', () => {
    it('dismisses the file-changed-on-disk notification', async () => {
      const { result } = renderHook(() =>
        useFileWatcher({ ...defaultParams, isDirty: true })
      )

      // Trigger file change while dirty
      vi.mocked(window.fs.readFile).mockResolvedValue('different content')
      onChangeCallback!()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300)
      })
      expect(result.current.fileChangedOnDisk).toBe(true)

      // Keep local changes
      act(() => {
        result.current.handleKeepLocalChanges()
      })

      expect(result.current.fileChangedOnDisk).toBe(false)
    })
  })

  describe('handleLoadDiskVersion', () => {
    it('loads disk version and resets dirty state', async () => {
      const setContent = vi.fn()
      const setIsDirty = vi.fn()
      const onDirtyStateChange = vi.fn()

      const { result } = renderHook(() =>
        useFileWatcher({
          ...defaultParams,
          setContent,
          setIsDirty,
          onDirtyStateChange,
          isDirty: true,
        })
      )

      vi.mocked(window.fs.readFile).mockResolvedValue('disk version content')

      await act(async () => {
        await result.current.handleLoadDiskVersion()
      })

      expect(window.fs.readFile).toHaveBeenCalledWith('/test/file.ts')
      expect(setContent).toHaveBeenCalledWith('disk version content')
      expect(setIsDirty).toHaveBeenCalledWith(false)
      expect(onDirtyStateChange).toHaveBeenCalledWith(false)
      expect(result.current.fileChangedOnDisk).toBe(false)
    })

    it('does nothing without filePath', async () => {
      const { result } = renderHook(() =>
        useFileWatcher({ ...defaultParams, filePath: null })
      )

      await act(async () => {
        await result.current.handleLoadDiskVersion()
      })

      // readFile should not have been called for loading (only for watcher)
      expect(window.fs.readFile).not.toHaveBeenCalled()
    })

    it('handles errors gracefully', async () => {
      vi.mocked(window.fs.readFile).mockRejectedValue(new Error('read fail'))

      const { result } = renderHook(() => useFileWatcher(defaultParams))

      await act(async () => {
        await result.current.handleLoadDiskVersion()
      })

      // Should clear fileChangedOnDisk even on error
      expect(result.current.fileChangedOnDisk).toBe(false)
    })
  })
})
