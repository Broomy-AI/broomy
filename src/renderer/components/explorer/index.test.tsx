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
vi.mock('../review', () => ({
  default: (_props: Record<string, unknown>) => <div data-testid="review-panel">ReviewPanel</div>,
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
    render(
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

  describe('issue plan chips', () => {
    it('shows "Show plan" chip when issuePlanExists is true', () => {
      render(
        <Explorer
          {...defaultProps}
          directory="/repos/project"
          issuePlanExists={true}
        />
      )
      expect(screen.getByText('Show plan')).toBeTruthy()
    })

    it('calls onFileSelect with plan path when "Show plan" is clicked', () => {
      const onFileSelect = vi.fn()
      render(
        <Explorer
          {...defaultProps}
          directory="/repos/project"
          issuePlanExists={true}
          onFileSelect={onFileSelect}
        />
      )
      fireEvent.click(screen.getByText('Show plan'))
      expect(onFileSelect).toHaveBeenCalledWith({
        filePath: '/repos/project/.broomy/output/plan.md',
        openInDiffMode: false,
      })
    })

    it('shows "Ask agent to plan this issue" chip when issueNumber is set and no plan exists', () => {
      render(
        <Explorer
          {...defaultProps}
          directory="/repos/project"
          issueNumber={42}
          issuePlanExists={false}
          agentPtyId="pty-1"
        />
      )
      expect(screen.getByText('Ask agent to plan this issue')).toBeTruthy()
    })

    it('writes command to agent terminal when "Ask agent to plan" is clicked', () => {
      render(
        <Explorer
          {...defaultProps}
          directory="/repos/project"
          issueNumber={42}
          issuePlanExists={false}
          agentPtyId="pty-1"
        />
      )
      fireEvent.click(screen.getByText('Ask agent to plan this issue'))
      expect(window.pty.write).toHaveBeenCalledWith(
        'pty-1',
        expect.stringContaining('gh issue view 42'),
      )
    })

    it('disables "Ask agent to plan" chip when no agentPtyId', () => {
      render(
        <Explorer
          {...defaultProps}
          directory="/repos/project"
          issueNumber={42}
          issuePlanExists={false}
        />
      )
      const button = screen.getByText('Ask agent to plan this issue')
      expect(button.closest('button')?.disabled).toBe(true)
    })

    it('does not show issue plan chips when neither condition is met', () => {
      render(<Explorer {...defaultProps} directory="/repos/project" />)
      expect(screen.queryByText('Show plan')).toBeNull()
      expect(screen.queryByText('Ask agent to plan this issue')).toBeNull()
    })

    it('shows "Show plan" chip instead of "Ask agent" when plan exists even with issueNumber', () => {
      render(
        <Explorer
          {...defaultProps}
          directory="/repos/project"
          issueNumber={42}
          issuePlanExists={true}
          agentPtyId="pty-1"
        />
      )
      expect(screen.getByText('Show plan')).toBeTruthy()
      expect(screen.queryByText('Ask agent to plan this issue')).toBeNull()
    })
  })

  it('renders review tab button', () => {
    render(<Explorer {...defaultProps} directory="/repos/project" />)
    expect(screen.getByTitle('Review')).toBeTruthy()
  })

  it('calls onFilterChange with review when review tab is clicked', () => {
    const onFilterChange = vi.fn()
    render(<Explorer {...defaultProps} directory="/repos/project" onFilterChange={onFilterChange} />)
    fireEvent.click(screen.getByTitle('Review'))
    expect(onFilterChange).toHaveBeenCalledWith('review')
  })

  it('shows ReviewPanel when filter is review and session is provided', () => {
    const session = { id: 'session-1', name: 'Test' } as never
    render(
      <Explorer
        {...defaultProps}
        directory="/repos/project"
        filter="review"
        session={session}
      />
    )
    expect(screen.getByTestId('review-panel')).toBeTruthy()
  })

  it('does not show ReviewPanel when filter is review but no session', () => {
    render(
      <Explorer
        {...defaultProps}
        directory="/repos/project"
        filter="review"
      />
    )
    expect(screen.queryByTestId('review-panel')).toBeNull()
  })

  it('highlights review tab when active', () => {
    const session = { id: 'session-1', name: 'Test' } as never
    render(
      <Explorer
        {...defaultProps}
        directory="/repos/project"
        filter="review"
        session={session}
      />
    )
    const reviewButton = screen.getByTitle('Review')
    expect(reviewButton.className).toContain('bg-accent')
  })

  it('highlights plan chip when it matches selectedFilePath', () => {
    render(
      <Explorer
        {...defaultProps}
        directory="/repos/project"
        planFilePath="/repos/project/PLAN.md"
        selectedFilePath="/repos/project/PLAN.md"
      />
    )
    const planButton = screen.getByText('Plan').closest('button')!
    expect(planButton.className).toContain('bg-accent')
  })

  it('does not highlight plan chip when it does not match selectedFilePath', () => {
    render(
      <Explorer
        {...defaultProps}
        directory="/repos/project"
        planFilePath="/repos/project/PLAN.md"
        selectedFilePath="/repos/project/other.ts"
      />
    )
    const planButton = screen.getByText('Plan').closest('button')!
    expect(planButton.className).not.toContain('bg-accent text-white')
  })
})
