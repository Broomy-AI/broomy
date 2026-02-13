import { useState, useEffect } from 'react'
import { useAgentStore } from '../../store/agents'
import type { ManagedRepo, GitHubPrForReview } from '../../../preload/index'

async function createReviewWorktree(repo: ManagedRepo, pr: GitHubPrForReview): Promise<{ worktreePath: string; error?: string }> {
  const mainDir = `${repo.rootDir}/main`
  const branchName = pr.headRefName
  const worktreePath = `${repo.rootDir}/${branchName}`

  // Check if worktree already exists
  const worktrees = await window.git.worktreeList(mainDir)
  const existingWorktree = worktrees.find((wt: { path: string; branch: string }) => wt.branch === branchName)

  if (existingWorktree) {
    // Worktree exists - fetch latest changes before opening
    try {
      await window.git.pullPrBranch(existingWorktree.path, branchName, pr.number)
    } catch {
      // Non-fatal - might not have network
    }
    return { worktreePath: existingWorktree.path }
  }

  // Try to fetch the branch by name first (same-repo PRs get tracking for free)
  const fetchBranchResult = await window.git.fetchBranch(mainDir, branchName)
  const isFork = !fetchBranchResult.success

  if (isFork) {
    // Fork PR - fetch into a named remote-tracking ref so origin/${branchName} exists
    const fetchResult = await window.git.fetchPrHead(mainDir, pr.number, branchName)
    if (!fetchResult.success) {
      return { worktreePath: '', error: fetchResult.error || 'Failed to fetch PR head' }
    }
  }

  // Both cases: origin/${branchName} exists, worktree gets tracking automatically
  const result = await window.git.worktreeAdd(mainDir, worktreePath, branchName, `origin/${branchName}`)
  if (!result.success) {
    return { worktreePath: '', error: result.error || 'Failed to create worktree' }
  }

  // For fork PRs, configure git pull to use the PR ref
  if (isFork) {
    await window.git.setConfig(worktreePath, `branch.${branchName}.remote`, 'origin')
    await window.git.setConfig(worktreePath, `branch.${branchName}.merge`, `refs/pull/${pr.number}/head`)
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

  return { worktreePath }
}

export function ReviewPrsView({
  repo,
  onBack,
  onComplete,
}: {
  repo: ManagedRepo
  onBack: () => void
  onComplete: (directory: string, agentId: string | null, extra?: { repoId?: string; name?: string; sessionType?: 'default' | 'review'; prNumber?: number; prTitle?: string; prUrl?: string; prBaseBranch?: string }) => void
}) {
  const { agents } = useAgentStore()

  const [prs, setPrs] = useState<GitHubPrForReview[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedPr, setSelectedPr] = useState<GitHubPrForReview | null>(null)
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(repo.defaultAgentId || agents[0]?.id || null)

  useEffect(() => {
    const fetchPrs = async () => {
      try {
        const mainDir = `${repo.rootDir}/main`
        const result = await window.gh.prsToReview(mainDir)
        setPrs(result)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    }
    void fetchPrs()
  }, [repo])

  const handleSelectPr = (pr: GitHubPrForReview) => {
    setSelectedPr(pr)
  }

  const handleCreateReviewSession = async () => {
    if (!selectedPr) return
    setCreating(true)
    setError(null)

    try {
      const result = await createReviewWorktree(repo, selectedPr)
      if (result.error) {
        throw new Error(result.error)
      }

      onComplete(result.worktreePath, selectedAgentId, {
        repoId: repo.id,
        name: repo.name,
        sessionType: 'review',
        prNumber: selectedPr.number,
        prTitle: selectedPr.title,
        prUrl: selectedPr.url,
        prBaseBranch: selectedPr.baseRefName,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setCreating(false)
    }
  }

  // PR selected - show confirmation with agent picker
  if (selectedPr) {
    return (
      <>
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <button onClick={() => setSelectedPr(null)} className="text-text-secondary hover:text-text-primary transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h2 className="text-lg font-medium text-text-primary">Review PR</h2>
            <p className="text-xs text-text-secondary">{repo.name}</p>
          </div>
        </div>

        <div className="p-4 space-y-3">
          <div className="rounded border border-purple-500/30 bg-purple-500/5 px-3 py-2">
            <div className="text-xs text-text-secondary">PR #{selectedPr.number} by {selectedPr.author}</div>
            <div className="text-sm text-text-primary">{selectedPr.title}</div>
            <div className="text-xs text-text-secondary mt-1 font-mono">
              {selectedPr.headRefName} &rarr; {selectedPr.baseRefName}
            </div>
            {selectedPr.labels.length > 0 && (
              <div className="flex gap-1 mt-1 flex-wrap">
                {selectedPr.labels.map((label) => (
                  <span key={label} className="text-xs px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-400">
                    {label}
                  </span>
                ))}
              </div>
            )}
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
            onClick={() => setSelectedPr(null)}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreateReviewSession}
            disabled={creating}
            className="px-4 py-2 text-sm rounded bg-purple-600 text-white hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {creating ? 'Setting up...' : 'Start Review'}
          </button>
        </div>
      </>
    )
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
          <h2 className="text-lg font-medium text-text-primary">PRs to Review</h2>
          <p className="text-xs text-text-secondary">{repo.name} &middot; Requested for review</p>
        </div>
      </div>

      <div className="p-4 max-h-80 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-8 text-text-secondary text-sm">
            <svg className="animate-spin w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading PRs...
          </div>
        )}

        {error && (
          <div className="text-xs text-red-400 bg-red-400/10 rounded px-3 py-2 whitespace-pre-wrap">{error}</div>
        )}

        {!loading && !error && prs.length === 0 && (
          <div className="text-center text-text-secondary text-sm py-8">
            No PRs pending your review.
          </div>
        )}

        {!loading && !error && prs.length > 0 && (
          <div className="space-y-1">
            {prs.map((pr) => (
              <button
                key={pr.number}
                onClick={() => handleSelectPr(pr)}
                className="w-full flex items-start gap-3 p-2 rounded border border-border bg-bg-primary hover:bg-bg-tertiary hover:border-purple-500/50 transition-colors text-left"
              >
                <span className="text-purple-400 font-mono text-xs mt-0.5 flex-shrink-0">#{pr.number}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-text-primary">{pr.title}</div>
                  <div className="text-xs text-text-secondary mt-0.5">by {pr.author}</div>
                  {pr.labels.length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {pr.labels.map((label) => (
                        <span key={label} className="text-xs px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-400">
                          {label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="px-4 py-3 border-t border-border flex justify-end">
        <button
          onClick={onBack}
          className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          Cancel
        </button>
      </div>
    </>
  )
}
