import { useEffect, useState } from 'react'

interface UseFileDiffParams {
  filePath: string | null
  directory?: string
  canShowDiff: boolean
  viewMode: string
  diffBaseRef?: string
  diffCurrentRef?: string
}

interface UseFileDiffResult {
  originalContent: string
  diffModifiedContent: string | null
  isLoadingDiff: boolean
}

export function useFileDiff({
  filePath,
  directory,
  canShowDiff,
  viewMode,
  diffBaseRef,
  diffCurrentRef,
}: UseFileDiffParams): UseFileDiffResult {
  const [originalContent, setOriginalContent] = useState<string>('')
  const [diffModifiedContent, setDiffModifiedContent] = useState<string | null>(null)
  const [isLoadingOriginal, setIsLoadingOriginal] = useState(false)
  const [isLoadingModified, setIsLoadingModified] = useState(false)

  // Load original content from git when in diff mode
  useEffect(() => {
    if (!filePath || !directory || !canShowDiff || viewMode !== 'diff') {
      setOriginalContent('')
      setIsLoadingOriginal(false)
      return
    }

    let cancelled = false
    setIsLoadingOriginal(true)
    const loadOriginal = async () => {
      try {
        // Convert absolute path to relative path for git show
        const relativePath = filePath.startsWith(`${directory  }/`)
          ? filePath.slice(directory.length + 1)
          : filePath
        // Use diffBaseRef if provided (for branch changes), otherwise HEAD (for working changes)
        const original = await window.git.show(directory, relativePath, diffBaseRef || 'HEAD')
        if (!cancelled) setOriginalContent(original)
      } catch {
        if (!cancelled) setOriginalContent('')
      } finally {
        if (!cancelled) setIsLoadingOriginal(false)
      }
    }

    void loadOriginal()
    return () => { cancelled = true }
  }, [filePath, directory, canShowDiff, viewMode, diffBaseRef])

  // Load modified content from git when diffCurrentRef is set (commit diffs)
  useEffect(() => {
    if (!filePath || !directory || !diffCurrentRef || viewMode !== 'diff') {
      setDiffModifiedContent(null)
      setIsLoadingModified(false)
      return
    }

    let cancelled = false
    setIsLoadingModified(true)
    const loadModified = async () => {
      try {
        const relativePath = filePath.startsWith(`${directory  }/`)
          ? filePath.slice(directory.length + 1)
          : filePath
        const modified = await window.git.show(directory, relativePath, diffCurrentRef)
        if (!cancelled) setDiffModifiedContent(modified)
      } catch {
        if (!cancelled) setDiffModifiedContent('')
      } finally {
        if (!cancelled) setIsLoadingModified(false)
      }
    }

    void loadModified()
    return () => { cancelled = true }
  }, [filePath, directory, diffCurrentRef, viewMode])

  const isLoadingDiff = isLoadingOriginal || isLoadingModified

  return { originalContent, diffModifiedContent, isLoadingDiff }
}
