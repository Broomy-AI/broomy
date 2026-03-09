/**
 * Checks for the existence of a `.broomy/output/plan.md` file in a session's directory on mount.
 */
import { useState, useEffect } from 'react'

/**
 * Checks for the existence of `.broomy/output/plan.md` in a session's directory.
 * Runs once on mount / when session changes — no file watcher needed.
 */
export function useIssuePlanDetection(
  sessionId: string | null | undefined,
  directory: string | undefined,
): boolean {
  const [issuePlanExists, setIssuePlanExists] = useState(false)

  useEffect(() => {
    if (!sessionId || !directory) {
      setIssuePlanExists(false)
      return
    }

    const planPath = `${directory}/.broomy/output/plan.md`
    void window.fs.exists(planPath).then(setIssuePlanExists)
  }, [sessionId, directory])

  return issuePlanExists
}
