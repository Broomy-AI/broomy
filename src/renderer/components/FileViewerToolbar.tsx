import type { EditorActions } from './fileViewers/types'
import type { FileViewerPosition, ViewMode } from './FileViewer'
import type { FileViewerPlugin } from './fileViewers'

interface FileViewerToolbarProps {
  fileName: string
  filePath: string
  isDirty: boolean
  isSaving: boolean
  viewMode: ViewMode
  diffSideBySide: boolean
  editorActions: EditorActions | null
  availableViewers: FileViewerPlugin[]
  selectedViewerId: string | null
  canShowDiff: boolean
  diffLabel?: string
  position: FileViewerPosition
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
  isDirty,
  isSaving,
  viewMode,
  diffSideBySide,
  editorActions,
  availableViewers,
  selectedViewerId,
  canShowDiff,
  diffLabel,
  position,
  onPositionChange,
  onClose,
  onSaveButton,
  onSetDiffSideBySide,
  onSelectViewer,
  onSetViewMode,
}: FileViewerToolbarProps) {
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
        <span className="text-xs text-text-secondary truncate">{filePath}</span>
        {diffLabel && viewMode === 'diff' && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-bg-tertiary text-text-secondary truncate shrink-0">
            {diffLabel}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
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
  )
}
