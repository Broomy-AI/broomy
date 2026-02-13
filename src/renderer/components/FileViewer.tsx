/**
 * File content viewer that delegates rendering to a plugin-based viewer registry.
 *
 * Loads file content via IPC, determines available viewers (Monaco, image, markdown)
 * using the fileViewers registry, and renders the selected viewer with a toolbar for
 * switching between viewers and toggling diff mode. Supports latest vs. diff view
 * (comparing against HEAD or a custom base ref), inline editing with dirty-state
 * tracking, save/discard confirmation, file-watcher-driven reload prompts, and
 * scroll-to-line navigation. The diff view uses MonacoDiffViewer with side-by-side
 * or inline layout.
 */
import { basename } from 'path-browserify'
import MonacoDiffViewer from './fileViewers/MonacoDiffViewer'
import FileViewerToolbar from './FileViewerToolbar'
import { useFileViewer } from '../hooks/useFileViewer'

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
  scrollToLine?: number // Line number to scroll to
  searchHighlight?: string // Text to highlight in the file
  onDirtyStateChange?: (isDirty: boolean) => void // Report dirty state to parent
  saveRef?: React.MutableRefObject<(() => Promise<void>) | null> // Ref for parent to trigger save
  diffBaseRef?: string // Git ref to compare against (e.g. 'origin/main' for branch changes)
  diffCurrentRef?: string // Git ref for the "modified" side (e.g. commit hash for commit diffs)
  diffLabel?: string // Label to display in the header (e.g. "abc1234: commit message")
  reviewContext?: { sessionDirectory: string; commentsFilePath: string }
  onOpenFile?: (filePath: string, line?: number) => void // Navigate to a different file (e.g. go-to-definition)
}

export default function FileViewer({ filePath, position = 'top', onPositionChange, onClose, fileStatus, directory, onSaveComplete, initialViewMode = 'latest', scrollToLine, searchHighlight, onDirtyStateChange, saveRef, diffBaseRef, diffCurrentRef, diffLabel, reviewContext, onOpenFile }: FileViewerProps) {
  const viewer = useFileViewer({
    filePath,
    fileStatus,
    directory,
    initialViewMode,
    scrollToLine,
    searchHighlight,
    onSaveComplete,
    onDirtyStateChange,
    saveRef,
    diffBaseRef,
    diffCurrentRef,
  })

  if (!filePath) {
    return (
      <div className="h-full flex items-center justify-center text-text-secondary text-sm">
        Select a file to view
      </div>
    )
  }

  if (viewer.isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-text-secondary text-sm">
        Loading...
      </div>
    )
  }

  if (viewer.error) {
    return (
      <div className="h-full flex items-center justify-center text-red-400 text-sm">
        {viewer.error}
      </div>
    )
  }

  if (!viewer.selectedViewer) {
    return (
      <div className="h-full flex items-center justify-center text-text-secondary text-sm">
        No viewer available for this file type
      </div>
    )
  }

  const fileName = basename(filePath)
  const ViewerComponent = viewer.selectedViewer.component

  return (
    <div className="h-full flex flex-col">
      {/* File changed on disk notification */}
      {viewer.fileChangedOnDisk && (
        <div className="flex-shrink-0 px-3 py-2 bg-yellow-600/20 border-b border-yellow-600/40 flex items-center justify-between">
          <span className="text-xs text-yellow-300">This file has been changed on disk.</span>
          <div className="flex gap-2">
            <button
              onClick={viewer.handleKeepLocalChanges}
              className="px-2 py-0.5 text-xs rounded bg-bg-tertiary text-text-secondary hover:text-text-primary transition-colors"
            >
              Keep my changes
            </button>
            <button
              onClick={viewer.handleLoadDiskVersion}
              className="px-2 py-0.5 text-xs rounded bg-yellow-600/30 text-yellow-300 hover:bg-yellow-600/40 transition-colors"
            >
              Load disk version
            </button>
          </div>
        </div>
      )}
      <FileViewerToolbar
        fileName={fileName}
        filePath={filePath}
        isDirty={viewer.isDirty}
        isSaving={viewer.isSaving}
        viewMode={viewer.viewMode}
        diffSideBySide={viewer.diffSideBySide}
        editorActions={viewer.editorActions}
        availableViewers={viewer.availableViewers}
        selectedViewerId={viewer.selectedViewerId}
        canShowDiff={viewer.canShowDiff}
        diffLabel={diffLabel}
        position={position}
        onPositionChange={onPositionChange}
        onClose={onClose}
        onSaveButton={viewer.handleSaveButton}
        onSetDiffSideBySide={viewer.setDiffSideBySide}
        onSelectViewer={viewer.setSelectedViewerId}
        onSetViewMode={viewer.setViewMode}
      />
      <div className="flex-1 min-h-0">
        {viewer.viewMode === 'diff' ? (
          viewer.isLoadingDiff ? (
            <div className="h-full flex items-center justify-center text-text-secondary text-sm">
              Loading diff...
            </div>
          ) : (
            <MonacoDiffViewer
              filePath={filePath}
              originalContent={viewer.originalContent}
              modifiedContent={viewer.diffModifiedContent !== null ? viewer.diffModifiedContent : (fileStatus === 'deleted' ? '' : viewer.content)}
              sideBySide={viewer.diffSideBySide}
              scrollToLine={scrollToLine}
            />
          )
        ) : (
          <ViewerComponent
            filePath={filePath}
            content={diffCurrentRef ? (viewer.diffModifiedContent ?? viewer.content) : viewer.content}
            onSave={diffCurrentRef ? undefined : viewer.handleSave}
            onDirtyChange={diffCurrentRef ? undefined : viewer.handleDirtyChange}
            scrollToLine={scrollToLine}
            searchHighlight={searchHighlight}
            reviewContext={reviewContext}
            onEditorReady={viewer.setEditorActions}
            onOpenFile={onOpenFile}
          />
        )}
      </div>
    </div>
  )
}
