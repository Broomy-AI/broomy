/**
 * Watches for the existence of a `.broomy/output/plan.md` file in a session's directory using filesystem events.
 */
import { useState, useEffect } from 'react'

/**
 * Watches for the existence of `.broomy/output/plan.md` in a session's directory.
 * Uses the same fs.watch + onChange pattern as FileTree for file system events.
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

    // Check initial state
    void window.fs.exists(planPath).then(setIssuePlanExists)

    // Watch directory for changes
    const watcherId = `issue-plan-${sessionId}`
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    void window.fs.watch(watcherId, directory)
    const removeListener = window.fs.onChange(watcherId, () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        void window.fs.exists(planPath).then(setIssuePlanExists)
      }, 500)
    })

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      removeListener()
      void window.fs.unwatch(watcherId)
    }
  }, [sessionId, directory])

  return issuePlanExists
}
