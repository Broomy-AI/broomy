/**
 * Manages file navigation state including diff mode, scroll-to-line, search highlights, and dirty-file save coordination across sessions.
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import { resolveNavigation, applyPendingNavigation, type NavigationTarget } from '../../../shared/utils/fileNavigation'

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
  const [pendingNavigation, setPendingNavigation] = useState<NavigationTarget | null>(null)

  // Reset diff-related state when switching sessions so diff mode from one
  // session doesn't leak into another.
  //
  // The effect updates the actual state, but consumers see the corrected values
  // immediately via the "effective" return values below (sessionSwitchPending).
  // This eliminates the 1-render window where stale diff state could leak into
  // the new session and cause the file viewer to get stuck in diff mode.
  const prevSessionRef = useRef(activeSessionId)
  const sessionSwitchPending = prevSessionRef.current !== activeSessionId
  useEffect(() => {
    if (prevSessionRef.current !== activeSessionId) {
      prevSessionRef.current = activeSessionId
      setOpenFileInDiffMode(false)
      setDiffBaseRef(undefined)
      setDiffCurrentRef(undefined)
      setDiffLabel(undefined)
    }
  }, [activeSessionId])

  // Per-session dirty state and save function maps
  const dirtyMapRef = useRef<Record<string, boolean>>({})
  const saveMapRef = useRef<Record<string, (() => Promise<void>) | null>>({})

  const setIsFileViewerDirty = useCallback((sessionId: string, dirty: boolean) => {
    dirtyMapRef.current[sessionId] = dirty
  }, [])

  const registerSaveFunction = useCallback((sessionId: string, fn: (() => Promise<void>) | null) => {
    saveMapRef.current[sessionId] = fn
  }, [])

  const unregisterSaveFunction = useCallback((sessionId: string) => {
    saveMapRef.current[sessionId] = null
  }, [])

  // Track the file path that navigateToFile (or pending handlers) set via selectFile,
  // so we can detect when the selected file changes through OTHER paths (e.g., AgentChat
  // calling selectFile directly) and clear stale diff state for those cases.
  const lastNavigatedFileRef = useRef<string | null>(null)

  // Navigate to a file, checking for unsaved changes first
  const navigateToFile = useCallback((target: NavigationTarget) => {
    if (!activeSessionId) return
    const isDirty = dirtyMapRef.current[activeSessionId] ?? false
    const result = resolveNavigation(target, activeSessionSelectedFilePath, isDirty)

    if (result.action === 'update-scroll' || result.action === 'navigate') {
      setOpenFileInDiffMode(result.state.openFileInDiffMode)
      setScrollToLine(result.state.scrollToLine)
      setSearchHighlight(result.state.searchHighlight)
      setDiffBaseRef(result.state.diffBaseRef)
      setDiffCurrentRef(result.state.diffCurrentRef)
      setDiffLabel(result.state.diffLabel)
    }
    if (result.action === 'navigate') {
      lastNavigatedFileRef.current = result.filePath
      selectFile(activeSessionId, result.filePath)
    }
    if (result.action === 'pending') {
      setPendingNavigation(result.target)
    }
  }, [activeSessionId, activeSessionSelectedFilePath, selectFile])

  const handlePendingSave = useCallback(async () => {
    if (activeSessionId) {
      const saveFn = saveMapRef.current[activeSessionId]
      if (saveFn) {
        await saveFn()
      }
    }
    if (pendingNavigation && activeSessionId) {
      const { state, filePath } = applyPendingNavigation(pendingNavigation)
      setOpenFileInDiffMode(state.openFileInDiffMode)
      setScrollToLine(state.scrollToLine)
      setSearchHighlight(state.searchHighlight)
      setDiffBaseRef(state.diffBaseRef)
      setDiffCurrentRef(state.diffCurrentRef)
      setDiffLabel(state.diffLabel)
      lastNavigatedFileRef.current = filePath
      selectFile(activeSessionId, filePath)
    }
    setPendingNavigation(null)
    if (activeSessionId) {
      dirtyMapRef.current[activeSessionId] = false
    }
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
      if (activeSessionId) {
        dirtyMapRef.current[activeSessionId] = false
      }
      lastNavigatedFileRef.current = filePath
      selectFile(activeSessionId, filePath)
    }
    setPendingNavigation(null)
  }, [pendingNavigation, activeSessionId, selectFile])

  // Clear stale diff state when the selected file changes through a path other
  // than navigateToFile (e.g., AgentChat calling selectFile directly).
  // navigateToFile sets diff state atomically with selectFile, so its file changes
  // are excluded via lastNavigatedFileRef.
  const prevSelectedFileRef = useRef(activeSessionSelectedFilePath)
  useEffect(() => {
    if (prevSelectedFileRef.current !== activeSessionSelectedFilePath) {
      prevSelectedFileRef.current = activeSessionSelectedFilePath
      if (lastNavigatedFileRef.current === activeSessionSelectedFilePath) {
        // This file change came from navigateToFile — diff state was set intentionally
        lastNavigatedFileRef.current = null
        return
      }
      lastNavigatedFileRef.current = null
      // File changed without navigateToFile — clear stale diff state
      setOpenFileInDiffMode(false)
      setDiffBaseRef(undefined)
      setDiffCurrentRef(undefined)
      setDiffLabel(undefined)
    }
  }, [activeSessionSelectedFilePath])

  const handlePendingCancel = useCallback(() => {
    setPendingNavigation(null)
  }, [])

  return {
    openFileInDiffMode: sessionSwitchPending ? false : openFileInDiffMode,
    scrollToLine,
    searchHighlight,
    diffBaseRef: sessionSwitchPending ? undefined : diffBaseRef,
    diffCurrentRef: sessionSwitchPending ? undefined : diffCurrentRef,
    diffLabel: sessionSwitchPending ? undefined : diffLabel,
    pendingNavigation,
    navigateToFile,
    handlePendingSave,
    handlePendingDiscard,
    handlePendingCancel,
    setIsFileViewerDirty,
    registerSaveFunction,
    unregisterSaveFunction,
  }
}
