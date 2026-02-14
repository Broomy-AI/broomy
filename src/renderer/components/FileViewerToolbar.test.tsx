// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../test/react-setup'
import FileViewerToolbar from './FileViewerToolbar'
import type { FileViewerPlugin } from './fileViewers'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
})

const mockViewers: FileViewerPlugin[] = [
  { id: 'monaco', name: 'Code', canHandle: () => true, priority: 1, component: () => null },
  { id: 'markdown', name: 'Markdown', canHandle: () => true, priority: 2, component: () => null },
]

const defaultProps = {
  fileName: 'test.ts',
  filePath: '/Users/test/repos/project/test.ts',
  isDirty: false,
  isSaving: false,
  viewMode: 'latest' as const,
  diffSideBySide: false,
  editorActions: null,
  availableViewers: mockViewers,
  selectedViewerId: 'monaco',
  canShowDiff: true,
  position: 'top' as const,
  onSaveButton: vi.fn(),
  onSetDiffSideBySide: vi.fn(),
  onSelectViewer: vi.fn(),
  onSetViewMode: vi.fn(),
}

describe('FileViewerToolbar', () => {
  it('renders the file name', () => {
    render(<FileViewerToolbar {...defaultProps} />)
    expect(screen.getByText('test.ts')).toBeTruthy()
  })

  it('renders the file path', () => {
    render(<FileViewerToolbar {...defaultProps} />)
    expect(screen.getByText('/Users/test/repos/project/test.ts')).toBeTruthy()
  })

  it('does not show Save button when not dirty', () => {
    render(<FileViewerToolbar {...defaultProps} />)
    expect(screen.queryByText('Save')).toBeNull()
  })

  it('shows Save button when dirty', () => {
    render(<FileViewerToolbar {...defaultProps} isDirty={true} />)
    expect(screen.getByText('Save')).toBeTruthy()
  })

  it('shows "Saving..." when saving', () => {
    render(<FileViewerToolbar {...defaultProps} isDirty={true} isSaving={true} />)
    expect(screen.getByText('Saving...')).toBeTruthy()
  })

  it('calls onSaveButton when Save is clicked', () => {
    render(<FileViewerToolbar {...defaultProps} isDirty={true} />)
    fireEvent.click(screen.getByText('Save'))
    expect(defaultProps.onSaveButton).toHaveBeenCalledOnce()
  })

  it('shows outline button when editorActions are available and not in diff mode', () => {
    const editorActions = { showOutline: vi.fn() }
    render(<FileViewerToolbar {...defaultProps} editorActions={editorActions} />)
    const outlineButton = screen.getByTitle('Outline (symbol list)')
    expect(outlineButton).toBeTruthy()
    fireEvent.click(outlineButton)
    expect(editorActions.showOutline).toHaveBeenCalledOnce()
  })

  it('does not show outline button in diff mode', () => {
    const editorActions = { showOutline: vi.fn() }
    render(<FileViewerToolbar {...defaultProps} editorActions={editorActions} viewMode="diff" />)
    expect(screen.queryByTitle('Outline (symbol list)')).toBeNull()
  })

  it('shows viewer selector buttons when multiple viewers or diff available', () => {
    render(<FileViewerToolbar {...defaultProps} />)
    expect(screen.getByTitle('Code')).toBeTruthy()
    expect(screen.getByTitle('Markdown')).toBeTruthy()
    expect(screen.getByTitle('Diff')).toBeTruthy()
  })

  it('calls onSelectViewer and onSetViewMode when viewer button is clicked', () => {
    render(<FileViewerToolbar {...defaultProps} />)
    fireEvent.click(screen.getByTitle('Markdown'))
    expect(defaultProps.onSelectViewer).toHaveBeenCalledWith('markdown')
    expect(defaultProps.onSetViewMode).toHaveBeenCalledWith('latest')
  })

  it('calls onSetViewMode with diff when Diff button is clicked', () => {
    render(<FileViewerToolbar {...defaultProps} />)
    fireEvent.click(screen.getByTitle('Diff'))
    expect(defaultProps.onSetViewMode).toHaveBeenCalledWith('diff')
  })

  it('does not show Diff button when canShowDiff is false', () => {
    render(<FileViewerToolbar {...defaultProps} canShowDiff={false} />)
    expect(screen.queryByTitle('Diff')).toBeNull()
  })

  it('shows side-by-side toggle in diff mode', () => {
    render(<FileViewerToolbar {...defaultProps} viewMode="diff" />)
    const toggleButton = screen.getByTitle('Switch to side-by-side view')
    expect(toggleButton).toBeTruthy()
    fireEvent.click(toggleButton)
    expect(defaultProps.onSetDiffSideBySide).toHaveBeenCalledWith(true)
  })

  it('shows "Switch to inline view" when side-by-side is active', () => {
    render(<FileViewerToolbar {...defaultProps} viewMode="diff" diffSideBySide={true} />)
    expect(screen.getByTitle('Switch to inline view')).toBeTruthy()
  })

  it('does not show side-by-side toggle outside diff mode', () => {
    render(<FileViewerToolbar {...defaultProps} viewMode="latest" />)
    expect(screen.queryByTitle('Switch to side-by-side view')).toBeNull()
    expect(screen.queryByTitle('Switch to inline view')).toBeNull()
  })

  it('renders position toggle buttons when onPositionChange is provided', () => {
    const onPositionChange = vi.fn()
    render(<FileViewerToolbar {...defaultProps} onPositionChange={onPositionChange} />)
    const topButton = screen.getByTitle('Position above agent')
    const leftButton = screen.getByTitle('Position left of agent')
    expect(topButton).toBeTruthy()
    expect(leftButton).toBeTruthy()

    fireEvent.click(leftButton)
    expect(onPositionChange).toHaveBeenCalledWith('left')
  })

  it('does not render position buttons when onPositionChange is not provided', () => {
    render(<FileViewerToolbar {...defaultProps} />)
    expect(screen.queryByTitle('Position above agent')).toBeNull()
  })

  it('renders close button when onClose is provided', () => {
    const onClose = vi.fn()
    render(<FileViewerToolbar {...defaultProps} onClose={onClose} />)
    const closeButton = screen.getByTitle('Close file')
    fireEvent.click(closeButton)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not render close button when onClose is not provided', () => {
    render(<FileViewerToolbar {...defaultProps} />)
    expect(screen.queryByTitle('Close file')).toBeNull()
  })

  it('shows diffLabel badge in diff mode', () => {
    render(<FileViewerToolbar {...defaultProps} viewMode="diff" diffLabel="abc1234: fix bug" />)
    expect(screen.getByText('abc1234: fix bug')).toBeTruthy()
  })

  it('does not show diffLabel in latest mode', () => {
    render(<FileViewerToolbar {...defaultProps} viewMode="latest" diffLabel="abc1234: fix bug" />)
    expect(screen.queryByText('abc1234: fix bug')).toBeNull()
  })

  it('hides viewer selector when single viewer and no diff', () => {
    const singleViewer = [mockViewers[0]]
    render(<FileViewerToolbar {...defaultProps} availableViewers={singleViewer} canShowDiff={false} />)
    expect(screen.queryByTitle('Code')).toBeNull()
  })
})
