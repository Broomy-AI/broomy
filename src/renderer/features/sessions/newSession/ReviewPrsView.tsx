/**
 * View for browsing open pull requests and selecting one to review in a new session.
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAgentStore } from '../../../store/agents'
import { useSessionStore } from '../../../store/sessions'
import type { ManagedRepo, GitHubPrForReview, AgentData } from '../../../../preload/index'
import { DialogErrorBanner } from '../../../shared/components/ErrorBanner'
import { useListKeyboardNav } from './useListKeyboardNav'

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
      await window.git.syncReviewBranch(existingWorktree.path, branchName, pr.number)
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
    const fetchResult = await window.git.fetchReviewPrHead(mainDir, pr.number, branchName)
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

function PrRow({ pr, hasSession, isFocused, onSelect, onMouseEnter }: { key?: string | number | bigint | null; pr: GitHubPrForReview; hasSession: boolean; isFocused: boolean; onSelect: () => void; onMouseEnter: () => void }) {
  return (
    <button
      onClick={onSelect}
      onMouseEnter={onMouseEnter}
      data-pr-row
      className={`w-full flex items-start gap-3 p-2 rounded border transition-colors text-left ${
        isFocused ? 'bg-bg-tertiary border-purple-500/50 ring-1 ring-purple-500/50' : 'border-border bg-bg-primary hover:bg-bg-tertiary hover:border-purple-500/50'
      }`}
    >
      <span className="text-purple-400 font-mono text-xs mt-0.5 flex-shrink-0">#{pr.number}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-text-primary flex items-center gap-2">
          {pr.title}
          {hasSession && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 flex-shrink-0">
              reviewing
            </span>
          )}
        </div>
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
  )
}

function PrConfirmation({ repo, pr, agents, error, creating, onBack, onCreate, onAgentChange, selectedAgentId }: {
  repo: ManagedRepo; pr: GitHubPrForReview; agents: AgentData[]
  error: string | null; creating: boolean
  onBack: () => void; onCreate: () => void; onAgentChange: (id: string | null) => void; selectedAgentId: string | null
}) {
  return (
    <>
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <button onClick={onBack} className="text-text-secondary hover:text-text-primary transition-colors">
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
          <div className="text-xs text-text-secondary">PR #{pr.number} by {pr.author}</div>
          <div className="text-sm text-text-primary">{pr.title}</div>
          <div className="text-xs text-text-secondary mt-1 font-mono">
            {pr.headRefName} &rarr; {pr.baseRefName}
          </div>
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

        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Agent</label>
          <select
            value={selectedAgentId || ''}
            onChange={(e) => onAgentChange(e.target.value || null)}
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
          onClick={onCreate}
          disabled={creating}
          className="px-4 py-2 text-sm rounded bg-purple-600 text-white hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {creating ? 'Setting up...' : 'Start Review'}
        </button>
      </div>
    </>
  )
}

export function ReviewPrsView({
  repo,
  onBack,
  onComplete,
}: {
  repo: ManagedRepo
  onBack: () => void
  onComplete: (directory: string, agentId: string | null, extra?: { repoId?: string; name?: string; sessionType?: 'default' | 'review'; prNumber?: number; prTitle?: string; prUrl?: string; prBaseBranch?: string; lastKnownPrState?: 'OPEN' | 'MERGED' | 'CLOSED' | null }) => void
}) {
  const { agents } = useAgentStore()
  const sessions = useSessionStore((s) => s.sessions)

  // PR numbers that already have an active (non-archived) review session for this repo
  const reviewedPrNumbers = useMemo(() => {
    const nums = new Set<number>()
    for (const s of sessions) {
      if (s.sessionType === 'review' && s.prNumber !== undefined && s.repoId === repo.id) {
        nums.add(s.prNumber)
      }
    }
    return nums
  }, [sessions, repo.id])

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

  const handleSelectPr = useCallback((pr: GitHubPrForReview) => {
    setSelectedPr(pr)
  }, [])

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
        lastKnownPrState: 'OPEN',
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setCreating(false)
    }
  }

  const { focusedIndex, setFocusedIndex, listRef } = useListKeyboardNav({
    items: prs,
    enabled: !selectedPr,
    onSelect: handleSelectPr,
    dataAttribute: 'data-pr-row',
  })

  // PR selected - show confirmation with agent picker
  if (selectedPr) {
    return (
      <PrConfirmation
        repo={repo} pr={selectedPr} agents={agents} error={error} creating={creating}
        selectedAgentId={selectedAgentId}
        onBack={() => setSelectedPr(null)}
        onCreate={handleCreateReviewSession}
        onAgentChange={setSelectedAgentId}
      />
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
          <DialogErrorBanner error={error} onDismiss={() => setError(null)} />
        )}

        {!loading && !error && prs.length === 0 && (
          <div className="text-center text-text-secondary text-sm py-8">
            No PRs pending your review.
          </div>
        )}

        {!loading && !error && prs.length > 0 && (
          <div className="space-y-1" ref={listRef}>
            {prs.map((pr, index) => (
              <PrRow key={pr.number} pr={pr} hasSession={reviewedPrNumbers.has(pr.number)} isFocused={index === focusedIndex} onSelect={() => handleSelectPr(pr)} onMouseEnter={() => setFocusedIndex(index)} />
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
