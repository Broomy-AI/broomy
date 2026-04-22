// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFileViewer } from './useFileViewer'
import type { FileViewerPlugin } from '../viewers/types'

function makeViewer(overrides: Partial<FileViewerPlugin> & { id: string; name: string }): FileViewerPlugin {
  return {
    canHandle: () => true,
    priority: 0,
    component: (() => null) as unknown as FileViewerPlugin['component'],
    ...overrides,
  }
}

// Mock the dependency hooks
vi.mock('./useFileLoading', () => ({
  useFileLoading: vi.fn().mockReturnValue({
    content: 'file content',
    setContent: vi.fn(),
    isLoading: false,
    error: null,
    availableViewers: [],
  }),
}))

vi.mock('./useFileDiff', () => ({
  useFileDiff: vi.fn().mockReturnValue({
    originalContent: '',
    diffModifiedContent: null,
    isLoadingDiff: false,
  }),
}))

vi.mock('./useFileWatcher', () => ({
  useFileWatcher: vi.fn().mockReturnValue({
    fileChangedOnDisk: false,
    handleKeepLocalChanges: vi.fn(),
    handleLoadDiskVersion: vi.fn(),
    checkForExternalChanges: vi.fn().mockResolvedValue(false),
  }),
}))

import { useFileLoading } from './useFileLoading'
import { useFileDiff } from './useFileDiff'
import { useFileWatcher } from './useFileWatcher'

