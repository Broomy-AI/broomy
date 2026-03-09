/**
 * Toolbar for the file viewer with save, diff toggle, view mode, and navigation controls.
 */
import { useMemo } from 'react'
import { relative } from 'path-browserify'
import type { EditorActions } from './fileViewers/types'
import type { FileStatus, FileViewerPosition, ViewMode } from './FileViewer'
import type { FileViewerPlugin } from './fileViewers'

/** Build a GitHub PR files URL that filters to a specific file and anchors to its diff */
async function buildPrFileUrl(prUrl: string, relativePath: string): Promise<string> {
  const encoded = new TextEncoder().encode(relativePath)
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded)
  const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')
  return `${prUrl}/files#diff-${hashHex}`
}

interface FileViewerToolbarProps {
  fileName: string
  filePath: string
  directory?: string
  isDirty: boolean
  isSaving: boolean
  viewMode: ViewMode
  diffSideBySide: boolean
  editorActions: EditorActions | null
  availableViewers: FileViewerPlugin[]
  selectedViewerId: string | null
  canShowDiff: boolean
  diffLabel?: string
  fileStatus?: FileStatus
  position: FileViewerPosition
  prFilesUrl?: string
  onOpenFile?: (filePath: string) => void
  onPositionChange?: (position: FileViewerPosition) => void
  onClose?: () => void
  onSaveButton: () => void
  onSetDiffSideBySide: (sideBySide: boolean) => void
  onSelectViewer: (id: string) => void
  onSetViewMode: (mode: ViewMode) => void
}

export default function FileViewerToolbar({
  fileName,
  filePath,
  directory,
  isDirty,
  isSaving,
  viewMode,
  diffSideBySide,
  editorActions,
  availableViewers,
  selectedViewerId,
  canShowDiff,
  diffLabel,
  fileStatus,
  position,
  prFilesUrl,
  onOpenFile,
  onPositionChange,
  onClose,
  onSaveButton,
  onSetDiffSideBySide,
  onSelectViewer,
  onSetViewMode,
}: FileViewerToolbarProps) {
  const relativePath = useMemo(
    () => directory && !/^https?:\/\//.test(filePath) ? relative(directory, filePath) : filePath,
    [directory, filePath],
  )

  const handleOpenOnGithub = useMemo(() => {
    if (!prFilesUrl) return undefined
    return async () => {
      const url = await buildPrFileUrl(prFilesUrl, relativePath)
      if (onOpenFile) {
        onOpenFile(url)
      } else {
        void window.shell.openExternal(url)
      }
    }
  }, [prFilesUrl, relativePath, onOpenFile])

  return (
    <div className="flex-shrink-0 p-3 border-b border-border flex items-center justify-between">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-medium text-text-primary truncate">
          {fileName}
        </span>
        {isDirty && (
          <button
            onClick={onSaveButton}
            disabled={isSaving}
            className="px-2 py-0.5 text-xs rounded bg-accent text-white hover:bg-accent/80 transition-colors disabled:opacity-50"
            title="Save (Cmd+S)"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        )}
        {editorActions && viewMode !== 'diff' && (
          <button
            onClick={() => editorActions.showOutline()}
            className="p-1 rounded hover:bg-bg-tertiary text-text-secondary hover:text-text-primary transition-colors"
            title="Outline (symbol list)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" />
              <line x1="3" y1="12" x2="3.01" y2="12" />
              <line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
          </button>
        )}
        <span className="text-xs text-text-secondary truncate">{relativePath}</span>
        {fileStatus === 'deleted' && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 shrink-0">
            Deleted
          </span>
        )}
        {diffLabel && viewMode === 'diff' && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-bg-tertiary text-text-secondary truncate shrink-0">
            {diffLabel}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {/* Show on GitHub button - prominent in diff mode for review sessions */}
        {handleOpenOnGithub && viewMode === 'diff' && (
          <button
            onClick={() => void handleOpenOnGithub()}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded bg-bg-tertiary border border-border text-text-primary hover:bg-bg-tertiary/80 hover:border-accent/50 transition-colors whitespace-nowrap shrink-0"
            title="Open PR diff on GitHub to add comments"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            Show on GitHub
          </button>
        )}
        {/* Side-by-side toggle - only show in diff mode */}
        {viewMode === 'diff' && (
          <button
            onClick={() => onSetDiffSideBySide(!diffSideBySide)}
            className={`p-1.5 rounded transition-colors ${
              diffSideBySide
                ? 'bg-accent text-white'
                : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'
            }`}
            title={diffSideBySide ? 'Switch to inline view' : 'Switch to side-by-side view'}
          >
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
                  onSelectViewer(viewer.id)
                  onSetViewMode('latest')
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
                onClick={() => onSetViewMode('diff')}
                className={`p-1.5 rounded transition-colors ${
                  viewMode === 'diff'
                    ? 'bg-accent text-white'
                    : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'
                }`}
                title="Diff"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="18" cy="18" r="3" />
                  <circle cx="6" cy="6" r="3" />
                  <path d="M6 21V9a9 9 0 0 0 9 9" />
                </svg>
              </button>
            )}
          </div>
        )}

        {onPositionChange && (
          <PositionToggle position={position} onPositionChange={onPositionChange} />
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
  )
}

function PositionToggle({ position, onPositionChange }: { position: FileViewerPosition; onPositionChange: (p: FileViewerPosition) => void }) {
  return (
    <>
      <button
        onClick={() => onPositionChange('top')}
        className={`p-1 rounded transition-colors ${position === 'top' ? 'bg-accent text-white' : 'hover:bg-bg-tertiary text-text-secondary hover:text-text-primary'}`}
        title="Position above agent"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="8" rx="1" fill="currentColor" />
          <rect x="3" y="13" width="18" height="8" rx="1" fill="none" />
        </svg>
      </button>
      <button
        onClick={() => onPositionChange('left')}
        className={`p-1 rounded transition-colors ${position === 'left' ? 'bg-accent text-white' : 'hover:bg-bg-tertiary text-text-secondary hover:text-text-primary'}`}
        title="Position left of agent"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="8" height="18" rx="1" fill="currentColor" />
          <rect x="13" y="3" width="8" height="18" rx="1" fill="none" />
        </svg>
      </button>
    </>
  )
}
