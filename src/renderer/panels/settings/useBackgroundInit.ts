/**
 * Background session initialization — runs git operations after the session
 * is already visible in the sidebar, so the UI feels instant.
 */
import { useCallback, useRef } from 'react'
import { resolveBaseRef } from '../../features/git/baseRef'
import { runRepoInitScript } from '../../features/sessions/runRepoInitScript'

interface BackgroundInitDeps {
  addInitializingSession: (params: { directory: string; branch: string; agentId: string | null; extra?: { repoId?: string; issueNumber?: number; issueTitle?: string; issueUrl?: string; name?: string } }) => string
  finalizeSession: (id: string) => void
  failSession: (id: string, error: string) => void
  setShowNewSessionDialog: (show: boolean) => void
}

function isAborted(signal: AbortSignal): boolean {
  return signal.aborted
}

export function useBackgroundInit({
  addInitializingSession,
  finalizeSession,
  failSession,
  setShowNewSessionDialog,
}: BackgroundInitDeps) {
  const initControllersRef = useRef(new Map<string, AbortController>())

  const handleStartBranchSession = useCallback((params: {
    repo: { id: string; rootDir: string; defaultBranch: string; name?: string }
    branchName: string
    agentId: string | null
    issue?: { number: number; title: string; url: string }
  }) => {
    const { repo, branchName, agentId, issue } = params
    const worktreePath = `${repo.rootDir}/${branchName}`
    const mainDir = `${repo.rootDir}/main`

    const sessionId = addInitializingSession({
      directory: worktreePath,
      branch: branchName,
      agentId,
      extra: {
        repoId: repo.id,
        issueNumber: issue?.number,
        issueTitle: issue?.title,
        issueUrl: issue?.url,
        name: repo.name,
      },
    })

    setShowNewSessionDialog(false)

    const controller = new AbortController()
    initControllersRef.current.set(sessionId, controller)

    void (async () => {
      try {
        const baseRef = await resolveBaseRef(mainDir, repo.defaultBranch)
        if (isAborted(controller.signal)) return

        // Best-effort: keep the main worktree itself up to date too. It aborts
        // if that worktree is dirty or diverged, which must not affect the base
        // the new branch is created from — hence the origin/ ref above.
        await window.git.pull(mainDir)
        if (isAborted(controller.signal)) return

        const result = await window.git.worktreeAdd(mainDir, worktreePath, branchName, baseRef)
        if (!result.success && !result.error?.includes('already exists')) {
          throw new Error(result.error || 'Failed to create worktree')
        }
        if (isAborted(controller.signal)) return

        const pushResult = await window.git.pushNewBranch(worktreePath, branchName)
        if (!pushResult.success) {
          try {
            await window.git.worktreeRemove(mainDir, worktreePath)
            await window.git.deleteBranch(mainDir, branchName)
          } catch {
            // Best-effort cleanup
          }
          throw new Error(pushResult.error || 'Failed to push branch to remote')
        }
        if (isAborted(controller.signal)) return

        await runRepoInitScript(repo, worktreePath, { issue })
        if (isAborted(controller.signal)) return

        finalizeSession(sessionId)
      } catch (err) {
        if (!isAborted(controller.signal)) {
          failSession(sessionId, err instanceof Error ? err.message : String(err))
        }
      } finally {
        initControllersRef.current.delete(sessionId)
      }
    })()
  }, [addInitializingSession, finalizeSession, failSession, setShowNewSessionDialog])

  const handleStartExistingBranchSession = useCallback((params: {
    repo: { id: string; rootDir: string; defaultBranch: string; name?: string }
    branchName: string
    agentId: string | null
  }) => {
    const { repo, branchName, agentId } = params
    const worktreePath = `${repo.rootDir}/${branchName}`
    const mainDir = `${repo.rootDir}/main`

    const sessionId = addInitializingSession({
      directory: worktreePath,
      branch: branchName,
      agentId,
      extra: { repoId: repo.id, name: repo.name },
    })

    setShowNewSessionDialog(false)

    const controller = new AbortController()
    initControllersRef.current.set(sessionId, controller)

    void (async () => {
      try {
        const result = await window.git.worktreeAdd(mainDir, worktreePath, branchName, `origin/${branchName}`)
        if (!result.success) {
          throw new Error(result.error || 'Failed to create worktree')
        }
        if (isAborted(controller.signal)) return

        await runRepoInitScript(repo, worktreePath)
        if (isAborted(controller.signal)) return

        finalizeSession(sessionId)
      } catch (err) {
        if (!isAborted(controller.signal)) {
          failSession(sessionId, err instanceof Error ? err.message : String(err))
        }
      } finally {
        initControllersRef.current.delete(sessionId)
      }
    })()
  }, [addInitializingSession, finalizeSession, failSession, setShowNewSessionDialog])

  const abortInit = useCallback((sessionId: string) => {
    const controller = initControllersRef.current.get(sessionId)
    if (controller) {
      controller.abort()
      initControllersRef.current.delete(sessionId)
    }
  }, [])

  return {
    handleStartBranchSession,
    handleStartExistingBranchSession,
    abortInit,
  }
}
