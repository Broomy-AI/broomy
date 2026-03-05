/**
 * Hook that polls .broomy/output/review.md for changes and updates state when the file changes on disk.
 * Also resolves `<!-- include: path -->` directives by inlining referenced files.
 */
import { useEffect, useRef } from 'react'

interface PollerOptions {
  reviewFilePath: string
  sessionDirectory: string
  setReviewMarkdown: React.Dispatch<React.SetStateAction<string | null>>
  setWaitingForAgent: React.Dispatch<React.SetStateAction<boolean>>
}

/** Resolve `<!-- include: path -->` directives by loading referenced files */
async function resolveIncludes(content: string, broomyDir: string): Promise<string> {
  const includePattern = /<!--\s*include:\s*(.+?)\s*-->/g
  const matches = [...content.matchAll(includePattern)]

  if (matches.length === 0) return content

  let result = content
  const repoDir = broomyDir.replace(/\/\.broomy$/, '')
  for (const match of matches) {
    const relativePath = match[1]
    // Only allow paths relative to the repo — reject absolute paths and traversal
    if (relativePath.startsWith('/') || relativePath.includes('..')) {
      result = result.replace(match[0], `*Blocked: ${relativePath} (must be relative to repo)*`)
      continue
    }
    const fullPath = `${repoDir}/${relativePath}`

    try {
      const exists = await window.fs.exists(fullPath)
      if (exists) {
        const included = await window.fs.readFile(fullPath)
        result = result.replace(match[0], included)
      } else {
        result = result.replace(match[0], `*Pending: ${relativePath}...*`)
      }
    } catch {
      result = result.replace(match[0], `*Pending: ${relativePath}...*`)
    }
  }

  return result
}

/**
 * Polls review.md for changes every second.
 * Updates reviewMarkdown when the file changes on disk.
 */
export function useReviewFilePoller(options: PollerOptions): void {
  const {
    reviewFilePath, sessionDirectory,
    setReviewMarkdown, setWaitingForAgent,
  } = options

  const lastSeenContentRef = useRef<string | null>(null)
  const lastSeenResolvedRef = useRef<string | null>(null)

  useEffect(() => {
    // Reset refs when session changes to avoid skipping updates for sessions
    // that happen to have identical review content
    lastSeenContentRef.current = null
    lastSeenResolvedRef.current = null

    const broomyDir = `${sessionDirectory}/.broomy`

    const interval = setInterval(() => {
      void (async () => {
        try {
          const exists = await window.fs.exists(reviewFilePath)
          if (exists) {
            const content = await window.fs.readFile(reviewFilePath)

            // Skip if raw content hasn't changed
            if (content === lastSeenContentRef.current) {
              // Still re-resolve includes (sub-files may have appeared)
              const resolved = await resolveIncludes(content, broomyDir)
              if (resolved !== lastSeenResolvedRef.current) {
                lastSeenResolvedRef.current = resolved
                setReviewMarkdown(resolved)
              }
              return
            }

            lastSeenContentRef.current = content
            const resolved = await resolveIncludes(content, broomyDir)
            lastSeenResolvedRef.current = resolved
            setReviewMarkdown(resolved)
            setWaitingForAgent(false)
          } else if (lastSeenContentRef.current !== null) {
            // File was deleted
            lastSeenContentRef.current = null
            lastSeenResolvedRef.current = null
            setReviewMarkdown(null)
          }
        } catch {
          // File may not exist yet or be partially written
        }
      })()
    }, 1000)

    return () => clearInterval(interval)
  }, [reviewFilePath, sessionDirectory, setReviewMarkdown, setWaitingForAgent])
}
