/**
 * Hook that polls for .broomy/walkthrough.html existence and tracks its last modification.
 */
import { useState, useEffect, useRef } from 'react'

export interface WalkthroughDataState {
  exists: boolean
  lastModified: string | null
  loading: boolean
}

export function useWalkthroughData(directory: string): WalkthroughDataState {
  const [exists, setExists] = useState(false)
  const [lastModified, setLastModified] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const lastContentRef = useRef<string | null>(null)

  useEffect(() => {
    const filePath = `${directory}/.broomy/walkthrough.html`

    const check = async () => {
      try {
        const fileExists = await window.fs.exists(filePath)
        setExists(fileExists)
        if (fileExists) {
          // Read first few bytes to detect changes (use content hash proxy via length)
          const content = await window.fs.readFile(filePath)
          if (content !== lastContentRef.current) {
            lastContentRef.current = content
            setLastModified(new Date().toISOString())
          }
        }
      } catch {
        // Non-fatal
      }
      setLoading(false)
    }

    void check()
    const interval = setInterval(() => { void check() }, 1000)
    return () => clearInterval(interval)
  }, [directory])

  // Reset when directory changes
  useEffect(() => {
    setExists(false)
    setLastModified(null)
    setLoading(true)
    lastContentRef.current = null
  }, [directory])

  return { exists, lastModified, loading }
}
