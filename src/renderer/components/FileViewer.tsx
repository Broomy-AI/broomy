import { useEffect, useState, useCallback } from 'react'
import { basename } from 'path-browserify'
import { getViewersForFile, isTextContent } from './fileViewers'
import MonacoDiffViewer from './fileViewers/MonacoDiffViewer'
import type { FileViewerPlugin } from './fileViewers'

export type FileViewerPosition = 'top' | 'left'
export type ViewMode = 'latest' | 'diff'
export type FileStatus = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | null

interface FileViewerProps {
  filePath: string | null
  position?: FileViewerPosition
  onPositionChange?: (position: FileViewerPosition) => void
  onClose?: () => void
  fileStatus?: FileStatus // The git status of the file (null if unchanged)
  directory?: string // For getting git diff
  onSaveComplete?: () => void // Called after a successful save
  initialViewMode?: ViewMode // Initial view mode when opening a file
  reviewContext?: { sessionDirectory: string; commentsFilePath: string }
}

export default function FileViewer({ filePath, position = 'top', onPositionChange, onClose, fileStatus, directory, onSaveComplete, initialViewMode = 'latest', reviewContext }: FileViewerProps) {
  // Show diff for modified and deleted files
  const canShowDiff = fileStatus === 'modified' || fileStatus === 'deleted'
  const [content, setContent] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [availableViewers, setAvailableViewers] = useState<FileViewerPlugin[]>([])
  const [selectedViewerId, setSelectedViewerId] = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [editedContent, setEditedContent] = useState<string>('')
  const [isSaving, setIsSaving] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('latest')
  const [originalContent, setOriginalContent] = useState<string>('')
  const [diffSideBySide, setDiffSideBySide] = useState(true)

  useEffect(() => {
    if (!filePath) {
      setContent('')
      setIsLoading(false)
      setError(null)
      setAvailableViewers([])
      setSelectedViewerId(null)
      return
    }

    let cancelled = false

    const loadFile = async () => {
      setIsLoading(true)
      setError(null)

      // Get viewers that can handle this file based on extension
      let viewers = getViewersForFile(filePath)

      // Check if any non-text viewer (like image) can handle this file
      const hasNonTextViewer = viewers.some(v => v.id === 'image')

      let data = ''
      let readError: Error | null = null

      // Try to read as text (may fail for binary or deleted files)
      try {
        data = await window.fs.readFile(filePath)
      } catch (err) {
        readError = err instanceof Error ? err : new Error('Failed to read file')
      }

      if (cancelled) return

      // If file doesn't exist and is deleted, load the old version from git
      if (readError && fileStatus === 'deleted' && directory) {
        try {
          const relativePath = filePath.startsWith(directory + '/')
            ? filePath.slice(directory.length + 1)
            : filePath
          data = await window.git.show(directory, relativePath)
          readError = null
        } catch {
          // Still failed
        }
      }

      if (cancelled) return

      // If we couldn't read as text but have a non-text viewer, that's OK
      if (readError && !hasNonTextViewer) {
        setError(readError.message)
        setIsLoading(false)
        return
      }

      setContent(data)

      // Filter viewers based on content
      viewers = viewers.filter(viewer => {
        // Image viewer doesn't need text content
        if (viewer.id === 'image') return true
        // Monaco viewer can handle any text content (including empty files)
        if (viewer.id === 'monaco') {
          return isTextContent(data)
        }
        // Other viewers need content
        return !!data
      })

      setAvailableViewers(viewers)

      // Select the highest priority viewer by default, or keep current if still available
      if (viewers.length > 0) {
        const currentStillAvailable = viewers.find(v => v.id === selectedViewerId)
        if (!currentStillAvailable) {
          setSelectedViewerId(viewers[0].id)
        }
      } else {
        setSelectedViewerId(null)
      }

      setIsLoading(false)
    }

    loadFile()

    return () => {
      cancelled = true
    }
  }, [filePath])

  // Load original content from git when in diff mode
  useEffect(() => {
    if (!filePath || !directory || !canShowDiff || viewMode !== 'diff') {
      setOriginalContent('')
      return
    }

    const loadOriginal = async () => {
      try {
        // Convert absolute path to relative path for git show
        const relativePath = filePath.startsWith(directory + '/')
          ? filePath.slice(directory.length + 1)
          : filePath
        const original = await window.git.show(directory, relativePath)
        setOriginalContent(original)
      } catch {
        setOriginalContent('')
      }
    }

    loadOriginal()
  }, [filePath, directory, canShowDiff, viewMode])

  // Reset dirty state and set initial view mode when file changes
  useEffect(() => {
    setIsDirty(false)
    // Use diff mode if requested and the file supports it
    const shouldUseDiffMode = initialViewMode === 'diff' && canShowDiff
    setViewMode(shouldUseDiffMode ? 'diff' : 'latest')
  }, [filePath, initialViewMode, canShowDiff])

  // Save handler (called by editor on Cmd+S)
  const handleSave = useCallback(async (newContent: string) => {
    if (!filePath) return
    setIsSaving(true)
    try {
      const result = await window.fs.writeFile(filePath, newContent)
      if (!result.success) {
        throw new Error(result.error || 'Failed to save file')
      }
      setContent(newContent)
      setEditedContent(newContent)
      setIsDirty(false)
      onSaveComplete?.()
    } finally {
      setIsSaving(false)
    }
  }, [filePath, onSaveComplete])

  // Save button handler
  const handleSaveButton = useCallback(async () => {
    if (!filePath || !isDirty || !editedContent) return
    await handleSave(editedContent)
  }, [filePath, isDirty, editedContent, handleSave])

  // Dirty change handler - also tracks the current content for save button
  const handleDirtyChange = useCallback((dirty: boolean, currentContent?: string) => {
    setIsDirty(dirty)
    if (currentContent !== undefined) {
      setEditedContent(currentContent)
    }
  }, [])

  if (!filePath) {
    return (
      <div className="h-full flex items-center justify-center text-text-secondary text-sm">
        Select a file to view
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-text-secondary text-sm">
        Loading...
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-red-400 text-sm">
        {error}
      </div>
    )
  }

  // Get the selected viewer
  const selectedViewer = availableViewers.find(v => v.id === selectedViewerId)

  if (!selectedViewer) {
    return (
      <div className="h-full flex items-center justify-center text-text-secondary text-sm">
        No viewer available for this file type
      </div>
    )
  }

  const fileName = basename(filePath)
  const ViewerComponent = selectedViewer.component

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 p-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-text-primary truncate">
            {fileName}
          </span>
          {isDirty && (
            <button
              onClick={handleSaveButton}
              disabled={isSaving}
              className="px-2 py-0.5 text-xs rounded bg-accent text-white hover:bg-accent/80 transition-colors disabled:opacity-50"
              title="Save (Cmd+S)"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          )}
          <span className="text-xs text-text-secondary truncate">{filePath}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Side-by-side toggle - only show in diff mode */}
          {viewMode === 'diff' && (
            <button
              onClick={() => setDiffSideBySide(!diffSideBySide)}
              className={`p-1.5 rounded transition-colors ${
                diffSideBySide
                  ? 'bg-accent text-white'
                  : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'
              }`}
              title={diffSideBySide ? 'Switch to inline view' : 'Switch to side-by-side view'}
            >
              {/* Side by side icon */}
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="8" height="18" rx="1" />
                <rect x="13" y="3" width="8" height="18" rx="1" />
              </svg>
            </button>
          )}
          {/* Viewer selector icons - includes Diff as a view mode for modified text files */}
          {(availableViewers.length > 1 || canShowDiff) && (
            <div className="flex items-center gap-1 mr-2">
              {availableViewers.map(viewer => (
                <button
                  key={viewer.id}
                  onClick={() => {
                    setSelectedViewerId(viewer.id)
                    setViewMode('latest')
                  }}
                  className={`p-1.5 rounded transition-colors ${
                    selectedViewerId === viewer.id && viewMode === 'latest'
                      ? 'bg-accent text-white'
                      : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'
                  }`}
                  title={viewer.name}
                >
                  {viewer.icon || (
                    <span className="text-xs font-medium w-4 h-4 flex items-center justify-center">
                      {viewer.name.charAt(0)}
                    </span>
                  )}
                </button>
              ))}
              {/* Diff view option for modified text files */}
              {canShowDiff && (
                <button
                  onClick={() => setViewMode('diff')}
                  className={`p-1.5 rounded transition-colors ${
                    viewMode === 'diff'
                      ? 'bg-accent text-white'
                      : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'
                  }`}
                  title="Diff"
                >
                  {/* Git diff/compare icon */}
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="18" cy="18" r="3" />
                    <circle cx="6" cy="6" r="3" />
                    <path d="M6 21V9a9 9 0 0 0 9 9" />
                  </svg>
                </button>
              )}
            </div>
          )}

          {/* Position toggle icons */}
          {onPositionChange && (
            <>
              <button
                onClick={() => onPositionChange('top')}
                className={`p-1 rounded transition-colors ${
                  position === 'top'
                    ? 'bg-accent text-white'
                    : 'hover:bg-bg-tertiary text-text-secondary hover:text-text-primary'
                }`}
                title="Position above agent"
              >
                {/* File on top icon - filled rect on top, empty below */}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="3" width="18" height="8" rx="1" fill="currentColor" />
                  <rect x="3" y="13" width="18" height="8" rx="1" fill="none" />
                </svg>
              </button>
              <button
                onClick={() => onPositionChange('left')}
                className={`p-1 rounded transition-colors ${
                  position === 'left'
                    ? 'bg-accent text-white'
                    : 'hover:bg-bg-tertiary text-text-secondary hover:text-text-primary'
                }`}
                title="Position left of agent"
              >
                {/* File on left icon - filled rect on left, empty on right */}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="3" width="8" height="18" rx="1" fill="currentColor" />
                  <rect x="13" y="3" width="8" height="18" rx="1" fill="none" />
                </svg>
              </button>
            </>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-bg-tertiary text-text-secondary hover:text-text-primary"
              title="Close file"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0">
        {viewMode === 'diff' ? (
          <MonacoDiffViewer
            filePath={filePath}
            originalContent={originalContent}
            modifiedContent={fileStatus === 'deleted' ? '' : content}
            sideBySide={diffSideBySide}
          />
        ) : (
          <ViewerComponent
            filePath={filePath}
            content={content}
            onSave={handleSave}
            onDirtyChange={handleDirtyChange}
            reviewContext={reviewContext}
          />
        )}
      </div>
    </div>
  )
}
