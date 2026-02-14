// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../../test/react-setup'

// Mock useFileTree hook to avoid complex async filesystem calls
const mockUseFileTree = {
  tree: [],
  setTree: vi.fn(),
  expandedPaths: new Set<string>(),
  isLoading: false,
  setIsLoading: vi.fn(),
  inlineInput: null,
  setInlineInput: vi.fn(),
  inlineInputValue: '',
  setInlineInputValue: vi.fn(),
  loadDirectory: vi.fn().mockResolvedValue([]),
  refreshTree: vi.fn().mockResolvedValue(undefined),
  toggleExpand: vi.fn(),
  handleFileClick: vi.fn(),
  getFileStatus: vi.fn().mockReturnValue(undefined),
  handleContextMenu: vi.fn(),
  handleFileContextMenu: vi.fn(),
  submitInlineInput: vi.fn(),
  navigateTreeItem: vi.fn(),
  updateTreeNode: vi.fn(),
  findNode: vi.fn(),
  setExpandedPaths: vi.fn(),
}

vi.mock('../../hooks/useFileTree', () => ({
  useFileTree: () => mockUseFileTree,
}))

import { FileTree } from './FileTree'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
  mockUseFileTree.tree = []
  mockUseFileTree.isLoading = false
  mockUseFileTree.expandedPaths = new Set<string>()
  mockUseFileTree.inlineInput = null
  mockUseFileTree.getFileStatus.mockReturnValue(undefined)
  mockUseFileTree.loadDirectory.mockResolvedValue([])
})

