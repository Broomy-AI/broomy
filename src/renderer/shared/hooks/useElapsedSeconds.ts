import { useState, useEffect } from 'react'
import { useSessionStore } from '../../store/sessions'

/**
 * Returns the number of seconds since the given session entered the working
 * state, updated every second. Returns 0 when the session is idle.
 *
 * Note: workingStartTime is runtime-only (not persisted), so the counter
 * resets to 0 if the app reloads while a session is actively running.
 */
export function useElapsedSeconds(sessionId: string): number {
  const workingStartTime = useSessionStore((s) => {
    const sess = s.sessions.find(ss => ss.id === sessionId)
    return sess?.workingStartTime ?? null
  })

  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  useEffect(() => {
    if (!workingStartTime) { setElapsedSeconds(0); return }
    setElapsedSeconds(Math.floor((Date.now() - workingStartTime) / 1000))
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - workingStartTime) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [workingStartTime])

  return elapsedSeconds
}
