/**
 * Watches a file on disk for external changes and provides conflict resolution when the file is modified outside the editor.
 */
import { useEffect, useCallback, useRef, useState } from 'react'

interface UseFileWatcherParams {
  filePath: string | null
  content: string
  setContent: React.Dispatch<React.SetStateAction<string>>
  isDirty: boolean
  onDirtyStateChange?: (isDirty: boolean) => void
  setIsDirty: (isDirty: boolean) => void
  enabled?: boolean
}

interface UseFileWatcherResult {
  fileChangedOnDisk: boolean
  handleKeepLocalChanges: () => void
  handleLoadDiskVersion: () => Promise<void>
  checkForExternalChanges: () => Promise<boolean>
}

export function useFileWatcher({
  filePath,
  content,
  setContent,
  isDirty,
  onDirtyStateChange,
  setIsDirty,
  enabled = true,
}: UseFileWatcherParams): UseFileWatcherResult {
  const [fileChangedOnDisk, setFileChangedOnDisk] = useState(false)
  const contentRef = useRef(content)
  const isDirtyRef = useRef(isDirty)

  // Keep refs in sync
  useEffect(() => {
    contentRef.current = content
  }, [content])

  useEffect(() => {
    isDirtyRef.current = isDirty
  }, [isDirty])

  // Watch the file directly for external changes
  useEffect(() => {
    if (!filePath || !enabled) return

    const watcherId = `fileviewer-${filePath}`
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    void window.fs.watch(watcherId, filePath)
    const removeListener = window.fs.onChange(watcherId, () => {
      // Debounce to avoid multiple triggers
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        void (async () => {
          try {
            const newContent = await window.fs.readFile(filePath)
            // Only trigger if content actually changed
            if (newContent !== contentRef.current) {
              if (isDirtyRef.current) {
                setFileChangedOnDisk(true)
              } else {
                setContent(newContent)
                contentRef.current = newContent
              }
            }
          } catch {
            // File might have been deleted
          }
        })()
      }, 300)
    })

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      removeListener()
      void window.fs.unwatch(watcherId)
    }
  }, [filePath, enabled])

  // When transitioning from disabled to enabled, check for external changes
  const wasEnabledRef = useRef(enabled)
  useEffect(() => {
    if (enabled && !wasEnabledRef.current && filePath) {
      void checkForExternalChanges()
    }
    wasEnabledRef.current = enabled
  }, [enabled, filePath])

  // Reset fileChangedOnDisk when file changes
  useEffect(() => {
    setFileChangedOnDisk(false)
  }, [filePath])

  // Handle file-changed-on-disk responses
  const handleKeepLocalChanges = useCallback(() => {
    setFileChangedOnDisk(false)
  }, [])

  const handleLoadDiskVersion = useCallback(async () => {
    if (!filePath) return
    try {
      const newContent = await window.fs.readFile(filePath)
      setContent(newContent)
      contentRef.current = newContent
      setIsDirty(false)
      onDirtyStateChange?.(false)
      setFileChangedOnDisk(false)
    } catch {
      setFileChangedOnDisk(false)
    }
  }, [filePath, onDirtyStateChange])

  // Check if the file has changed on disk since we last loaded it.
  // Returns true (and shows the banner) if external changes are detected.
  const checkForExternalChanges = useCallback(async (): Promise<boolean> => {
    if (!filePath) return false
    try {
      const diskContent = await window.fs.readFile(filePath)
      if (diskContent !== contentRef.current) {
        setFileChangedOnDisk(true)
        return true
      }
      return false
    } catch {
      return false
    }
  }, [filePath])

  return { fileChangedOnDisk, handleKeepLocalChanges, handleLoadDiskVersion, checkForExternalChanges }
}
