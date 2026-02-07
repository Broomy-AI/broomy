export interface FileViewerPlugin {
  /** Unique identifier for this viewer */
  id: string
  /** Display name shown in the viewer selector */
  name: string
  /** Icon to display in the viewer selector */
  icon?: React.ReactNode
  /** Check if this viewer can handle the given file path */
  canHandle: (filePath: string) => boolean
  /** Priority when multiple viewers can handle a file (higher = more preferred as default) */
  priority: number
  /** The component to render the file content */
  component: React.ComponentType<FileViewerComponentProps>
}

export interface EditorActions {
  showOutline: () => void
}

export interface FileViewerComponentProps {
  /** The file path to display */
  filePath: string
  /** The file content (already loaded) */
  content: string
  /** Callback when content is modified and should be saved */
  onSave?: (content: string) => Promise<void>
  /** Callback when content is modified (for dirty tracking). Passes current content for external save button. */
  onDirtyChange?: (isDirty: boolean, currentContent?: string) => void
  /** Line number to scroll to */
  scrollToLine?: number
  /** Text to highlight in the file */
  searchHighlight?: string
  /** Review context - present when viewing files in a review session */
  reviewContext?: {
    sessionDirectory: string
    commentsFilePath: string
  }
  /** Callback when editor provides actions (outline, etc.) */
  onEditorReady?: (actions: EditorActions | null) => void
}

/** Get file extension from path */
export function getFileExtension(filePath: string): string {
  return filePath.split('.').pop()?.toLowerCase() || ''
}

/** Check if file matches any of the given extensions */
export function matchesExtensions(filePath: string, extensions: string[]): boolean {
  const ext = getFileExtension(filePath)
  return extensions.includes(ext)
}
