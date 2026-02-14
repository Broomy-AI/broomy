// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../../test/react-setup'

// Mock child components to isolate Explorer logic
vi.mock('./FileTree', () => ({
  FileTree: () => <div data-testid="file-tree">FileTree</div>,
}))
vi.mock('./SourceControl', () => ({
  SourceControl: () => <div data-testid="source-control">SourceControl</div>,
}))
vi.mock('./SearchPanel', () => ({
  SearchPanel: () => <div data-testid="search-panel">SearchPanel</div>,
}))
vi.mock('./RecentFiles', () => ({
  RecentFiles: () => <div data-testid="recent-files">RecentFiles</div>,
}))

import Explorer from './index'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
})

const defaultProps = {
  filter: 'files' as const,
  onFilterChange: vi.fn(),
  gitStatus: [],
}

describe('Explorer', () => {
  it('shows placeholder when no directory', () => {
    render(<Explorer {...defaultProps} />)
    expect(screen.getByText('Select a session to view files')).toBeTruthy()
  })

  it('renders Explorer header with title', () => {
    render(<Explorer {...defaultProps} directory="/repos/project" />)
    expect(screen.getByText('Explorer')).toBeTruthy()
  })

  it('renders tab buttons for files, source control, search, recent', () => {
    render(<Explorer {...defaultProps} directory="/repos/project" />)
    expect(screen.getByTitle('Files')).toBeTruthy()
    expect(screen.getByTitle('Source Control')).toBeTruthy()
    expect(screen.getByTitle('Search')).toBeTruthy()
    expect(screen.getByTitle('Recent Files')).toBeTruthy()
  })

  it('shows FileTree when filter is files', () => {
    render(<Explorer {...defaultProps} directory="/repos/project" filter="files" />)
    expect(screen.getByTestId('file-tree')).toBeTruthy()
  })

  it('shows SourceControl when filter is source-control', () => {
    render(<Explorer {...defaultProps} directory="/repos/project" filter="source-control" />)
    expect(screen.getByTestId('source-control')).toBeTruthy()
  })

  it('shows SearchPanel when filter is search', () => {
    render(<Explorer {...defaultProps} directory="/repos/project" filter="search" />)
    expect(screen.getByTestId('search-panel')).toBeTruthy()
  })

  it('shows RecentFiles when filter is recent', () => {
    render(<Explorer {...defaultProps} directory="/repos/project" filter="recent" />)
    expect(screen.getByTestId('recent-files')).toBeTruthy()
  })

  it('calls onFilterChange when files tab is clicked', () => {
    const onFilterChange = vi.fn()
    render(<Explorer {...defaultProps} directory="/repos/project" onFilterChange={onFilterChange} />)
    fireEvent.click(screen.getByTitle('Files'))
    expect(onFilterChange).toHaveBeenCalledWith('files')
  })

  it('calls onFilterChange when source control tab is clicked', () => {
    const onFilterChange = vi.fn()
    render(<Explorer {...defaultProps} directory="/repos/project" onFilterChange={onFilterChange} />)
    fireEvent.click(screen.getByTitle('Source Control'))
    expect(onFilterChange).toHaveBeenCalledWith('source-control')
  })

  it('calls onFilterChange when search tab is clicked', () => {
    const onFilterChange = vi.fn()
    render(<Explorer {...defaultProps} directory="/repos/project" onFilterChange={onFilterChange} />)
    fireEvent.click(screen.getByTitle('Search'))
    expect(onFilterChange).toHaveBeenCalledWith('search')
  })

  it('calls onFilterChange when recent tab is clicked', () => {
    const onFilterChange = vi.fn()
    render(<Explorer {...defaultProps} directory="/repos/project" onFilterChange={onFilterChange} />)
    fireEvent.click(screen.getByTitle('Recent Files'))
    expect(onFilterChange).toHaveBeenCalledWith('recent')
  })

  it('highlights active filter tab', () => {
    const { container } = render(
      <Explorer {...defaultProps} directory="/repos/project" filter="source-control" />
    )
    const scButton = screen.getByTitle('Source Control')
    expect(scButton.className).toContain('bg-accent')
    const filesButton = screen.getByTitle('Files')
    expect(filesButton.className).not.toContain('bg-accent')
  })

  it('shows plan chip when planFilePath is provided', () => {
    render(
      <Explorer
        {...defaultProps}
        directory="/repos/project"
        planFilePath="/repos/project/PLAN.md"
      />
    )
    expect(screen.getByText('Plan')).toBeTruthy()
  })

  it('calls onFileSelect when plan chip is clicked', () => {
    const onFileSelect = vi.fn()
    render(
      <Explorer
        {...defaultProps}
        directory="/repos/project"
        planFilePath="/repos/project/PLAN.md"
        onFileSelect={onFileSelect}
      />
    )
    fireEvent.click(screen.getByText('Plan'))
    expect(onFileSelect).toHaveBeenCalledWith({
      filePath: '/repos/project/PLAN.md',
      openInDiffMode: false,
    })
  })

  it('does not show plan chip when planFilePath is null', () => {
    render(<Explorer {...defaultProps} directory="/repos/project" planFilePath={null} />)
    expect(screen.queryByText('Plan')).toBeNull()
  })
})
