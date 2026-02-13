import React, { useState, useCallback } from 'react'
import { resolveNavigation, applyPendingNavigation, type NavigationTarget } from '../utils/fileNavigation'

export function useFileNavigation({
  activeSessionId,
  activeSessionSelectedFilePath,
  selectFile,
}: {
  activeSessionId: string | null
  activeSessionSelectedFilePath: string | null
  selectFile: (sessionId: string, filePath: string) => void
}) {
  const [openFileInDiffMode, setOpenFileInDiffMode] = useState(false)
  const [scrollToLine, setScrollToLine] = useState<number | undefined>(undefined)
  const [searchHighlight, setSearchHighlight] = useState<string | undefined>(undefined)
  const [diffBaseRef, setDiffBaseRef] = useState<string | undefined>(undefined)
  const [diffCurrentRef, setDiffCurrentRef] = useState<string | undefined>(undefined)
  const [diffLabel, setDiffLabel] = useState<string | undefined>(undefined)
  const [isFileViewerDirty, setIsFileViewerDirty] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState<NavigationTarget | null>(null)
  const saveCurrentFileRef = React.useRef<(() => Promise<void>) | null>(null)

  // Navigate to a file, checking for unsaved changes first
  const navigateToFile = useCallback((target: NavigationTarget) => {
    if (!activeSessionId) return
    const result = resolveNavigation(target, activeSessionSelectedFilePath, isFileViewerDirty)

    if (result.action === 'update-scroll' || result.action === 'navigate') {
      setOpenFileInDiffMode(result.state.openFileInDiffMode)
      setScrollToLine(result.state.scrollToLine)
      setSearchHighlight(result.state.searchHighlight)
      setDiffBaseRef(result.state.diffBaseRef)
      setDiffCurrentRef(result.state.diffCurrentRef)
      setDiffLabel(result.state.diffLabel)
    }
    if (result.action === 'navigate') {
      selectFile(activeSessionId, result.filePath)
    }
    if (result.action === 'pending') {
      setPendingNavigation(result.target)
    }
  }, [activeSessionId, activeSessionSelectedFilePath, isFileViewerDirty, selectFile])

  const handlePendingSave = useCallback(async () => {
    if (saveCurrentFileRef.current) {
      await saveCurrentFileRef.current()
    }
    if (pendingNavigation && activeSessionId) {
      const { state, filePath } = applyPendingNavigation(pendingNavigation)
      setOpenFileInDiffMode(state.openFileInDiffMode)
      setScrollToLine(state.scrollToLine)
      setSearchHighlight(state.searchHighlight)
      setDiffBaseRef(state.diffBaseRef)
      setDiffCurrentRef(state.diffCurrentRef)
      setDiffLabel(state.diffLabel)
      selectFile(activeSessionId, filePath)
    }
    setPendingNavigation(null)
    setIsFileViewerDirty(false)
  }, [pendingNavigation, activeSessionId, selectFile])

  const handlePendingDiscard = useCallback(() => {
    if (pendingNavigation && activeSessionId) {
      const { state, filePath } = applyPendingNavigation(pendingNavigation)
      setOpenFileInDiffMode(state.openFileInDiffMode)
      setScrollToLine(state.scrollToLine)
      setSearchHighlight(state.searchHighlight)
      setDiffBaseRef(state.diffBaseRef)
      setDiffCurrentRef(state.diffCurrentRef)
      setDiffLabel(state.diffLabel)
      setIsFileViewerDirty(false)
      selectFile(activeSessionId, filePath)
    }
    setPendingNavigation(null)
  }, [pendingNavigation, activeSessionId, selectFile])

  const handlePendingCancel = useCallback(() => {
    setPendingNavigation(null)
  }, [])

  return {
    openFileInDiffMode,
    scrollToLine,
    searchHighlight,
    diffBaseRef,
    diffCurrentRef,
    diffLabel,
    isFileViewerDirty,
    setIsFileViewerDirty,
    pendingNavigation,
    saveCurrentFileRef,
    navigateToFile,
    handlePendingSave,
    handlePendingDiscard,
    handlePendingCancel,
  }
}
