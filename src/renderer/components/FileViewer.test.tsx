// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../test/react-setup'
import FileViewer from './FileViewer'

// Mock path-browserify
vi.mock('path-browserify', () => ({
  basename: (p: string) => p.split('/').pop() || p,
}))

// Mock the useFileViewer hook
const mockViewer = {
  content: 'file content here',
  isLoading: false,
  error: null as string | null,
  isDirty: false,
  isSaving: false,
  viewMode: 'latest' as const,
  diffSideBySide: false,
  editorActions: null,
  availableViewers: [{ id: 'monaco', name: 'Code', canHandle: () => true, priority: 1, component: ({ content }: { content: string }) => <div data-testid="viewer-content">{content}</div> }],
  selectedViewer: { id: 'monaco', name: 'Code', canHandle: () => true, priority: 1, component: ({ content }: { content: string }) => <div data-testid="viewer-content">{content}</div> },
  selectedViewerId: 'monaco',
  canShowDiff: false,
  originalContent: '',
  diffModifiedContent: null as string | null,
  fileChangedOnDisk: false,
  isLoadingDiff: false,
  handleSave: vi.fn(),
  handleSaveButton: vi.fn(),
  handleDirtyChange: vi.fn(),
  handleKeepLocalChanges: vi.fn(),
  handleLoadDiskVersion: vi.fn(),
  setDiffSideBySide: vi.fn(),
  setSelectedViewerId: vi.fn(),
  setViewMode: vi.fn(),
  setEditorActions: vi.fn(),
}

vi.mock('../hooks/useFileViewer', () => ({
  useFileViewer: () => mockViewer,
}))

// Mock MonacoDiffViewer
vi.mock('./fileViewers/MonacoDiffViewer', () => ({
  default: () => <div data-testid="diff-viewer">MonacoDiffViewer</div>,
}))

// Mock FileViewerToolbar
vi.mock('./FileViewerToolbar', () => ({
  default: (props: { fileName: string; onClose?: () => void }) => (
    <div data-testid="toolbar">
      <span data-testid="toolbar-filename">{props.fileName}</span>
      {props.onClose && <button data-testid="toolbar-close" onClick={props.onClose}>Close</button>}
    </div>
  ),
}))

afterEach(() => {
  cleanup()
  // Reset mock state
  mockViewer.isLoading = false
  mockViewer.error = null
  mockViewer.selectedViewer = mockViewer.availableViewers[0]
  mockViewer.viewMode = 'latest'
  mockViewer.fileChangedOnDisk = false
  mockViewer.isLoadingDiff = false
  mockViewer.diffModifiedContent = null
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('FileViewer', () => {
  it('shows placeholder when no file is selected', () => {
    render(<FileViewer filePath={null} />)
    expect(screen.getByText('Select a file to view')).toBeTruthy()
  })

  it('shows loading state', () => {
    mockViewer.isLoading = true
    render(<FileViewer filePath="/test/file.ts" />)
    expect(screen.getByText('Loading...')).toBeTruthy()
  })

  it('shows error message', () => {
    mockViewer.error = 'Failed to read file'
    render(<FileViewer filePath="/test/file.ts" />)
    expect(screen.getByText('Failed to read file')).toBeTruthy()
  })

  it('shows "no viewer" message when no viewer is available', () => {
    mockViewer.selectedViewer = null as never
    render(<FileViewer filePath="/test/file.bin" />)
    expect(screen.getByText('No viewer available for this file type')).toBeTruthy()
  })

  it('renders toolbar and viewer content for a valid file', () => {
    render(<FileViewer filePath="/test/myfile.ts" />)
    expect(screen.getByTestId('toolbar')).toBeTruthy()
    expect(screen.getByTestId('toolbar-filename').textContent).toBe('myfile.ts')
    expect(screen.getByTestId('viewer-content')).toBeTruthy()
  })

  it('passes onClose to toolbar', () => {
    const onClose = vi.fn()
    render(<FileViewer filePath="/test/file.ts" onClose={onClose} />)
    fireEvent.click(screen.getByTestId('toolbar-close'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('shows file-changed-on-disk notification bar', () => {
    mockViewer.fileChangedOnDisk = true
    render(<FileViewer filePath="/test/file.ts" />)
    expect(screen.getByText('This file has been changed on disk.')).toBeTruthy()
    expect(screen.getByText('Keep my changes')).toBeTruthy()
    expect(screen.getByText('Load disk version')).toBeTruthy()
  })

  it('calls handleKeepLocalChanges when "Keep my changes" is clicked', () => {
    mockViewer.fileChangedOnDisk = true
    render(<FileViewer filePath="/test/file.ts" />)
    fireEvent.click(screen.getByText('Keep my changes'))
    expect(mockViewer.handleKeepLocalChanges).toHaveBeenCalledOnce()
  })

  it('calls handleLoadDiskVersion when "Load disk version" is clicked', () => {
    mockViewer.fileChangedOnDisk = true
    render(<FileViewer filePath="/test/file.ts" />)
    fireEvent.click(screen.getByText('Load disk version'))
    expect(mockViewer.handleLoadDiskVersion).toHaveBeenCalledOnce()
  })

  it('shows diff viewer in diff mode', () => {
    mockViewer.viewMode = 'diff'
    render(<FileViewer filePath="/test/file.ts" />)
    expect(screen.getByTestId('diff-viewer')).toBeTruthy()
  })

  it('shows loading diff message when loading diff', () => {
    mockViewer.viewMode = 'diff'
    mockViewer.isLoadingDiff = true
    render(<FileViewer filePath="/test/file.ts" />)
    expect(screen.getByText('Loading diff...')).toBeTruthy()
  })
})
