import { useEffect, useState, useCallback } from 'react'
import type { EditorActions } from '../components/fileViewers/types'
import { useFileLoading } from './useFileLoading'
import { useFileDiff } from './useFileDiff'
import { useFileWatcher } from './useFileWatcher'
import type { FileStatus, ViewMode } from '../components/FileViewer'

interface UseFileViewerParams {
  filePath: string | null
  fileStatus?: FileStatus
  directory?: string
  initialViewMode?: ViewMode
  scrollToLine?: number
  searchHighlight?: string
  onSaveComplete?: () => void
  onDirtyStateChange?: (isDirty: boolean) => void
  saveRef?: React.MutableRefObject<(() => Promise<void>) | null>
  diffBaseRef?: string
  diffCurrentRef?: string
}

export function useFileViewer({
  filePath,
  fileStatus,
  directory,
  initialViewMode = 'latest',
  scrollToLine,
  onSaveComplete,
  onDirtyStateChange,
  saveRef,
  diffBaseRef,
  diffCurrentRef,
}: UseFileViewerParams) {
  const canShowDiff = fileStatus === 'modified' || fileStatus === 'deleted' || !!diffBaseRef || !!diffCurrentRef
  const [selectedViewerId, setSelectedViewerId] = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [editedContent, setEditedContent] = useState<string>('')
  const [isSaving, setIsSaving] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('latest')
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

  const { originalContent, diffModifiedContent, isLoadingDiff } = useFileDiff({
    filePath,
    directory,
    canShowDiff,
    viewMode,
    diffBaseRef,
    diffCurrentRef,
  })

  const { fileChangedOnDisk, handleKeepLocalChanges, handleLoadDiskVersion } = useFileWatcher({
    filePath,
    content,
    setContent,
    isDirty,
    onDirtyStateChange,
    setIsDirty,
  })

  // Reset editorActions when file changes
  useEffect(() => {
    setEditorActions(null)
  }, [filePath])

  // Switch to Monaco code view when scrollToLine is set (e.g. from search results)
  useEffect(() => {
    if (scrollToLine && selectedViewerId !== 'monaco') {
      const monacoAvailable = availableViewers.find(v => v.id === 'monaco')
      if (monacoAvailable) {
        setSelectedViewerId('monaco')
      }
    }
  }, [scrollToLine, selectedViewerId, availableViewers])

  // Reset dirty state and set initial view mode when file changes
  useEffect(() => {
    setIsDirty(false)
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

  // Expose save function to parent via ref
  useEffect(() => {
    if (saveRef) {
      saveRef.current = isDirty && editedContent ? () => handleSave(editedContent) : null
    }
    return () => {
      if (saveRef) saveRef.current = null
    }
  }, [saveRef, isDirty, editedContent, handleSave])

  // Save button handler
  const handleSaveButton = useCallback(async () => {
    if (!filePath || !isDirty || !editedContent) return
    await handleSave(editedContent)
  }, [filePath, isDirty, editedContent, handleSave])

  // Dirty change handler - also tracks the current content for save button
  const handleDirtyChange = useCallback((dirty: boolean, currentContent?: string) => {
    setIsDirty(dirty)
    onDirtyStateChange?.(dirty)
    if (currentContent !== undefined) {
      setEditedContent(currentContent)
    }
  }, [onDirtyStateChange])

  const selectedViewer = availableViewers.find(v => v.id === selectedViewerId)

  return {
    // State
    canShowDiff,
    selectedViewerId,
    isDirty,
    isSaving,
    viewMode,
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
    // Actions
    setSelectedViewerId,
    setViewMode,
    setDiffSideBySide,
    setEditorActions,
    handleSave,
    handleSaveButton,
    handleDirtyChange,
    handleKeepLocalChanges,
    handleLoadDiskVersion,
  }
}