describe('FileTree', () => {
  it('returns null when no directory', () => {
    const { container } = render(<FileTree />)
    expect(container.innerHTML).toBe('')
  })

  it('shows loading state', () => {
    mockUseFileTree.isLoading = true
    render(<FileTree directory="/repos/project" />)
    expect(screen.getByText('Loading...')).toBeTruthy()
  })

  it('shows Empty directory when tree is empty', () => {
    render(<FileTree directory="/repos/project" />)
    expect(screen.getByText('Empty directory')).toBeTruthy()
  })

  it('shows directory path', () => {
    render(<FileTree directory="/repos/project" />)
    expect(screen.getByText('/repos/project')).toBeTruthy()
  })

  it('renders file nodes', () => {
    mockUseFileTree.tree = [
      { name: 'index.ts', path: '/repos/project/index.ts', isDirectory: false },
      { name: 'app.tsx', path: '/repos/project/app.tsx', isDirectory: false },
    ]
    render(<FileTree directory="/repos/project" />)
    expect(screen.getByText('index.ts')).toBeTruthy()
    expect(screen.getByText('app.tsx')).toBeTruthy()
  })

  it('renders directory nodes with expand indicator', () => {
    mockUseFileTree.tree = [
      { name: 'src', path: '/repos/project/src', isDirectory: true },
    ]
    render(<FileTree directory="/repos/project" />)
    expect(screen.getByText('src')).toBeTruthy()
  })

  it('shows expanded directory indicator', () => {
    mockUseFileTree.tree = [
      {
        name: 'src',
        path: '/repos/project/src',
        isDirectory: true,
        children: [
          { name: 'index.ts', path: '/repos/project/src/index.ts', isDirectory: false },
        ],
      },
    ]
    mockUseFileTree.expandedPaths = new Set(['/repos/project/src'])
    render(<FileTree directory="/repos/project" />)
    expect(screen.getByText('src')).toBeTruthy()
    expect(screen.getByText('index.ts')).toBeTruthy()
  })

  it('shows status badge for files with git status', () => {
    mockUseFileTree.tree = [
      { name: 'index.ts', path: '/repos/project/index.ts', isDirectory: false },
    ]
    mockUseFileTree.getFileStatus.mockReturnValue({ path: 'index.ts', status: 'modified', staged: false })
    render(<FileTree directory="/repos/project" />)
    expect(screen.getByText('M')).toBeTruthy()
  })

  it('highlights selected file', () => {
    mockUseFileTree.tree = [
      { name: 'index.ts', path: '/repos/project/index.ts', isDirectory: false },
    ]
    const { container } = render(
      <FileTree directory="/repos/project" selectedFilePath="/repos/project/index.ts" />
    )
    const item = container.querySelector('[data-tree-item]')!
    expect(item.className).toContain('bg-accent/20')
  })

  it('calls loadDirectory on mount', () => {
    render(<FileTree directory="/repos/project" />)
    expect(mockUseFileTree.loadDirectory).toHaveBeenCalledWith('/repos/project')
  })

  describe('keyboard navigation', () => {
    beforeEach(() => {
      mockUseFileTree.tree = [
        { name: 'src', path: '/repos/project/src', isDirectory: true },
        { name: 'index.ts', path: '/repos/project/index.ts', isDirectory: false },
      ]
    })

    it('calls handleFileClick on Enter key', () => {
      render(<FileTree directory="/repos/project" />)
      const items = screen.getAllByText(/(src|index\.ts)/)
      const item = items[0].closest('[data-tree-item]')!
      fireEvent.keyDown(item, { key: 'Enter' })
      expect(mockUseFileTree.handleFileClick).toHaveBeenCalled()
    })

    it('calls navigateTreeItem on ArrowDown', () => {
      render(<FileTree directory="/repos/project" />)
      const item = screen.getByText('src').closest('[data-tree-item]')!
      fireEvent.keyDown(item, { key: 'ArrowDown' })
      expect(mockUseFileTree.navigateTreeItem).toHaveBeenCalled()
    })

    it('calls navigateTreeItem on ArrowUp', () => {
      render(<FileTree directory="/repos/project" />)
      const item = screen.getByText('index.ts').closest('[data-tree-item]')!
      fireEvent.keyDown(item, { key: 'ArrowUp' })
      expect(mockUseFileTree.navigateTreeItem).toHaveBeenCalled()
    })

    it('calls toggleExpand on ArrowRight for collapsed directory', () => {
      render(<FileTree directory="/repos/project" />)
      const item = screen.getByText('src').closest('[data-tree-item]')!
      fireEvent.keyDown(item, { key: 'ArrowRight' })
      expect(mockUseFileTree.toggleExpand).toHaveBeenCalled()
    })

    it('calls navigateTreeItem on ArrowRight for expanded directory', () => {
      mockUseFileTree.expandedPaths = new Set(['/repos/project/src'])
      render(<FileTree directory="/repos/project" />)
      const item = screen.getByText('src').closest('[data-tree-item]')!
      fireEvent.keyDown(item, { key: 'ArrowRight' })
      expect(mockUseFileTree.navigateTreeItem).toHaveBeenCalled()
    })

    it('calls toggleExpand on ArrowLeft for expanded directory', () => {
      mockUseFileTree.expandedPaths = new Set(['/repos/project/src'])
      render(<FileTree directory="/repos/project" />)
      const item = screen.getByText('src').closest('[data-tree-item]')!
      fireEvent.keyDown(item, { key: 'ArrowLeft' })
      expect(mockUseFileTree.toggleExpand).toHaveBeenCalled()
    })

    it('handles Home key', () => {
      render(<FileTree directory="/repos/project" />)
      const item = screen.getByText('index.ts').closest('[data-tree-item]')!
      fireEvent.keyDown(item, { key: 'Home' })
      // Should not throw
    })

    it('handles End key', () => {
      render(<FileTree directory="/repos/project" />)
      const item = screen.getByText('src').closest('[data-tree-item]')!
      fireEvent.keyDown(item, { key: 'End' })
      // Should not throw
    })
  })

  it('renders inline input and submits on blur', () => {
    mockUseFileTree.inlineInput = { type: 'file' as const, parentPath: '/repos/project' }
    mockUseFileTree.inlineInputValue = 'test.ts'
    render(<FileTree directory="/repos/project" />)
    const input = screen.getByPlaceholderText('filename')
    fireEvent.blur(input)
    expect(mockUseFileTree.submitInlineInput).toHaveBeenCalled()
  })

  it('calls handleContextMenu on directory path right-click', () => {
    render(<FileTree directory="/repos/project" />)
    const pathEl = screen.getByText('/repos/project')
    fireEvent.contextMenu(pathEl)
    expect(mockUseFileTree.handleContextMenu).toHaveBeenCalled()
  })
})
