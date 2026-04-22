/**
 * Composes file loading, diff fetching, and file watching hooks into a unified file viewer state with save and view mode management.
 */
import { useEffect, useState, useCallback, useRef } from 'react'
import type { EditorActions } from '../viewers/types'
import { useFileLoading } from './useFileLoading'
import { useFileDiff } from './useFileDiff'
import { useFileWatcher } from './useFileWatcher'
import type { FileStatus, ViewMode } from '../FileViewer'
import { isImageFile as isImagePath } from '../viewers/ImageDiffViewer'

interface UseFileViewerParams {
  filePath: string | null
  fileStatus?: FileStatus
  directory?: string
  initialViewMode?: ViewMode
  scrollToLine?: number
  searchHighlight?: string
  onSaveComplete?: () => void
  onDirtyStateChange?: (isDirty: boolean) => void
  onSaveFunctionChange?: (fn: (() => Promise<void>) | null) => void
  diffBaseRef?: string
  diffCurrentRef?: string
  isActive?: boolean
}

export function useFileViewer({
  filePath,
  fileStatus,
  directory,
  initialViewMode = 'latest',
  scrollToLine,
  onSaveComplete,
  onDirtyStateChange,
  onSaveFunctionChange,
  diffBaseRef,
  diffCurrentRef,
  isActive = true,
}: UseFileViewerParams) {
  const [selectedViewerId, setSelectedViewerId] = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [editedContent, setEditedContent] = useState<string>('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('latest')
  const [pendingViewMode, setPendingViewMode] = useState<ViewMode | null>(null)
  const [diffSideBySide, setDiffSideBySide] = useState(true)
  const [editorActions, setEditorActions] = useState<EditorActions | null>(null)

  const { content, setContent, isLoading, error, availableViewers } = useFileLoading({
    filePath,
    fileStatus,
    directory,
    initialViewMode,
    scrollToLine,
    selectedViewerId,
    setSelectedViewerId,
  })

  const primaryViewer = availableViewers.length > 0 ? availableViewers[0] : null
  // Use viewer registry when available, fall back to extension check (avoids stale state during async loading)
  const isImageFile = primaryViewer ? primaryViewer.id === 'image' : (filePath ? isImagePath(filePath) : false)
  const canShowDiff = fileStatus === 'modified' || fileStatus === 'deleted' || !!diffBaseRef || !!diffCurrentRef

  // Text diff only for non-image files; image diffs are handled by ImageDiffViewer
  const canShowTextDiff = canShowDiff && !isImageFile
  const { originalContent, diffModifiedContent, isLoadingDiff } = useFileDiff({
    filePath,
    directory,
    canShowDiff: canShowTextDiff,
    viewMode,
    diffBaseRef,
    diffCurrentRef,
  })

  const { fileChangedOnDisk, handleKeepLocalChanges, handleLoadDiskVersion, checkForExternalChanges } = useFileWatcher({
    filePath,
    content,
    setContent,
    isDirty,
    onDirtyStateChange,
    setIsDirty,
    enabled: isActive,
  })

  // Reset editorActions when file changes
  useEffect(() => {
    setEditorActions(null)
  }, [filePath])

  // Switch to Monaco code view when scrollToLine is set (e.g. from search results)
  // Don't switch away from webview — URLs can't be shown in Monaco
  useEffect(() => {
    if (scrollToLine && selectedViewerId !== 'monaco' && selectedViewerId !== 'webview') {
      const monacoAvailable = availableViewers.find(v => v.id === 'monaco')
      if (monacoAvailable) {
        setSelectedViewerId('monaco')
      }
    }
  }, [scrollToLine, selectedViewerId, availableViewers])

  // Reset view mode when file changes or initialViewMode changes (e.g. clicking same file from source control)
  // Only reset isDirty when the file itself changes, not on view mode changes
  const prevFilePathRef = useRef(filePath)
  useEffect(() => {
    if (prevFilePathRef.current !== filePath) {
      setIsDirty(false)
      prevFilePathRef.current = filePath
    }
    const shouldUseDiffMode = canShowDiff && (fileStatus === 'deleted' || initialViewMode === 'diff')
    setViewMode(shouldUseDiffMode ? 'diff' : 'latest')
  }, [filePath, initialViewMode, canShowDiff, fileStatus])

  // Safety guard: viewMode must never be 'diff' when diffs are unavailable.
  // This catches any race condition or stale state that could leave the viewer
  // stuck showing a diff for a file that has no diff (e.g. after session switch,
  // or navigating from a modified file to a clean file/URL).
  // Computed every render from fresh values — no stale closures possible.
  const effectiveViewMode: ViewMode = (viewMode === 'diff' && !canShowDiff) ? 'latest' : viewMode

  // Save handler (called by editor on Cmd+S)
  // Returns false if the save was aborted due to external changes.
  const handleSave = useCallback(async (newContent: string): Promise<boolean> => {
    if (!filePath) return false
    // Check if the file was modified externally since we loaded it
    const hasExternalChanges = await checkForExternalChanges()
    if (hasExternalChanges) return false
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
      return true
    } finally {
      setIsSaving(false)
    }
  }, [filePath, onSaveComplete, checkForExternalChanges])

  // Expose save function to parent via callback
  useEffect(() => {
    if (onSaveFunctionChange) {
      onSaveFunctionChange(isDirty && editedContent ? async () => { await handleSave(editedContent) } : null)
    }
    return () => {
      if (onSaveFunctionChange) onSaveFunctionChange(null)
    }
  }, [onSaveFunctionChange, isDirty, editedContent, handleSave])

  // Save button handler
  const handleSaveButton = useCallback(async () => {
    if (!filePath || !isDirty || !editedContent) return
    try {
      setSaveError(null)
      await handleSave(editedContent)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
    }
  }, [filePath, isDirty, editedContent, handleSave])

  // Dirty change handler - also tracks the current content for save button
  const handleDirtyChange = useCallback((dirty: boolean, currentContent?: string) => {
    setIsDirty(dirty)
    onDirtyStateChange?.(dirty)
    if (currentContent !== undefined) {
      setEditedContent(currentContent)
    }
  }, [onDirtyStateChange])

  // Guarded view mode switching — prompts to save if dirty
  const requestViewMode = useCallback((mode: ViewMode) => {
    if (isDirty && effectiveViewMode === 'latest' && mode !== 'latest') {
      setPendingViewMode(mode)
    } else {
      setViewMode(mode)
    }
  }, [isDirty, effectiveViewMode])

  const handleViewModeSave = useCallback(async () => {
    if (!filePath || !editedContent) return
    const saved = await handleSave(editedContent)
    if (saved && pendingViewMode) {
      setViewMode(pendingViewMode)
      setPendingViewMode(null)
    }
  }, [filePath, editedContent, handleSave, pendingViewMode])

  const handleViewModeDiscard = useCallback(() => {
    setIsDirty(false)
    onDirtyStateChange?.(false)
    if (pendingViewMode) {
      setViewMode(pendingViewMode)
      setPendingViewMode(null)
    }
  }, [pendingViewMode, onDirtyStateChange])

  const handleViewModeCancel = useCallback(() => {
    setPendingViewMode(null)
  }, [])

  const selectedViewer = availableViewers.find(v => v.id === selectedViewerId)

  return {
    // State
    canShowDiff,
    isImageFile,
    selectedViewerId,
    isDirty,
    isSaving,
    saveError,
    clearSaveError: () => setSaveError(null),
    viewMode: effectiveViewMode,
    diffSideBySide,
    editorActions,
    content,
    isLoading,
    error,
    availableViewers,
    originalContent,
    diffModifiedContent,
    isLoadingDiff,
    fileChangedOnDisk,
    selectedViewer,
    pendingViewMode,
    // Actions
    setSelectedViewerId,
    setViewMode,
    requestViewMode,
    setDiffSideBySide,
    setEditorActions,
    handleSave,
    handleSaveButton,
    handleDirtyChange,
    handleKeepLocalChanges,
    handleLoadDiskVersion,
    handleViewModeSave,
    handleViewModeDiscard,
    handleViewModeCancel,
  }
}
