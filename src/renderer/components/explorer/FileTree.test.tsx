// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
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
})
