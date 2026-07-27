/**
 * View for creating a new branch (optionally from a GitHub issue) and starting a session on it.
 */
import { useState } from 'react'
import { useAgentStore } from '../../../store/agents'
import { useRepoStore } from '../../../store/repos'
import { useSessionStore } from '../../../store/sessions'
import type { ManagedRepo, GitHubIssue } from '../../../../preload/index'
import { issueToBranchName } from '../../../shared/utils/slugify'
import { DialogErrorBanner } from '../../../shared/components/ErrorBanner'
import { AuthSetupSection } from '../../../shared/components/AuthSetupSection'

export function NewBranchView({
  repo,
  issue,
  onBack,
  onComplete,
  onUseExisting,
  onStartBranch,
}: {
  repo: ManagedRepo
  issue?: GitHubIssue
  onBack: () => void
  onComplete: (directory: string, agentId: string | null, extra?: { repoId?: string; issueNumber?: number; issueTitle?: string; issueUrl?: string; name?: string }) => void
  onUseExisting?: (branchName: string) => void
  onStartBranch?: (params: { repo: ManagedRepo; branchName: string; agentId: string | null; issue?: { number: number; title: string; url: string } }) => void
}) {
  const agents = useAgentStore(s => s.agents)
  const ghAvailable = useRepoStore(s => s.ghAvailable)
  const sessions = useSessionStore(s => s.sessions)
  const setActiveSession = useSessionStore(s => s.setActiveSession)

  // Issue-derived sessions default under an `issue/<number>-` prefix so their worktree lands in
  // `<repo>/issue/…` (like the other prefixed worktrees) rather than the repo root. The number
  // keeps the branch unique even when two issues slugify to the same words. Editable by the user.
  const [branchName, setBranchName] = useState(issue ? `issue/${issue.number}-${issueToBranchName(issue)}` : '')
  // Use repo's default agent, or fall back to first agent
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(repo.defaultAgentId || agents[0]?.id || null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [existingSessionId, setExistingSessionId] = useState<string | null>(null)
  const [branchExistsRemote, setBranchExistsRemote] = useState(false)

  const handleCreate = async () => {
    if (!branchName) return

    // Use instant setup path when available
    if (onStartBranch) {
      onStartBranch({
        repo,
        branchName,
        agentId: selectedAgentId,
        issue: issue ? { number: issue.number, title: issue.title, url: issue.url } : undefined,
      })
      return
    }

    // Fallback: inline git operations (legacy path)
    setLoading(true)
    setError(null)
    setExistingSessionId(null)
    setBranchExistsRemote(false)

    try {
      const mainDir = `${repo.rootDir}/main`
      const worktreePath = `${repo.rootDir}/${branchName}`

      // Pull latest on main first
      await window.git.pull(mainDir)

      // Create the worktree for a brand-new branch. This never reuses/clobbers an existing branch
      // or worktree; a collision is terminal and the op has already cleaned up after itself, so we
      // surface it here (reusing the same recovery affordance as a remote collision) without any
      // cleanup of our own.
      const result = await window.git.worktreeAddNewBranch(mainDir, worktreePath, branchName, repo.defaultBranch)
      if (!result.success) {
        // A creation collision is terminal — the op already cleaned up after itself, so just
        // surface the clean message (BRANCH_EXISTS / WORKTREE_PATH_EXISTS) without any cleanup.
        const prefix = ['BRANCH_EXISTS:', 'WORKTREE_PATH_EXISTS:'].find((p) => result.error?.startsWith(p))
        if (prefix) { setError(result.error!.slice(prefix.length)); setLoading(false); return }
        throw new Error(result.error || 'Failed to create worktree')
      }

      // Push new branch upstream to create tracking branch
      const pushResult = await window.git.pushNewBranch(worktreePath, branchName)
      if (!pushResult.success) {
        // Clean up the worktree and local branch we just created
        try {
          await window.git.worktreeRemove(mainDir, worktreePath)
          await window.git.deleteBranch(mainDir, branchName)
        } catch {
          // Best-effort cleanup
        }

        // Check if this is a permission denied error
        if (pushResult.error?.startsWith('NO_WRITE_ACCESS:')) {
          setError(pushResult.error.slice('NO_WRITE_ACCESS:'.length))
          setLoading(false)
          return
        }

        // Check if this is a "branch already exists on remote" error
        if (pushResult.error?.startsWith('BRANCH_EXISTS:')) {
          const existingSession = sessions.find(
            (s) => s.branch === branchName && !s.isArchived &&
              (s.repoId === repo.id || s.directory.startsWith(`${repo.rootDir}/`))
          )
          if (existingSession) {
            setExistingSessionId(existingSession.id)
          } else {
            setBranchExistsRemote(true)
          }
          // Set raw error string (not matched by knownErrors patterns)
          setError(pushResult.error.slice('BRANCH_EXISTS:'.length))
          setLoading(false)
          return
        }

        throw new Error(pushResult.error || 'Failed to push branch to remote')
      }

      // Run init script if exists (non-fatal)
      try {
        const initScript = await window.repos.getInitScript(repo.id)
        if (initScript) {
          await window.shell.exec(initScript, worktreePath)
        }
      } catch {
        // Non-fatal
      }

      onComplete(worktreePath, selectedAgentId, {
        repoId: repo.id,
        issueNumber: issue?.number,
        issueTitle: issue?.title,
        issueUrl: issue?.url,
        name: repo.name,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <button onClick={onBack} className="text-text-secondary hover:text-text-primary transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h2 className="text-lg font-medium text-text-primary">New Branch</h2>
          <p className="text-xs text-text-secondary">{repo.name}</p>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {issue && (
          <div className="rounded border border-accent/30 bg-accent/5 px-3 py-2">
            <div className="text-xs text-text-secondary">Issue #{issue.number}</div>
            <div className="text-sm text-text-primary">{issue.title}</div>
            {issue.labels.length > 0 && (
              <div className="flex gap-1 mt-1">
                {issue.labels.map((label) => (
                  <span key={label} className="text-xs px-1.5 py-0.5 rounded-full bg-accent/20 text-accent">
                    {label}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Branch Name</label>
          <input
            type="text"
            value={branchName}
            onChange={(e) => setBranchName(e.target.value)}
            placeholder="feature/my-feature"
            className="w-full px-3 py-2 text-sm font-mono rounded border border-border bg-bg-primary text-text-primary placeholder-text-secondary focus:outline-none focus:border-accent"
            autoFocus
          />
          <div className="text-xs text-text-secondary mt-1">
            Creates: <span className="font-mono">{repo.rootDir}/{branchName || '...'}/</span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Agent</label>
          <select
            value={selectedAgentId || ''}
            onChange={(e) => setSelectedAgentId(e.target.value || null)}
            className="w-full px-3 py-2 text-sm rounded border border-border bg-bg-primary text-text-primary focus:outline-none focus:border-accent"
          >
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
            <option value="">Shell Only</option>
          </select>
        </div>

        {error && (
          <DialogErrorBanner error={error} onDismiss={() => { setError(null); setExistingSessionId(null); setBranchExistsRemote(false) }} />
        )}

        {existingSessionId && (
          <button
            onClick={() => {
              setActiveSession(existingSessionId)
              onBack()
            }}
            className="w-full px-4 py-2 text-sm rounded border border-accent bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
          >
            Open existing session
          </button>
        )}

        {branchExistsRemote && onUseExisting && (
          <button
            onClick={() => onUseExisting(branchName)}
            className="w-full px-4 py-2 text-sm rounded border border-accent bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
          >
            Use existing branch instead
          </button>
        )}

        <AuthSetupSection error={error} ghAvailable={ghAvailable} onRetry={handleCreate} retryLabel="Retry Create Branch" />
      </div>

      <div className="px-4 py-3 border-t border-border flex justify-end gap-2">
        <button
          onClick={onBack}
          className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleCreate}
          disabled={!branchName || loading}
          className="px-4 py-2 text-sm rounded bg-accent text-on-accent hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Creating...' : 'Create Branch'}
        </button>
      </div>
    </>
  )
}