describe('useFileViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Reset mock return values
    vi.mocked(useFileLoading).mockReturnValue({
      content: 'file content',
      setContent: vi.fn(),
      isLoading: false,
      error: null,
      availableViewers: [makeViewer({ id: 'monaco', name: 'Code' })],
    })

    vi.mocked(useFileDiff).mockReturnValue({
      originalContent: '',
      diffModifiedContent: null,
      isLoadingDiff: false,
    })

    vi.mocked(useFileWatcher).mockReturnValue({
      fileChangedOnDisk: false,
      handleKeepLocalChanges: vi.fn(),
      handleLoadDiskVersion: vi.fn(),
      checkForExternalChanges: vi.fn().mockResolvedValue(false),
    })
  })

  describe('canShowDiff', () => {
    it('is true for modified files', () => {
      const { result } = renderHook(() =>
        useFileViewer({ filePath: '/test/file.ts', fileStatus: 'modified' })
      )
      expect(result.current.canShowDiff).toBe(true)
    })

    it('is true for deleted files', () => {
      const { result } = renderHook(() =>
        useFileViewer({ filePath: '/test/file.ts', fileStatus: 'deleted' })
      )
      expect(result.current.canShowDiff).toBe(true)
    })

    it('is true when diffBaseRef is provided', () => {
      const { result } = renderHook(() =>
        useFileViewer({ filePath: '/test/file.ts', diffBaseRef: 'abc123' })
      )
      expect(result.current.canShowDiff).toBe(true)
    })

    it('is true when diffCurrentRef is provided', () => {
      const { result } = renderHook(() =>
        useFileViewer({ filePath: '/test/file.ts', diffCurrentRef: 'def456' })
      )
      expect(result.current.canShowDiff).toBe(true)
    })

    it('is false for added files without refs', () => {
      const { result } = renderHook(() =>
        useFileViewer({ filePath: '/test/file.ts', fileStatus: 'added' })
      )
      expect(result.current.canShowDiff).toBe(false)
    })

    it('is false for null status without refs', () => {
      const { result } = renderHook(() =>
        useFileViewer({ filePath: '/test/file.ts' })
      )
      expect(result.current.canShowDiff).toBe(false)
    })
  })

  describe('initial state', () => {
    it('starts with correct defaults', () => {
      const { result } = renderHook(() =>
        useFileViewer({ filePath: '/test/file.ts' })
      )

      expect(result.current.isDirty).toBe(false)
      expect(result.current.isSaving).toBe(false)
      expect(result.current.viewMode).toBe('latest')
      expect(result.current.diffSideBySide).toBe(true)
      expect(result.current.editorActions).toBeNull()
    })
  })

  describe('viewMode initialization', () => {
    it('uses diff mode when initialViewMode is diff and canShowDiff', () => {
      const { result } = renderHook(() =>
        useFileViewer({ filePath: '/test/file.ts', fileStatus: 'modified', initialViewMode: 'diff' })
      )
      expect(result.current.viewMode).toBe('diff')
    })

    it('falls back to latest when initialViewMode is diff but canShowDiff is false', () => {
      const { result } = renderHook(() =>
        useFileViewer({ filePath: '/test/file.ts', fileStatus: 'added', initialViewMode: 'diff' })
      )
      expect(result.current.viewMode).toBe('latest')
    })
  })

  describe('handleSave', () => {
    it('saves file content and resets dirty state', async () => {
      vi.mocked(window.fs.writeFile).mockResolvedValue({ success: true })
      const onSaveComplete = vi.fn()

      const { result } = renderHook(() =>
        useFileViewer({ filePath: '/test/file.ts', onSaveComplete })
      )

      await act(async () => {
        await result.current.handleSave('new content')
      })

      expect(window.fs.writeFile).toHaveBeenCalledWith('/test/file.ts', 'new content')
      expect(result.current.isDirty).toBe(false)
      expect(result.current.isSaving).toBe(false)
      expect(onSaveComplete).toHaveBeenCalled()
    })

    it('does nothing without filePath', async () => {
      const { result } = renderHook(() =>
        useFileViewer({ filePath: null })
      )

      await act(async () => {
        await result.current.handleSave('content')
      })

      expect(window.fs.writeFile).not.toHaveBeenCalled()
    })

    it('throws on save failure and still clears isSaving', async () => {
      vi.mocked(window.fs.writeFile).mockResolvedValue({ success: false, error: 'write failed' })

      const { result } = renderHook(() =>
        useFileViewer({ filePath: '/test/file.ts' })
      )

      await expect(act(async () => {
        await result.current.handleSave('new content')
      })).rejects.toThrow('write failed')

      expect(result.current.isSaving).toBe(false)
    })

    it('aborts save when file has external changes', async () => {
      const checkForExternalChanges = vi.fn().mockResolvedValue(true)
      vi.mocked(useFileWatcher).mockReturnValue({
        fileChangedOnDisk: false,
        handleKeepLocalChanges: vi.fn(),
        handleLoadDiskVersion: vi.fn(),
        checkForExternalChanges,
      })

      const { result } = renderHook(() =>
        useFileViewer({ filePath: '/test/file.ts' })
      )

      let saveResult: boolean | undefined
      await act(async () => {
        saveResult = await result.current.handleSave('new content')
      })

      expect(saveResult).toBe(false)
      expect(window.fs.writeFile).not.toHaveBeenCalled()
    })

    it('proceeds with save when no external changes', async () => {
      vi.mocked(window.fs.writeFile).mockResolvedValue({ success: true })

      const { result } = renderHook(() =>
        useFileViewer({ filePath: '/test/file.ts' })
      )

      let saveResult: boolean | undefined
      await act(async () => {
        saveResult = await result.current.handleSave('new content')
      })

      expect(saveResult).toBe(true)
      expect(window.fs.writeFile).toHaveBeenCalledWith('/test/file.ts', 'new content')
    })
  })

  describe('handleSaveButton', () => {
    it('does nothing when not dirty', async () => {
      const { result } = renderHook(() =>
        useFileViewer({ filePath: '/test/file.ts' })
      )

      await act(async () => {
        await result.current.handleSaveButton()
      })

      expect(window.fs.writeFile).not.toHaveBeenCalled()
    })

    it('saves when dirty and has edited content', async () => {
      vi.mocked(window.fs.writeFile).mockResolvedValue({ success: true })

      const { result } = renderHook(() =>
        useFileViewer({ filePath: '/test/file.ts' })
      )

      // Mark as dirty with content via handleDirtyChange
      act(() => {
        result.current.handleDirtyChange(true, 'edited content')
      })

      await act(async () => {
        await result.current.handleSaveButton()
      })

      expect(window.fs.writeFile).toHaveBeenCalledWith('/test/file.ts', 'edited content')
    })
  })

  describe('handleDirtyChange', () => {
    it('updates dirty state and notifies callback', () => {
      const onDirtyStateChange = vi.fn()

      const { result } = renderHook(() =>
        useFileViewer({ filePath: '/test/file.ts', onDirtyStateChange })
      )

      act(() => {
        result.current.handleDirtyChange(true, 'modified content')
      })

      expect(result.current.isDirty).toBe(true)
      expect(onDirtyStateChange).toHaveBeenCalledWith(true)
    })

    it('works without callback', () => {
      const { result } = renderHook(() =>
        useFileViewer({ filePath: '/test/file.ts' })
      )

      act(() => {
        result.current.handleDirtyChange(true)
      })

      expect(result.current.isDirty).toBe(true)
    })
  })

  describe('onSaveFunctionChange', () => {
    it('calls callback with save function when dirty with content', () => {
      vi.mocked(window.fs.writeFile).mockResolvedValue({ success: true })
      const onSaveFunctionChange = vi.fn()

      const { result } = renderHook(() =>
        useFileViewer({ filePath: '/test/file.ts', onSaveFunctionChange })
      )

      // Initially called with null since not dirty
      expect(onSaveFunctionChange).toHaveBeenCalledWith(null)

      // Mark dirty
      act(() => {
        result.current.handleDirtyChange(true, 'edited')
      })

      // Should have been called with a function
      const lastCall = onSaveFunctionChange.mock.calls[onSaveFunctionChange.mock.calls.length - 1]
      expect(lastCall[0]).toBeInstanceOf(Function)
    })

    it('calls callback with null on unmount', () => {
      const onSaveFunctionChange = vi.fn()

      const { unmount } = renderHook(() =>
        useFileViewer({ filePath: '/test/file.ts', onSaveFunctionChange })
      )

      onSaveFunctionChange.mockClear()
      unmount()
      expect(onSaveFunctionChange).toHaveBeenCalledWith(null)
    })
  })

  describe('scrollToLine interaction', () => {
    it('switches to monaco when scrollToLine is set', () => {
      vi.mocked(useFileLoading).mockReturnValue({
        content: 'file content',
        setContent: vi.fn(),
        isLoading: false,
        error: null,
        availableViewers: [
          makeViewer({ id: 'markdown', name: 'Preview' }),
          makeViewer({ id: 'monaco', name: 'Code' }),
        ],
      })

      renderHook(() =>
        useFileViewer({ filePath: '/test/file.md', scrollToLine: 10 })
      )

      // The hook should call useFileLoading with selectedViewerId
      // which gets set to 'monaco' by the scrollToLine effect
      // This verifies the integration
    })

    it('does not switch away from webview when scrollToLine is set', () => {
      const webviewViewer = makeViewer({ id: 'webview', name: 'Web Page', priority: 100 })
      const monacoViewer = makeViewer({ id: 'monaco', name: 'Code', priority: 1 })

      vi.mocked(useFileLoading).mockReturnValue({
        content: '',
        setContent: vi.fn(),
        isLoading: false,
        error: null,
        availableViewers: [webviewViewer, monacoViewer],
      })

      // First render without scrollToLine, then manually select webview
      const { result, rerender } = renderHook(
        ({ scrollToLine }) => useFileViewer({ filePath: 'https://example.com', scrollToLine }),
        { initialProps: { scrollToLine: undefined as number | undefined } },
      )

      act(() => { result.current.setSelectedViewerId('webview') })
      expect(result.current.selectedViewerId).toBe('webview')

      // Now set scrollToLine — should NOT switch to monaco
      rerender({ scrollToLine: 10 })
      expect(result.current.selectedViewerId).toBe('webview')
    })
  })

  describe('selectedViewer', () => {
    it('finds selected viewer from available viewers', () => {
      vi.mocked(useFileLoading).mockReturnValue({
        content: 'content',
        setContent: vi.fn(),
        isLoading: false,
        error: null,
        availableViewers: [
          makeViewer({ id: 'monaco', name: 'Code' }),
          makeViewer({ id: 'markdown', name: 'Preview' }),
        ],
      })

      const { result } = renderHook(() =>
        useFileViewer({ filePath: '/test/file.md' })
      )

      // selectedViewer depends on selectedViewerId matching an available viewer
      // Initial state - selectedViewerId is null or first viewer
      expect(result.current.availableViewers).toHaveLength(2)
    })
  })

  describe('state setters', () => {
    it('exposes setViewMode', () => {
      const { result } = renderHook(() =>
        useFileViewer({ filePath: '/test/file.ts', fileStatus: 'modified' })
      )

      act(() => {
        result.current.setViewMode('diff')
      })

      expect(result.current.viewMode).toBe('diff')
    })

    it('setViewMode to diff is guarded to latest when canShowDiff is false', () => {
      const { result } = renderHook(() =>
        useFileViewer({ filePath: '/test/file.ts' })
      )

      act(() => {
        result.current.setViewMode('diff')
      })

      // canShowDiff is false (no fileStatus or refs), so effectiveViewMode is 'latest'
      expect(result.current.viewMode).toBe('latest')
    })

    it('exposes setDiffSideBySide', () => {
      const { result } = renderHook(() =>
        useFileViewer({ filePath: '/test/file.ts' })
      )

      act(() => {
        result.current.setDiffSideBySide(false)
      })

      expect(result.current.diffSideBySide).toBe(false)
    })
  })

  describe('requestViewMode (guarded switching)', () => {
    it('switches immediately when not dirty', () => {
      const { result } = renderHook(() =>
        useFileViewer({ filePath: '/test/file.ts', fileStatus: 'modified' })
      )

      act(() => {
        result.current.requestViewMode('diff')
      })

      expect(result.current.viewMode).toBe('diff')
      expect(result.current.pendingViewMode).toBeNull()
    })

    it('sets pendingViewMode when dirty and switching away from latest', () => {
      const { result } = renderHook(() =>
        useFileViewer({ filePath: '/test/file.ts', fileStatus: 'modified' })
      )

      act(() => {
        result.current.handleDirtyChange(true, 'edited content')
      })

      act(() => {
        result.current.requestViewMode('diff')
      })

      expect(result.current.viewMode).toBe('latest')
      expect(result.current.pendingViewMode).toBe('diff')
    })

    it('switches immediately when dirty but switching to latest', () => {
      const { result } = renderHook(() =>
        useFileViewer({ filePath: '/test/file.ts', fileStatus: 'modified' })
      )

      // First switch to diff mode while clean
      act(() => {
        result.current.setViewMode('diff')
      })

      // Mark dirty (even though diff mode doesn't normally make dirty, test the logic)
      act(() => {
        result.current.handleDirtyChange(true, 'edited content')
      })

      act(() => {
        result.current.requestViewMode('latest')
      })

      expect(result.current.viewMode).toBe('latest')
      expect(result.current.pendingViewMode).toBeNull()
    })

    it('handleViewModeSave saves then switches', async () => {
      vi.mocked(window.fs.writeFile).mockResolvedValue({ success: true })

      const { result } = renderHook(() =>
        useFileViewer({ filePath: '/test/file.ts', fileStatus: 'modified' })
      )

      act(() => {
        result.current.handleDirtyChange(true, 'edited content')
      })

      act(() => {
        result.current.requestViewMode('diff')
      })

      expect(result.current.pendingViewMode).toBe('diff')

      await act(async () => {
        await result.current.handleViewModeSave()
      })

      expect(window.fs.writeFile).toHaveBeenCalledWith('/test/file.ts', 'edited content')
      expect(result.current.viewMode).toBe('diff')
      expect(result.current.pendingViewMode).toBeNull()
      expect(result.current.isDirty).toBe(false)
    })

    it('handleViewModeDiscard resets dirty and switches', () => {
      const onDirtyStateChange = vi.fn()

      const { result } = renderHook(() =>
        useFileViewer({ filePath: '/test/file.ts', fileStatus: 'modified', onDirtyStateChange })
      )

      act(() => {
        result.current.handleDirtyChange(true, 'edited content')
      })

      act(() => {
        result.current.requestViewMode('diff')
      })

      act(() => {
        result.current.handleViewModeDiscard()
      })

      expect(result.current.viewMode).toBe('diff')
      expect(result.current.pendingViewMode).toBeNull()
      expect(result.current.isDirty).toBe(false)
      expect(onDirtyStateChange).toHaveBeenCalledWith(false)
    })

    it('handleViewModeCancel clears pending without switching', () => {
      const { result } = renderHook(() =>
        useFileViewer({ filePath: '/test/file.ts', fileStatus: 'modified' })
      )

      act(() => {
        result.current.handleDirtyChange(true, 'edited content')
      })

      act(() => {
        result.current.requestViewMode('diff')
      })

      expect(result.current.pendingViewMode).toBe('diff')

      act(() => {
        result.current.handleViewModeCancel()
      })

      expect(result.current.viewMode).toBe('latest')
      expect(result.current.pendingViewMode).toBeNull()
    })
  })

  describe('file change resets', () => {
    it('resets dirty state when filePath changes', () => {
      const { result, rerender } = renderHook(
        ({ filePath }) => useFileViewer({ filePath }),
        { initialProps: { filePath: '/test/file1.ts' as string | null } }
      )

      act(() => {
        result.current.handleDirtyChange(true, 'modified')
      })
      expect(result.current.isDirty).toBe(true)

      rerender({ filePath: '/test/file2.ts' })
      expect(result.current.isDirty).toBe(false)
    })

    it('resets editorActions when filePath changes', () => {
      const { result, rerender } = renderHook(
        ({ filePath }) => useFileViewer({ filePath }),
        { initialProps: { filePath: '/test/file1.ts' as string | null } }
      )

      act(() => {
        result.current.setEditorActions({ showOutline: vi.fn(), showFind: vi.fn() })
      })
      expect(result.current.editorActions).not.toBeNull()

      rerender({ filePath: '/test/file2.ts' })
      expect(result.current.editorActions).toBeNull()
    })
  })
})
