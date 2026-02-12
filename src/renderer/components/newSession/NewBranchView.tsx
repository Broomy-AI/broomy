import { useState } from 'react'
import { useAgentStore } from '../../store/agents'
import type { ManagedRepo, GitHubIssue } from '../../../preload/index'
import { issueToBranchName } from '../../utils/slugify'

export function NewBranchView({
  repo,
  issue,
  onBack,
  onComplete,
}: {
  repo: ManagedRepo
  issue?: GitHubIssue
  onBack: () => void
  onComplete: (directory: string, agentId: string | null, extra?: { repoId?: string; issueNumber?: number; issueTitle?: string; name?: string }) => void
}) {
  const { agents } = useAgentStore()

  const [branchName, setBranchName] = useState(issue ? issueToBranchName(issue) : '')
  // Use repo's default agent, or fall back to first agent
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(repo.defaultAgentId || agents[0]?.id || null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async () => {
    if (!branchName) return
    setLoading(true)
    setError(null)

    try {
      const mainDir = `${repo.rootDir}/main`
      const worktreePath = `${repo.rootDir}/${branchName}`

      // Pull latest on main first
      await window.git.pull(mainDir)

      // Create worktree with new branch
      const result = await window.git.worktreeAdd(mainDir, worktreePath, branchName, repo.defaultBranch)
      if (!result.success) {
        throw new Error(result.error || 'Failed to create worktree')
      }

      // Push new branch upstream (non-fatal)
      try {
        await window.git.pushNewBranch(worktreePath, branchName)
      } catch {
        // Non-fatal: branch push might fail if no remote access
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
          <div className="text-xs text-red-400 bg-red-400/10 rounded px-3 py-2 whitespace-pre-wrap">{error}</div>
        )}
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
          className="px-4 py-2 text-sm rounded bg-accent text-white hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Creating...' : 'Create Branch'}
        </button>
      </div>
    </>
  )
}
