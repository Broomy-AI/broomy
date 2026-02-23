// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFileTree, updateTreeNode, findNode, navigateTreeItem } from './useFileTree'
import type { GitFileStatus } from '../../preload/index'

describe('useFileTree', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const defaultParams = {
    directory: '/test/project',
    onFileSelect: vi.fn(),
    gitStatus: [] as GitFileStatus[],
  }

  describe('initial state', () => {
    it('starts with empty tree and no expanded paths', () => {
      const { result } = renderHook(() => useFileTree(defaultParams))
      expect(result.current.tree).toEqual([])
      expect(result.current.expandedPaths.size).toBe(0)
      expect(result.current.isLoading).toBe(false)
      expect(result.current.inlineInput).toBeNull()
      expect(result.current.inlineInputValue).toBe('')
    })
  })

  describe('loadDirectory', () => {
    it('loads entries from window.fs.readDir', async () => {
      vi.mocked(window.fs.readDir).mockResolvedValue([
        { name: 'src', isDirectory: true, path: '/test/project/src' },
        { name: 'readme.md', isDirectory: false, path: '/test/project/readme.md' },
      ])

      const { result } = renderHook(() => useFileTree(defaultParams))
      let entries: unknown[]
      await act(async () => {
        entries = await result.current.loadDirectory('/test/project')
      })

      expect(entries!).toEqual([
        { name: 'src', isDirectory: true, path: '/test/project/src', isExpanded: false },
        { name: 'readme.md', isDirectory: false, path: '/test/project/readme.md', isExpanded: false },
      ])
    })

    it('returns empty array on error', async () => {
      vi.mocked(window.fs.readDir).mockRejectedValue(new Error('read fail'))

      const { result } = renderHook(() => useFileTree(defaultParams))
      let entries: unknown[]
      await act(async () => {
        entries = await result.current.loadDirectory('/bad/path')
      })

      expect(entries!).toEqual([])
    })
  })

  describe('toggleExpand', () => {
    it('does nothing for non-directory nodes', async () => {
      const { result } = renderHook(() => useFileTree(defaultParams))

      const fileNode = { name: 'file.ts', isDirectory: false, path: '/test/project/file.ts' }
      await act(async () => {
        await result.current.toggleExpand(fileNode)
      })

      expect(result.current.expandedPaths.size).toBe(0)
    })

    it('expands a directory and loads children', async () => {
      vi.mocked(window.fs.readDir).mockResolvedValue([
        { name: 'child.ts', isDirectory: false, path: '/test/project/src/child.ts' },
      ])

      const { result } = renderHook(() => useFileTree(defaultParams))

      const dirNode = { name: 'src', isDirectory: true, path: '/test/project/src' }
      await act(async () => {
        await result.current.toggleExpand(dirNode)
      })

      expect(result.current.expandedPaths.has('/test/project/src')).toBe(true)
      expect(window.fs.readDir).toHaveBeenCalledWith('/test/project/src')
    })

    it('collapses an expanded directory', async () => {
      vi.mocked(window.fs.readDir).mockResolvedValue([])

      const { result } = renderHook(() => useFileTree(defaultParams))

      const dirNode = { name: 'src', isDirectory: true, path: '/test/project/src' }

      // Expand first
      await act(async () => {
        await result.current.toggleExpand(dirNode)
      })
      expect(result.current.expandedPaths.has('/test/project/src')).toBe(true)

      // Collapse
      await act(async () => {
        await result.current.toggleExpand(dirNode)
      })
      expect(result.current.expandedPaths.has('/test/project/src')).toBe(false)
    })

    it('does not reload children if already loaded', async () => {
      vi.mocked(window.fs.readDir).mockResolvedValue([
        { name: 'child.ts', isDirectory: false, path: '/test/project/src/child.ts' },
      ])

      const { result } = renderHook(() => useFileTree(defaultParams))

      const dirNode = {
        name: 'src',
        isDirectory: true,
        path: '/test/project/src',
        children: [{ name: 'child.ts', isDirectory: false, path: '/test/project/src/child.ts' }],
      }

      await act(async () => {
        await result.current.toggleExpand(dirNode)
      })

      // readDir should not have been called since children already exist
      expect(window.fs.readDir).not.toHaveBeenCalled()
      expect(result.current.expandedPaths.has('/test/project/src')).toBe(true)
    })
  })

  describe('handleFileClick', () => {
    it('calls onFileSelect for file nodes', () => {
      const onFileSelect = vi.fn()
      const { result } = renderHook(() =>
        useFileTree({ ...defaultParams, onFileSelect })
      )

      act(() => {
        result.current.handleFileClick({
          name: 'file.ts',
          isDirectory: false,
          path: '/test/project/file.ts',
        })
      })

      expect(onFileSelect).toHaveBeenCalledWith({
        filePath: '/test/project/file.ts',
        openInDiffMode: false,
      })
    })

    it('toggles expansion for directory nodes', async () => {
      vi.mocked(window.fs.readDir).mockResolvedValue([])

      const { result } = renderHook(() => useFileTree(defaultParams))

      // handleFileClick calls void toggleExpand() which is async internally
      await act(async () => {
        result.current.handleFileClick({
          name: 'src',
          isDirectory: true,
          path: '/test/project/src',
        })
        // Flush microtask queue so the async toggleExpand completes
        await Promise.resolve()
      })

      expect(result.current.expandedPaths.has('/test/project/src')).toBe(true)
    })

    it('does nothing if no onFileSelect for files', () => {
      const { result } = renderHook(() =>
        useFileTree({ directory: '/test', gitStatus: [] })
      )

      // Should not throw
      act(() => {
        result.current.handleFileClick({
          name: 'file.ts',
          isDirectory: false,
          path: '/test/file.ts',
        })
      })
    })
  })

  describe('getFileStatus', () => {
    it('returns git status for a file', () => {
      const gitStatus: GitFileStatus[] = [
        { path: 'src/file.ts', status: 'modified', staged: false, indexStatus: ' ', workingDirStatus: 'M' },
      ]

      const { result } = renderHook(() =>
        useFileTree({ ...defaultParams, gitStatus })
      )

      const status = result.current.getFileStatus('/test/project/src/file.ts')
      expect(status).toEqual({
        path: 'src/file.ts',
        status: 'modified',
        staged: false,
        indexStatus: ' ',
        workingDirStatus: 'M',
      })
    })

    it('returns undefined for untracked file', () => {
      const { result } = renderHook(() =>
        useFileTree({ ...defaultParams, gitStatus: [] })
      )

      const status = result.current.getFileStatus('/test/project/unknown.ts')
      expect(status).toBeUndefined()
    })

    it('handles file without directory prefix', () => {
      const gitStatus: GitFileStatus[] = [
        { path: 'file.ts', status: 'added', staged: true, indexStatus: 'A', workingDirStatus: ' ' },
      ]

      const { result } = renderHook(() =>
        useFileTree({ directory: undefined, gitStatus })
      )

      const status = result.current.getFileStatus('file.ts')
      expect(status).toEqual(gitStatus[0])
    })
  })

  describe('updateTreeNode', () => {
    it('updates matching node', () => {
      const nodes = [
        { name: 'file.ts', isDirectory: false, path: '/test/project/file.ts' },
        { name: 'other.ts', isDirectory: false, path: '/test/project/other.ts' },
      ]

      const updated = updateTreeNode(nodes, '/test/project/file.ts', {
        name: 'renamed.ts',
      })

      expect(updated[0].name).toBe('renamed.ts')
      expect(updated[1].name).toBe('other.ts')
    })

    it('updates nested nodes', () => {
      const nodes = [
        {
          name: 'src',
          isDirectory: true,
          path: '/test/project/src',
          children: [
            { name: 'file.ts', isDirectory: false, path: '/test/project/src/file.ts' },
          ],
        },
      ]

      const updated = updateTreeNode(nodes, '/test/project/src/file.ts', {
        name: 'updated.ts',
      })

      expect(updated[0].children![0].name).toBe('updated.ts')
    })

    it('leaves unmatched nodes unchanged', () => {
      const nodes = [
        { name: 'file.ts', isDirectory: false, path: '/test/project/file.ts' },
      ]

      const updated = updateTreeNode(nodes, '/nonexistent', { name: 'x' })
      expect(updated).toEqual(nodes)
    })
  })

  describe('findNode', () => {
    it('finds node at top level', () => {
      const nodes = [
        { name: 'file.ts', isDirectory: false, path: '/test/project/file.ts' },
      ]

      const found = findNode(nodes, '/test/project/file.ts')
      expect(found).toEqual(nodes[0])
    })

    it('finds nested node', () => {
      const childNode = { name: 'child.ts', isDirectory: false, path: '/test/project/src/child.ts' }
      const nodes = [
        {
          name: 'src',
          isDirectory: true,
          path: '/test/project/src',
          children: [childNode],
        },
      ]

      const found = findNode(nodes, '/test/project/src/child.ts')
      expect(found).toEqual(childNode)
    })

    it('returns null for nonexistent path', () => {
      const nodes = [
        { name: 'file.ts', isDirectory: false, path: '/test/project/file.ts' },
      ]

      const found = findNode(nodes, '/nonexistent')
      expect(found).toBeNull()
    })
  })

  describe('refreshTree', () => {
    it('does nothing without directory', async () => {
      const { result } = renderHook(() =>
        useFileTree({ gitStatus: [] })
      )

      await act(async () => {
        await result.current.refreshTree()
      })

      expect(window.fs.readDir).not.toHaveBeenCalled()
    })

    it('reloads directory contents', async () => {
      vi.mocked(window.fs.readDir).mockResolvedValue([
        { name: 'file.ts', isDirectory: false, path: '/test/project/file.ts' },
      ])

      const { result } = renderHook(() => useFileTree(defaultParams))

      await act(async () => {
        await result.current.refreshTree()
      })

      expect(window.fs.readDir).toHaveBeenCalledWith('/test/project')
      expect(result.current.tree).toHaveLength(1)
    })

    it('preserves expanded directory children', async () => {
      let callCount = 0
      vi.mocked(window.fs.readDir).mockImplementation((dirPath: string) => {
        callCount++
        if (dirPath === '/test/project') {
          return Promise.resolve([{ name: 'src', isDirectory: true, path: '/test/project/src' }])
        }
        if (dirPath === '/test/project/src') {
          return Promise.resolve([{ name: 'file.ts', isDirectory: false, path: '/test/project/src/file.ts' }])
        }
        return Promise.resolve([])
      })

      const { result } = renderHook(() => useFileTree(defaultParams))

      // Expand 'src' directory first
      await act(async () => {
        await result.current.toggleExpand({
          name: 'src',
          isDirectory: true,
          path: '/test/project/src',
        })
      })

      callCount = 0

      // Refresh should reload expanded directories
      await act(async () => {
        await result.current.refreshTree()
      })

      // Should have loaded root + expanded src
      expect(callCount).toBe(2)
    })
  })

  describe('handleContextMenu', () => {
    it('shows context menu with new file and folder options', async () => {
      vi.mocked(window.menu.popup).mockResolvedValue(null)

      const { result } = renderHook(() => useFileTree(defaultParams))
      const mockEvent = { preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as React.MouseEvent

      await act(async () => {
        await result.current.handleContextMenu(mockEvent, '/test/project')
      })

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockEvent.preventDefault).toHaveBeenCalled()
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockEvent.stopPropagation).toHaveBeenCalled()
      expect(window.menu.popup).toHaveBeenCalledWith([
        { id: 'new-file', label: 'New File' },
        { id: 'new-folder', label: 'New Folder' },
      ])
    })

    it('sets inline input for new file', async () => {
      vi.mocked(window.menu.popup).mockResolvedValue('new-file')

      const { result } = renderHook(() => useFileTree(defaultParams))
      const mockEvent = { preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as React.MouseEvent

      await act(async () => {
        await result.current.handleContextMenu(mockEvent, '/test/project')
      })

      expect(result.current.inlineInput).toEqual({
        parentPath: '/test/project',
        type: 'file',
      })
      expect(result.current.inlineInputValue).toBe('')
    })

    it('sets inline input for new folder', async () => {
      vi.mocked(window.menu.popup).mockResolvedValue('new-folder')

      const { result } = renderHook(() => useFileTree(defaultParams))
      const mockEvent = { preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as React.MouseEvent

      await act(async () => {
        await result.current.handleContextMenu(mockEvent, '/test/project')
      })

      expect(result.current.inlineInput).toEqual({
        parentPath: '/test/project',
        type: 'folder',
      })
    })

    it('expands subdirectory when context menu on non-root path', async () => {
      vi.mocked(window.menu.popup).mockResolvedValue('new-file')
      vi.mocked(window.fs.readDir).mockResolvedValue([])

      const { result } = renderHook(() => useFileTree(defaultParams))

      // Set up tree with a subdirectory
      act(() => {
        result.current.setTree([
          { name: 'src', isDirectory: true, path: '/test/project/src' },
        ])
      })

      const mockEvent = { preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as React.MouseEvent

      await act(async () => {
        await result.current.handleContextMenu(mockEvent, '/test/project/src')
      })

      expect(result.current.expandedPaths.has('/test/project/src')).toBe(true)
    })
  })

  describe('handleFileContextMenu', () => {
    it('shows rename and delete options in context menu', async () => {
      vi.mocked(window.menu.popup).mockResolvedValue(null)

      const { result } = renderHook(() => useFileTree(defaultParams))
      const mockEvent = { preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as React.MouseEvent

      await act(async () => {
        await result.current.handleFileContextMenu(mockEvent, '/test/project/file.ts', 'file.ts')
      })

      expect(window.menu.popup).toHaveBeenCalledWith([
        { id: 'rename', label: 'Rename "file.ts"' },
        { id: 'delete', label: 'Delete "file.ts"' },
      ])
    })

    it('deletes file when confirmed', async () => {
      vi.mocked(window.menu.popup).mockResolvedValue('delete')
      vi.mocked(window.confirm).mockReturnValue(true)

      const { result } = renderHook(() => useFileTree(defaultParams))
      const mockEvent = { preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as React.MouseEvent

      await act(async () => {
        await result.current.handleFileContextMenu(mockEvent, '/test/project/file.ts', 'file.ts')
      })

      expect(window.fs.rm).toHaveBeenCalledWith('/test/project/file.ts')
    })

    it('does not delete file when not confirmed', async () => {
      vi.mocked(window.menu.popup).mockResolvedValue('delete')
      vi.mocked(window.confirm).mockReturnValue(false)

      const { result } = renderHook(() => useFileTree(defaultParams))
      const mockEvent = { preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as React.MouseEvent

      await act(async () => {
        await result.current.handleFileContextMenu(mockEvent, '/test/project/file.ts', 'file.ts')
      })

      expect(window.fs.rm).not.toHaveBeenCalled()
    })

    it('sets rename input when rename is selected', async () => {
      vi.mocked(window.menu.popup).mockResolvedValue('rename')

      const { result } = renderHook(() => useFileTree(defaultParams))
      const mockEvent = { preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as React.MouseEvent

      await act(async () => {
        await result.current.handleFileContextMenu(mockEvent, '/test/project/file.ts', 'file.ts')
      })

      expect(result.current.renameInput).toEqual({
        filePath: '/test/project/file.ts',
        originalName: 'file.ts',
      })
      expect(result.current.renameInputValue).toBe('file.ts')
    })
  })

  describe('submitInlineInput', () => {
    it('creates a folder when type is folder', async () => {
      const { result } = renderHook(() => useFileTree(defaultParams))

      act(() => {
        result.current.setInlineInput({ parentPath: '/test/project', type: 'folder' })
        result.current.setInlineInputValue('new-folder')
      })

      await act(async () => {
        await result.current.submitInlineInput()
      })

      expect(window.fs.mkdir).toHaveBeenCalledWith('/test/project/new-folder')
      expect(result.current.inlineInput).toBeNull()
      expect(result.current.inlineInputValue).toBe('')
    })

    it('creates a file when type is file', async () => {
      const { result } = renderHook(() => useFileTree(defaultParams))

      act(() => {
        result.current.setInlineInput({ parentPath: '/test/project', type: 'file' })
        result.current.setInlineInputValue('new-file.ts')
      })

      await act(async () => {
        await result.current.submitInlineInput()
      })

      expect(window.fs.createFile).toHaveBeenCalledWith('/test/project/new-file.ts')
      expect(result.current.inlineInput).toBeNull()
    })

    it('does nothing with empty input value', async () => {
      const { result } = renderHook(() => useFileTree(defaultParams))

      act(() => {
        result.current.setInlineInput({ parentPath: '/test/project', type: 'file' })
        result.current.setInlineInputValue('   ')
      })

      await act(async () => {
        await result.current.submitInlineInput()
      })

      expect(window.fs.createFile).not.toHaveBeenCalled()
      expect(window.fs.mkdir).not.toHaveBeenCalled()
      expect(result.current.inlineInput).toBeNull()
    })

    it('does nothing without inlineInput set', async () => {
      const { result } = renderHook(() => useFileTree(defaultParams))

      await act(async () => {
        await result.current.submitInlineInput()
      })

      expect(window.fs.createFile).not.toHaveBeenCalled()
      expect(window.fs.mkdir).not.toHaveBeenCalled()
    })

    it('does nothing without directory', async () => {
      const { result } = renderHook(() =>
        useFileTree({ gitStatus: [] })
      )

      act(() => {
        result.current.setInlineInput({ parentPath: '/test', type: 'file' })
        result.current.setInlineInputValue('file.ts')
      })

      await act(async () => {
        await result.current.submitInlineInput()
      })

      expect(window.fs.createFile).not.toHaveBeenCalled()
    })
  })

  describe('submitRename', () => {
    it('calls fs.rename with correct old and new paths', async () => {
      const { result } = renderHook(() => useFileTree(defaultParams))

      // Simulate rename being initiated via context menu
      vi.mocked(window.menu.popup).mockResolvedValue('rename')
      const mockEvent = { preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as React.MouseEvent

      await act(async () => {
        await result.current.handleFileContextMenu(mockEvent, '/test/project/file.ts', 'file.ts')
      })

      // Change the name
      act(() => {
        result.current.setRenameInputValue('renamed.ts')
      })

      await act(async () => {
        await result.current.submitRename()
      })

      expect(window.fs.rename).toHaveBeenCalledWith('/test/project/file.ts', '/test/project/renamed.ts')
      expect(result.current.renameInput).toBeNull()
    })

    it('does nothing when name is unchanged', async () => {
      const { result } = renderHook(() => useFileTree(defaultParams))

      vi.mocked(window.menu.popup).mockResolvedValue('rename')
      const mockEvent = { preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as React.MouseEvent

      await act(async () => {
        await result.current.handleFileContextMenu(mockEvent, '/test/project/file.ts', 'file.ts')
      })

      // Don't change the value — it's already 'file.ts'
      await act(async () => {
        await result.current.submitRename()
      })

      expect(window.fs.rename).not.toHaveBeenCalled()
      expect(result.current.renameInput).toBeNull()
    })

    it('does nothing with empty input', async () => {
      const { result } = renderHook(() => useFileTree(defaultParams))

      vi.mocked(window.menu.popup).mockResolvedValue('rename')
      const mockEvent = { preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as React.MouseEvent

      await act(async () => {
        await result.current.handleFileContextMenu(mockEvent, '/test/project/file.ts', 'file.ts')
      })

      act(() => {
        result.current.setRenameInputValue('   ')
      })

      await act(async () => {
        await result.current.submitRename()
      })

      expect(window.fs.rename).not.toHaveBeenCalled()
    })

    it('does nothing without renameInput', async () => {
      const { result } = renderHook(() => useFileTree(defaultParams))

      await act(async () => {
        await result.current.submitRename()
      })

      expect(window.fs.rename).not.toHaveBeenCalled()
    })
  })

  describe('cancelRename', () => {
    it('clears rename state', async () => {
      const { result } = renderHook(() => useFileTree(defaultParams))

      vi.mocked(window.menu.popup).mockResolvedValue('rename')
      const mockEvent = { preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as React.MouseEvent

      await act(async () => {
        await result.current.handleFileContextMenu(mockEvent, '/test/project/file.ts', 'file.ts')
      })

      expect(result.current.renameInput).not.toBeNull()

      act(() => {
        result.current.cancelRename()
      })

      expect(result.current.renameInput).toBeNull()
      expect(result.current.renameInputValue).toBe('')
    })
  })

  describe('directory context menu rename', () => {
    it('shows rename option for non-root directories', async () => {
      vi.mocked(window.menu.popup).mockResolvedValue(null)

      const { result } = renderHook(() => useFileTree(defaultParams))

      act(() => {
        result.current.setTree([
          { name: 'src', isDirectory: true, path: '/test/project/src' },
        ])
      })

      const mockEvent = { preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as React.MouseEvent

      await act(async () => {
        await result.current.handleContextMenu(mockEvent, '/test/project/src')
      })

      expect(window.menu.popup).toHaveBeenCalledWith([
        { id: 'new-file', label: 'New File' },
        { id: 'new-folder', label: 'New Folder' },
        { id: 'rename', label: 'Rename "src"' },
      ])
    })

    it('does not show rename for root directory', async () => {
      vi.mocked(window.menu.popup).mockResolvedValue(null)

      const { result } = renderHook(() => useFileTree(defaultParams))
      const mockEvent = { preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as React.MouseEvent

      await act(async () => {
        await result.current.handleContextMenu(mockEvent, '/test/project')
      })

      expect(window.menu.popup).toHaveBeenCalledWith([
        { id: 'new-file', label: 'New File' },
        { id: 'new-folder', label: 'New Folder' },
      ])
    })

    it('sets rename input when rename is selected on directory', async () => {
      vi.mocked(window.menu.popup).mockResolvedValue('rename')

      const { result } = renderHook(() => useFileTree(defaultParams))
      const mockEvent = { preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as React.MouseEvent

      await act(async () => {
        await result.current.handleContextMenu(mockEvent, '/test/project/src')
      })

      expect(result.current.renameInput).toEqual({
        filePath: '/test/project/src',
        originalName: 'src',
      })
      expect(result.current.renameInputValue).toBe('src')
    })
  })

  describe('drag and drop', () => {
    it('calls fs.rename to move file to target directory', async () => {
      const { result } = renderHook(() => useFileTree(defaultParams))

      act(() => {
        result.current.startDrag('/test/project/file.ts')
      })

      expect(result.current.draggedPath).toBe('/test/project/file.ts')

      await act(async () => {
        await result.current.handleDrop('/test/project/src')
      })

      expect(window.fs.rename).toHaveBeenCalledWith('/test/project/file.ts', '/test/project/src/file.ts')
      expect(result.current.draggedPath).toBeNull()
      expect(result.current.dropTargetPath).toBeNull()
    })

    it('does nothing when dropping on self', async () => {
      const { result } = renderHook(() => useFileTree(defaultParams))

      act(() => {
        result.current.startDrag('/test/project/src')
      })

      await act(async () => {
        await result.current.handleDrop('/test/project/src')
      })

      expect(window.fs.rename).not.toHaveBeenCalled()
    })

    it('does nothing when no drag is in progress', async () => {
      const { result } = renderHook(() => useFileTree(defaultParams))

      await act(async () => {
        await result.current.handleDrop('/test/project/src')
      })

      expect(window.fs.rename).not.toHaveBeenCalled()
    })

    it('prevents dropping into own subdirectory', async () => {
      const { result } = renderHook(() => useFileTree(defaultParams))

      act(() => {
        result.current.startDrag('/test/project/src')
      })

      await act(async () => {
        await result.current.handleDrop('/test/project/src/nested')
      })

      expect(window.fs.rename).not.toHaveBeenCalled()
    })

    it('endDrag clears drag state', () => {
      const { result } = renderHook(() => useFileTree(defaultParams))

      act(() => {
        result.current.startDrag('/test/project/file.ts')
        result.current.setDropTarget('/test/project/src')
      })

      expect(result.current.draggedPath).toBe('/test/project/file.ts')
      expect(result.current.dropTargetPath).toBe('/test/project/src')

      act(() => {
        result.current.endDrag()
      })

      expect(result.current.draggedPath).toBeNull()
      expect(result.current.dropTargetPath).toBeNull()
    })
  })

  describe('navigateTreeItem', () => {
    it('focuses next item on down navigation', () => {
      const container = document.createElement('div')
      container.setAttribute('data-panel-id', 'explorer')
      const item1 = document.createElement('div')
      item1.setAttribute('data-tree-item', '')
      const item2 = document.createElement('div')
      item2.setAttribute('data-tree-item', '')
      item2.focus = vi.fn()
      container.appendChild(item1)
      container.appendChild(item2)
      document.body.appendChild(container)

      navigateTreeItem(item1, 'down')

      expect(item2.focus).toHaveBeenCalled()

      document.body.removeChild(container)
    })

    it('focuses previous item on up navigation', () => {
      const container = document.createElement('div')
      container.setAttribute('data-panel-id', 'explorer')
      const item1 = document.createElement('div')
      item1.setAttribute('data-tree-item', '')
      item1.focus = vi.fn()
      const item2 = document.createElement('div')
      item2.setAttribute('data-tree-item', '')
      container.appendChild(item1)
      container.appendChild(item2)
      document.body.appendChild(container)

      navigateTreeItem(item2, 'up')

      expect(item1.focus).toHaveBeenCalled()

      document.body.removeChild(container)
    })

    it('does nothing when no container found', () => {
      const orphan = document.createElement('div')

      // Should not throw
      navigateTreeItem(orphan, 'down')
    })

    it('does nothing at boundary (last item going down)', () => {
      const container = document.createElement('div')
      container.setAttribute('data-panel-id', 'explorer')
      const item1 = document.createElement('div')
      item1.setAttribute('data-tree-item', '')
      container.appendChild(item1)
      document.body.appendChild(container)

      // Should not throw when trying to go down from last item
      navigateTreeItem(item1, 'down')

      document.body.removeChild(container)
    })
  })
})
