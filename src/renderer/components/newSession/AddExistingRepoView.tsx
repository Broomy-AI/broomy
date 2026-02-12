import { useState } from 'react'
import { useAgentStore } from '../../store/agents'
import { useRepoStore } from '../../store/repos'

export function AddExistingRepoView({
  onBack,
  onComplete,
}: {
  onBack: () => void
  onComplete: (directory: string, agentId: string | null, extra?: { repoId?: string; name?: string }) => void
}) {
  const { agents } = useAgentStore()
  const { addRepo } = useRepoStore()

  const [rootDir, setRootDir] = useState('')
  const [repoName, setRepoName] = useState('')
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(agents[0]?.id || null)
  const [worktrees, setWorktrees] = useState<{ path: string; branch: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [validating, setValidating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [validated, setValidated] = useState(false)

  const handleBrowse = async () => {
    const folder = await window.dialog.openFolder()
    if (folder) {
      setRootDir(folder)
      setRepoName(folder.split('/').pop() || '')
      setValidated(false)
      setError(null)
      validateFolder(folder)
    }
  }

  const validateFolder = async (folder: string) => {
    setValidating(true)
    setError(null)
    setWorktrees([])

    try {
      // Check if it's the root of a multi-worktree setup
      // Look for a main/ subdirectory that's a git repo
      const mainDir = `${folder}/main`
      const isMainGitRepo = await window.git.isGitRepo(mainDir)

      if (!isMainGitRepo) {
        // Maybe the folder itself is a git repo?
        const isFolderGitRepo = await window.git.isGitRepo(folder)
        if (isFolderGitRepo) {
          setError('This looks like a single git repo, not a multi-worktree folder. Use "Open Folder" instead, or select the parent folder that contains your worktrees.')
        } else {
          setError('No git repository found. Expected a folder containing worktrees (e.g., main/, feature-x/, etc.)')
        }
        setValidating(false)
        return
      }

      // Get list of worktrees
      const worktreeList = await window.git.worktreeList(mainDir)

      // Verify all worktrees are in this folder
      const validWorktrees = worktreeList.filter(wt => wt.path.startsWith(folder))

      if (validWorktrees.length === 0) {
        setError('No worktrees found in this folder.')
        setValidating(false)
        return
      }

      // Check they're all for the same repo (same remote URL)
      const mainRemote = await window.git.remoteUrl(mainDir)
      let allSameRepo = true

      for (const wt of validWorktrees) {
        if (wt.path === mainDir) continue
        try {
          const wtRemote = await window.git.remoteUrl(wt.path)
          if (wtRemote !== mainRemote) {
            allSameRepo = false
            break
          }
        } catch {
          // Some worktrees might not have remote configured
        }
      }

      if (!allSameRepo) {
        setError('Worktrees in this folder appear to be from different repositories.')
        setValidating(false)
        return
      }

      setWorktrees(validWorktrees.map(wt => ({
        path: wt.path,
        branch: wt.branch,
      })))
      setValidated(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setValidating(false)
    }
  }

  const handleAdd = async () => {
    if (!rootDir || !validated) return
    setLoading(true)
    setError(null)

    try {
      const mainDir = `${rootDir}/main`
      const defaultBranch = await window.git.defaultBranch(mainDir)
      const remoteUrl = await window.git.remoteUrl(mainDir) || ''

      await addRepo({
        name: repoName || rootDir.split('/').pop() || 'unknown',
        remoteUrl,
        rootDir,
        defaultBranch,
        defaultAgentId: selectedAgentId || undefined,
      })

      // Get the repo ID
      const config = await window.config.load()
      const newRepo = config.repos?.find((r: { rootDir: string }) => r.rootDir === rootDir)
      const repoId = newRepo?.id

      onComplete(mainDir, selectedAgentId, { repoId, name: repoName })
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
        <h2 className="text-lg font-medium text-text-primary">Add Existing Repository</h2>
      </div>

      <div className="p-4 space-y-3">
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Repository Folder</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={rootDir}
              onChange={(e) => {
                setRootDir(e.target.value)
                setValidated(false)
              }}
              placeholder="Select folder with worktrees..."
              className="flex-1 px-3 py-2 text-sm rounded border border-border bg-bg-primary text-text-primary focus:outline-none focus:border-accent"
            />
            <button
              onClick={handleBrowse}
              className="px-3 py-2 text-sm rounded border border-border bg-bg-primary hover:bg-bg-tertiary text-text-secondary transition-colors"
            >
              Browse
            </button>
          </div>
          <p className="text-xs text-text-secondary mt-1">
            Select the parent folder containing your worktrees (e.g., ~/repos/my-project with main/, feature-x/, etc.)
          </p>
        </div>

        {validating && (
          <div className="flex items-center gap-2 text-text-secondary text-sm">
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Validating folder structure...
          </div>
        )}

        {validated && worktrees.length > 0 && (
          <>
            <div className="rounded border border-green-500/30 bg-green-500/5 px-3 py-2">
              <div className="text-xs font-medium text-green-400 mb-1">Found {worktrees.length} worktree{worktrees.length !== 1 ? 's' : ''}</div>
              <div className="text-xs text-text-secondary space-y-0.5">
                {worktrees.slice(0, 5).map(wt => (
                  <div key={wt.path} className="font-mono truncate">
                    {wt.branch} → {wt.path.replace(rootDir + '/', '')}
                  </div>
                ))}
                {worktrees.length > 5 && (
                  <div className="text-text-secondary">...and {worktrees.length - 5} more</div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Repository Name</label>
              <input
                type="text"
                value={repoName}
                onChange={(e) => setRepoName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded border border-border bg-bg-primary text-text-primary focus:outline-none focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Default Agent</label>
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
              <p className="text-xs text-text-secondary mt-1">
                This agent will be pre-selected when creating branches in this repo.
              </p>
            </div>
          </>
        )}

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
          onClick={handleAdd}
          disabled={!rootDir || !validated || loading}
          className="px-4 py-2 text-sm rounded bg-accent text-white hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Adding...' : 'Add Repository'}
        </button>
      </div>
    </>
  )
}
