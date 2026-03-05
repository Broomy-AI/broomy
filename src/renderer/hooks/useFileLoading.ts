/**
 * Loads file content from disk, detects available viewer plugins, and manages loading and error states for the file viewer.
 */
import { useEffect, useState } from 'react'
import { getViewersForFile, isTextContent } from '../components/fileViewers'
import { hasKnownTextExtension } from '../components/fileViewers/MonacoViewer'
import type { FileViewerPlugin } from '../components/fileViewers'
import type { FileStatus, ViewMode } from '../components/FileViewer'

interface UseFileLoadingParams {
  filePath: string | null
  fileStatus?: FileStatus
  directory?: string
  initialViewMode?: ViewMode
  scrollToLine?: number
  selectedViewerId: string | null
  setSelectedViewerId: (id: string | null) => void
}

interface UseFileLoadingResult {
  content: string
  setContent: React.Dispatch<React.SetStateAction<string>>
  isLoading: boolean
  error: string | null
  availableViewers: FileViewerPlugin[]
}

export function useFileLoading({
  filePath,
  fileStatus,
  directory,
  initialViewMode,
  scrollToLine,
  selectedViewerId,
  setSelectedViewerId,
}: UseFileLoadingParams): UseFileLoadingResult {
  const [content, setContent] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [availableViewers, setAvailableViewers] = useState<FileViewerPlugin[]>([])

  useEffect(() => {
    if (!filePath) {
      setContent('')
      setIsLoading(false)
      setError(null)
      setAvailableViewers([])
      setSelectedViewerId(null)
      return
    }

    let cancelled = false
    const isCancelled = () => cancelled

    const loadFile = async () => {
      setIsLoading(true)
      setError(null)

      // URLs don't need file loading - the webview viewer handles them
      if (filePath.startsWith('https://')) {
        const viewers = getViewersForFile(filePath)
        setAvailableViewers(viewers)
        setSelectedViewerId(viewers[0]?.id ?? null)
        setContent('')
        setIsLoading(false)
        return
      }

      // Get viewers that can handle this file based on extension
      let viewers = getViewersForFile(filePath)

      // Check if any non-text viewer (like image) can handle this file
      const hasNonTextViewer = viewers.some(v => v.id === 'image')

      let data = ''
      let readError: Error | null = null

      // Try to read as text (may fail for binary or deleted files)
      try {
        data = await window.fs.readFile(filePath)
      } catch (err) {
        readError = err instanceof Error ? err : new Error('Failed to read file')
      }

      if (isCancelled()) return

      // If file doesn't exist and is deleted, load the old version from git
      if (readError && fileStatus === 'deleted' && directory) {
        try {
          const relativePath = filePath.startsWith(`${directory  }/`)
            ? filePath.slice(directory.length + 1)
            : filePath
          data = await window.git.show(directory, relativePath)
          readError = null
        } catch {
          // Still failed
        }
      }

      if (isCancelled()) return

      // If we couldn't read as text but have a non-text viewer, that's OK
      if (readError && !hasNonTextViewer) {
        setError(readError.message)
        setIsLoading(false)
        return
      }

      setContent(data)

      // Filter viewers based on content
      viewers = viewers.filter(viewer => {
        // Image viewer doesn't need text content
        if (viewer.id === 'image') return true
        // Monaco viewer can handle any text content (including empty files)
        // Skip content check for files with known text extensions
        if (viewer.id === 'monaco') {
          return hasKnownTextExtension(filePath) || isTextContent(data)
        }
        // Other viewers need content
        return !!data
      })

      setAvailableViewers(viewers)

      // Select viewer: prefer Monaco when opening from changes list or search result,
      // but not for non-text files (e.g. images) where Monaco can't meaningfully display content
      if (viewers.length > 0) {
        const primaryIsNonText = viewers[0].id === 'image'
        const currentStillAvailable = viewers.find(v => v.id === selectedViewerId)
        if (!currentStillAvailable || primaryIsNonText) {
          if ((initialViewMode === 'diff' || scrollToLine) && !primaryIsNonText) {
            // When coming from changes list or search result, prefer code view over preview
            const monacoViewer = viewers.find(v => v.id === 'monaco')
            setSelectedViewerId(monacoViewer?.id ?? viewers[0].id)
          } else {
            setSelectedViewerId(viewers[0].id)
          }
        }
      } else {
        setSelectedViewerId(null)
      }

      setIsLoading(false)
    }

    void loadFile()

    return () => {
      cancelled = true
    }
  }, [filePath])

  return { content, setContent, isLoading, error, availableViewers }
}
