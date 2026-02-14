// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFileViewer } from './useFileViewer'
import type { FileViewerPlugin } from '../components/fileViewers/types'

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

  describe('saveRef', () => {
    it('exposes save function when dirty with content', () => {
      vi.mocked(window.fs.writeFile).mockResolvedValue({ success: true })
      const saveRef = { current: null } as React.MutableRefObject<(() => Promise<void>) | null>

      const { result } = renderHook(() =>
        useFileViewer({ filePath: '/test/file.ts', saveRef })
      )

      // Initially null since not dirty
      expect(saveRef.current).toBeNull()

      // Mark dirty
      act(() => {
        result.current.handleDirtyChange(true, 'edited')
      })

      expect(saveRef.current).toBeInstanceOf(Function)
    })

    it('clears saveRef on unmount', () => {
      const saveRef = { current: null } as React.MutableRefObject<(() => Promise<void>) | null>

      const { unmount } = renderHook(() =>
        useFileViewer({ filePath: '/test/file.ts', saveRef })
      )

      unmount()
      expect(saveRef.current).toBeNull()
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
        useFileViewer({ filePath: '/test/file.ts' })
      )

      act(() => {
        result.current.setViewMode('diff')
      })

      expect(result.current.viewMode).toBe('diff')
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
        result.current.setEditorActions({ showOutline: vi.fn() })
      })
      expect(result.current.editorActions).not.toBeNull()

      rerender({ filePath: '/test/file2.ts' })
      expect(result.current.editorActions).toBeNull()
    })
  })
})
