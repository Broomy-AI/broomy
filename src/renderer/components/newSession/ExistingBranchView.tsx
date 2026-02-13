import { useState, useEffect } from 'react'
import { useAgentStore } from '../../store/agents'
import type { ManagedRepo } from '../../../preload/index'
import type { BranchInfo } from './types'

async function fetchBranchList(repo: ManagedRepo): Promise<{ branches: BranchInfo[]; error?: string }> {
  try {
    const mainDir = `${repo.rootDir}/main`

    // Fetch remote to get latest branches
    try {
      await window.git.pull(mainDir)
    } catch {
      // Non-fatal - might not have network
    }

    // Get worktrees
    const worktrees = await window.git.worktreeList(mainDir)
    const worktreeMap = new Map<string, string>()
    for (const wt of worktrees) {
      if (wt.branch) {
        worktreeMap.set(wt.branch, wt.path)
      }
    }

    // Get all branches
    const allBranches = await window.git.listBranches(mainDir)

    // Build branch info list
    const branchInfos: BranchInfo[] = []
    const seenBranches = new Set<string>()

    for (const branch of allBranches) {
      // Clean up remote branch names (origin/main -> main)
      let cleanName = branch.name
      if (branch.isRemote && cleanName.startsWith('origin/')) {
        cleanName = cleanName.replace('origin/', '')
      }

      // Skip if we've already seen this branch
      if (seenBranches.has(cleanName)) continue
      seenBranches.add(cleanName)

      // Skip the default branch (use "Open" button for that)
      if (cleanName === repo.defaultBranch) continue

      const worktreePath = worktreeMap.get(cleanName)

      branchInfos.push({
        name: cleanName,
        hasWorktree: !!worktreePath,
        worktreePath,
        isRemote: branch.isRemote && !worktreePath,
      })
    }

    // Sort: worktrees first, then preserve time order
    branchInfos.sort((a, b) => {
      if (a.hasWorktree && !b.hasWorktree) return -1
      if (!a.hasWorktree && b.hasWorktree) return 1
      return 0
    })

    return { branches: branchInfos }
  } catch (err) {
    return { branches: [], error: err instanceof Error ? err.message : String(err) }
  }
}

async function createWorktreeForBranch(repo: ManagedRepo, branchName: string): Promise<{ worktreePath: string; error?: string }> {
  const mainDir = `${repo.rootDir}/main`
  const worktreePath = `${repo.rootDir}/${branchName}`

  // Create worktree for existing branch (don't create new branch)
  const result = await window.git.worktreeAdd(mainDir, worktreePath, branchName, `origin/${branchName}`)
  if (!result.success) {
    return { worktreePath: '', error: result.error || 'Failed to create worktree' }
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

export function ExistingBranchView({
  repo,
  onBack,
  onComplete,
}: {
  repo: ManagedRepo
  onBack: () => void
  onComplete: (directory: string, agentId: string | null, extra?: { repoId?: string; name?: string }) => void
}) {
  const { agents } = useAgentStore()
  const [branches, setBranches] = useState<BranchInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedBranch, setSelectedBranch] = useState<BranchInfo | null>(null)
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(repo.defaultAgentId || agents[0]?.id || null)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    setLoading(true)
    setError(null)
    void fetchBranchList(repo).then(({ branches: branchList, error: fetchError }) => {
      setBranches(branchList)
      if (fetchError) setError(fetchError)
      setLoading(false)
    })
  }, [repo])

  const handleOpen = (branch: BranchInfo) => {
    if (branch.hasWorktree && branch.worktreePath) {
      onComplete(branch.worktreePath, selectedAgentId, { repoId: repo.id, name: repo.name })
    } else {
      setSelectedBranch(branch)
    }
  }

  const handleCreateWorktree = async () => {
    if (!selectedBranch) return
    setCreating(true)
    setError(null)
    try {
      const result = await createWorktreeForBranch(repo, selectedBranch.name)
      if (result.error) {
        throw new Error(result.error)
      }
      onComplete(result.worktreePath, selectedAgentId, { repoId: repo.id, name: repo.name })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setCreating(false)
    }
  }

  const filteredBranches = searchQuery.trim()
    ? branches.filter(b => b.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : branches
  if (selectedBranch && !selectedBranch.hasWorktree) {
    return (
      <>
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <button onClick={() => setSelectedBranch(null)} className="text-text-secondary hover:text-text-primary transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h2 className="text-lg font-medium text-text-primary">Create Worktree</h2>
            <p className="text-xs text-text-secondary">{repo.name}</p>
          </div>
        </div>

        <div className="p-4 space-y-3">
          <div className="rounded border border-accent/30 bg-accent/5 px-3 py-2">
            <div className="text-sm text-text-primary font-mono">{selectedBranch.name}</div>
            <div className="text-xs text-text-secondary mt-1">
              This branch exists on the remote but doesn't have a local worktree yet.
            </div>
          </div>
          <div className="text-xs text-text-secondary">
            Will create: <span className="font-mono text-text-primary">{repo.rootDir}/{selectedBranch.name}/</span>
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
          <button onClick={() => setSelectedBranch(null)} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors">Cancel</button>
          <button onClick={handleCreateWorktree} disabled={creating} className="px-4 py-2 text-sm rounded bg-accent text-white hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            {creating ? 'Creating...' : 'Create Worktree'}
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
          <h2 className="text-lg font-medium text-text-primary">Existing Branches</h2>
          <p className="text-xs text-text-secondary">{repo.name}</p>
        </div>
      </div>

      <div className="p-4">
        {/* Search */}
        {!loading && branches.length > 0 && (
          <div className="mb-3 relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search branches..."
              className="w-full px-3 py-2 text-sm rounded border border-border bg-bg-primary text-text-primary placeholder-text-secondary focus:outline-none focus:border-accent"
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary text-xs"
              >
                &times;
              </button>
            )}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-8 text-text-secondary text-sm">
            <svg className="animate-spin w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading branches...
          </div>
        )}

        {error && (
          <div className="text-xs text-red-400 bg-red-400/10 rounded px-3 py-2 whitespace-pre-wrap">{error}</div>
        )}

        {!loading && !error && branches.length === 0 && (
          <div className="text-center text-text-secondary text-sm py-8">
            No other branches found. Use "New" to create a branch.
          </div>
        )}

        {!loading && !error && branches.length > 0 && filteredBranches.length === 0 && (
          <div className="text-center text-text-secondary text-sm py-4">
            No branches matching "{searchQuery}"
          </div>
        )}

        {!loading && !error && filteredBranches.length > 0 && (
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {filteredBranches.map((branch) => (
              <button
                key={branch.name}
                onClick={() => handleOpen(branch)}
                className="w-full flex items-center gap-3 p-2 rounded border border-border bg-bg-primary hover:bg-bg-tertiary hover:border-accent transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-mono text-text-primary truncate">{branch.name}</div>
                  <div className="text-xs text-text-secondary">
                    {branch.hasWorktree ? (
                      <span className="text-green-400">Has worktree</span>
                    ) : (
                      <span className="text-yellow-400">Remote only - will create worktree</span>
                    )}
                  </div>
                </div>
                <svg className="w-4 h-4 text-text-secondary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
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
