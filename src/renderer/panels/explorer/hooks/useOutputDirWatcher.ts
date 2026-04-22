/**
 * Watches `.broomy/output/` in a session's directory.
 * Detects issue plan existence and whether output is gitignored.
 */
import { useState, useEffect, useCallback } from 'react'
import { isOutputGitignored } from '../../../features/commands/commandsConfig'

export interface OutputDirState {
  issuePlanExists: boolean
  suggestGitignore: boolean
  dismissGitignore: () => void
}

/**
 * Watches `.broomy/output/` for changes. Returns issue plan existence
 * and whether we should suggest setting up a gitignore for output files.
 */
export function useOutputDirWatcher(
  sessionId: string | null | undefined,
  directory: string | undefined,
): OutputDirState {
  const [issuePlanExists, setIssuePlanExists] = useState(false)
  const [suggestGitignore, setSuggestGitignore] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  const dismissGitignore = useCallback(() => setDismissed(true), [])

  useEffect(() => {
    if (!sessionId || !directory) {
      setIssuePlanExists(false)
      setSuggestGitignore(false)
      return
    }

    setDismissed(false)

    const planPath = `${directory}/.broomy/output/plan.md`
    const watchDir = `${directory}/.broomy/output`
    const watcherId = `issue-plan-${sessionId}`

    const check = async (filename: string | null) => {
      // Always check plan when relevant
      if (filename === 'plan.md' || filename === null) {
        void window.fs.exists(planPath).then(setIssuePlanExists)
      }

      // Check gitignore suggestion: any file in output dir + not gitignored
      try {
        const dirExists = await window.fs.exists(watchDir)
        if (!dirExists) {
          setSuggestGitignore(false)
          return
        }
        const entries = await window.fs.readDir(watchDir)
        if (entries.length === 0) {
          setSuggestGitignore(false)
          return
        }
        const ignored = await isOutputGitignored(directory)
        setSuggestGitignore(!ignored)
      } catch {
        setSuggestGitignore(false)
      }
    }

    // Initial check
    void check(null)

    // Watch the output directory for changes
    void window.fs.watch(watcherId, watchDir)
    const removeListener = window.fs.onChange(watcherId, (event) => {
      void check(event.filename)
    })

    return () => {
      removeListener()
      void window.fs.unwatch(watcherId)
    }
  }, [sessionId, directory])

  return {
    issuePlanExists,
    suggestGitignore: suggestGitignore && !dismissed,
    dismissGitignore,
  }
}
