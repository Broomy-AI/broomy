import { useEffect, useCallback, useRef, useState } from 'react'

interface UseFileWatcherParams {
  filePath: string | null
  content: string
  setContent: React.Dispatch<React.SetStateAction<string>>
  isDirty: boolean
  onDirtyStateChange?: (isDirty: boolean) => void
  setIsDirty: (isDirty: boolean) => void
}

interface UseFileWatcherResult {
  fileChangedOnDisk: boolean
  handleKeepLocalChanges: () => void
  handleLoadDiskVersion: () => Promise<void>
}

export function useFileWatcher({
  filePath,
  content,
  setContent,
  isDirty,
  onDirtyStateChange,
  setIsDirty,
}: UseFileWatcherParams): UseFileWatcherResult {
  const [fileChangedOnDisk, setFileChangedOnDisk] = useState(false)
  const contentRef = useRef(content)

  // Keep contentRef in sync
  useEffect(() => {
    contentRef.current = content
  }, [content])

  // Watch file for external changes
  useEffect(() => {
    if (!filePath) return

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
              if (isDirty) {
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
  }, [filePath, isDirty])

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

  return { fileChangedOnDisk, handleKeepLocalChanges, handleLoadDiskVersion }
}
