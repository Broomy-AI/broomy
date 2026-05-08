/**
 * Reactively check whether the clone location and target folder exist,
 * so the UI can show "this folder will be created" and "target already exists"
 * before the user clicks Clone.
 */
import { useEffect, useState } from 'react'

export type LocationStatus =
  | { kind: 'unknown' }
  | { kind: 'ok' }
  | { kind: 'will-create' }
  | { kind: 'target-exists'; targetPath: string }

export function useLocationStatus(cleanedLocation: string, repoName: string): LocationStatus {
  const [status, setStatus] = useState<LocationStatus>({ kind: 'unknown' })

  useEffect(() => {
    if (!cleanedLocation) {
      setStatus({ kind: 'unknown' })
      return
    }
    const ac = new AbortController()
    const handle = setTimeout(() => {
      void checkPaths(cleanedLocation, repoName, ac.signal, setStatus)
    }, 200)
    return () => {
      ac.abort()
      clearTimeout(handle)
    }
  }, [cleanedLocation, repoName])

  return status
}

async function checkPaths(
  cleanedLocation: string,
  repoName: string,
  signal: AbortSignal,
  setStatus: (s: LocationStatus) => void,
): Promise<void> {
  // Wrap aborted access in a function so the lint rule doesn't infer
  // signal.aborted as a constant within this scope.
  const isAborted = () => signal.aborted
  try {
    const locExists = await window.fs.exists(cleanedLocation)
    if (isAborted()) return
    if (!locExists) {
      setStatus({ kind: 'will-create' })
      return
    }
    if (!repoName) {
      setStatus({ kind: 'ok' })
      return
    }
    const targetPath = `${cleanedLocation}/${repoName}`
    const targetExists = await window.fs.exists(targetPath)
    if (isAborted()) return
    setStatus(targetExists ? { kind: 'target-exists', targetPath } : { kind: 'ok' })
  } catch {
    if (!isAborted()) setStatus({ kind: 'unknown' })
  }
}
