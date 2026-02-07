import { useState, useEffect } from 'react'
import { useAgentStore } from '../store/agents'
import { useRepoStore } from '../store/repos'
import type { ManagedRepo, GitHubIssue, GitHubPrForReview } from '../../preload/index'
import { issueToBranchName } from '../utils/slugify'

type View =
  | { type: 'home' }
  | { type: 'clone' }
  | { type: 'add-existing-repo' }
  | { type: 'new-branch'; repo: ManagedRepo; issue?: GitHubIssue }
  | { type: 'existing-branch'; repo: ManagedRepo }
  | { type: 'repo-settings'; repo: ManagedRepo }
  | { type: 'issues'; repo: ManagedRepo }
  | { type: 'review-prs'; repo: ManagedRepo }
  | { type: 'agent-picker'; directory: string; repoId?: string; repoName?: string }

interface NewSessionDialogProps {
  onComplete: (directory: string, agentId: string | null, extra?: { repoId?: string; issueNumber?: number; issueTitle?: string; name?: string; sessionType?: 'default' | 'review'; prNumber?: number; prTitle?: string; prUrl?: string; prBaseBranch?: string }) => void
  onCancel: () => void
}

export default function NewSessionDialog({ onComplete, onCancel }: NewSessionDialogProps) {
  const [view, setView] = useState<View>({ type: 'home' })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div
        className="bg-bg-secondary rounded-lg shadow-xl border border-border w-full max-w-lg mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {view.type === 'home' && (
          <HomeView
            onClone={() => setView({ type: 'clone' })}
            onAddExistingRepo={() => setView({ type: 'add-existing-repo' })}
            onOpenFolder={async () => {
              const folderPath = await window.dialog.openFolder()
              if (folderPath) {
                setView({ type: 'agent-picker', directory: folderPath })
              }
            }}
            onNewBranch={(repo) => setView({ type: 'new-branch', repo })}
            onExistingBranch={(repo) => setView({ type: 'existing-branch', repo })}
            onRepoSettings={(repo) => setView({ type: 'repo-settings', repo })}
            onIssues={(repo) => setView({ type: 'issues', repo })}
            onReviewPrs={(repo) => setView({ type: 'review-prs', repo })}
            onOpenMain={(repo) => setView({ type: 'agent-picker', directory: repo.rootDir + '/main', repoId: repo.id, repoName: repo.name })}
            onCancel={onCancel}
          />
        )}
        {view.type === 'clone' && (
          <CloneView
            onBack={() => setView({ type: 'home' })}
            onComplete={onComplete}
          />
        )}
        {view.type === 'add-existing-repo' && (
          <AddExistingRepoView
            onBack={() => setView({ type: 'home' })}
            onComplete={onComplete}
          />
        )}
        {view.type === 'new-branch' && (
          <NewBranchView
            repo={view.repo}
            issue={view.issue}
            onBack={() => view.issue ? setView({ type: 'issues', repo: view.repo }) : setView({ type: 'home' })}
            onComplete={onComplete}
          />
        )}
        {view.type === 'existing-branch' && (
          <ExistingBranchView
            repo={view.repo}
            onBack={() => setView({ type: 'home' })}
            onComplete={onComplete}
          />
        )}
        {view.type === 'repo-settings' && (
          <RepoSettingsView
            repo={view.repo}
            onBack={() => setView({ type: 'home' })}
          />
        )}
        {view.type === 'issues' && (
          <IssuesView
            repo={view.repo}
            onBack={() => setView({ type: 'home' })}
            onSelectIssue={(issue) => setView({ type: 'new-branch', repo: view.repo, issue })}
          />
        )}
        {view.type === 'review-prs' && (
          <ReviewPrsView
            repo={view.repo}
            onBack={() => setView({ type: 'home' })}
            onComplete={onComplete}
          />
        )}
        {view.type === 'agent-picker' && (
          <AgentPickerView
            directory={view.directory}
            repoId={view.repoId}
            repoName={view.repoName}
            onBack={() => setView({ type: 'home' })}
            onComplete={onComplete}
          />
        )}
      </div>
    </div>
  )
}

// ─── Home View ───────────────────────────────────────────

function HomeView({
  onClone,
  onAddExistingRepo,
  onOpenFolder,
  onNewBranch,
  onExistingBranch,
  onRepoSettings,
  onIssues,
  onReviewPrs,
  onOpenMain,
  onCancel,
}: {
  onClone: () => void
  onAddExistingRepo: () => void
  onOpenFolder: () => void
  onNewBranch: (repo: ManagedRepo) => void
  onExistingBranch: (repo: ManagedRepo) => void
  onRepoSettings: (repo: ManagedRepo) => void
  onIssues: (repo: ManagedRepo) => void
  onReviewPrs: (repo: ManagedRepo) => void
  onOpenMain: (repo: ManagedRepo) => void
  onCancel: () => void
}) {
  const { repos } = useRepoStore()
  const { ghAvailable } = useRepoStore()

  return (
    <>
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-lg font-medium text-text-primary">New Session</h2>
      </div>

      <div className="p-4 space-y-4">
        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={onClone}
            className="flex-1 flex flex-col items-center justify-center gap-1 p-3 rounded border border-border bg-bg-primary hover:bg-bg-tertiary hover:border-accent transition-colors text-sm font-medium text-text-primary"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Clone
          </button>
          <button
            onClick={onAddExistingRepo}
            className="flex-1 flex flex-col items-center justify-center gap-1 p-3 rounded border border-border bg-bg-primary hover:bg-bg-tertiary hover:border-accent transition-colors text-sm font-medium text-text-primary"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Add Repo
          </button>
          <button
            onClick={onOpenFolder}
            className="flex-1 flex flex-col items-center justify-center gap-1 p-3 rounded border border-border bg-bg-primary hover:bg-bg-tertiary hover:border-accent transition-colors text-sm font-medium text-text-primary"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            Folder
          </button>
        </div>

        {/* Managed repos */}
        {repos.length > 0 && (
          <div>
            <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">Your Repositories</h3>
            <div className="space-y-1">
              {repos.map((repo) => (
                <div
                  key={repo.id}
                  className="flex items-center gap-2 p-2 rounded border border-border bg-bg-primary"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-text-primary truncate">{repo.name}</div>
                    <div className="text-xs text-text-secondary font-mono truncate">{repo.defaultBranch}</div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => onNewBranch(repo)}
                      className="px-2 py-1 text-xs rounded bg-bg-tertiary hover:bg-accent/20 text-text-secondary hover:text-accent transition-colors"
                      title="Create a new branch worktree"
                    >
                      New
                    </button>
                    <button
                      onClick={() => onExistingBranch(repo)}
                      className="px-2 py-1 text-xs rounded bg-bg-tertiary hover:bg-accent/20 text-text-secondary hover:text-accent transition-colors"
                      title="Open an existing branch"
                    >
                      Existing
                    </button>
                    {ghAvailable && (
                      <button
                        onClick={() => onIssues(repo)}
                        className="px-2 py-1 text-xs rounded bg-bg-tertiary hover:bg-accent/20 text-text-secondary hover:text-accent transition-colors"
                        title="Browse GitHub issues"
                      >
                        Issues
                      </button>
                    )}
                    {ghAvailable && (
                      <button
                        onClick={() => onReviewPrs(repo)}
                        className="px-2 py-1 text-xs rounded bg-bg-tertiary hover:bg-purple-500/20 text-text-secondary hover:text-purple-400 transition-colors"
                        title="Review pull requests"
                      >
                        Review
                      </button>
                    )}
                    <button
                      onClick={() => onOpenMain(repo)}
                      className="px-2 py-1 text-xs rounded bg-bg-tertiary hover:bg-accent/20 text-text-secondary hover:text-accent transition-colors"
                      title="Open main branch"
                    >
                      Open
                    </button>
                    <button
                      onClick={() => onRepoSettings(repo)}
                      className="px-1.5 py-1 text-xs rounded bg-bg-tertiary hover:bg-accent/20 text-text-secondary hover:text-accent transition-colors"
                      title="Repository settings"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {repos.length === 0 && (
          <div className="text-center text-text-secondary text-sm py-4">
            No managed repositories yet.
            <br />
            Clone a repository or open an existing folder.
          </div>
        )}
      </div>

      <div className="px-4 py-3 border-t border-border flex justify-end">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          Cancel
        </button>
      </div>
    </>
  )
}

// ─── Clone View ──────────────────────────────────────────

function CloneView({
  onBack,
  onComplete,
}: {
  onBack: () => void
  onComplete: (directory: string, agentId: string | null, extra?: { repoId?: string }) => void
}) {
  const { agents } = useAgentStore()
  const { defaultCloneDir, addRepo } = useRepoStore()

  const [url, setUrl] = useState('')
  const [location, setLocation] = useState(defaultCloneDir)
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(agents[0]?.id || null)
  const [initScript, setInitScript] = useState('')
  const [showInitScript, setShowInitScript] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Derive repo name from URL
  const repoName = url
    .replace(/\.git$/, '')
    .split('/')
    .pop()
    ?.replace(/[^a-zA-Z0-9._-]/g, '') || ''

  const handleClone = async () => {
    if (!url || !location || !repoName) return
    setLoading(true)
    setError(null)

    try {
      const rootDir = `${location}/${repoName}`
      const mainDir = `${rootDir}/main`

      // Clone into rootDir/main/
      const cloneResult = await window.git.clone(url, mainDir)
      if (!cloneResult.success) {
        throw new Error(cloneResult.error || 'Clone failed')
      }

      // Detect default branch and remote URL
      const defaultBranch = await window.git.defaultBranch(mainDir)
      const remoteUrl = await window.git.remoteUrl(mainDir) || url

      // Save managed repo with default agent
      await addRepo({
        name: repoName,
        remoteUrl,
        rootDir,
        defaultBranch,
        defaultAgentId: selectedAgentId || undefined,
      })

      // Get the repo ID that was just created
      const config = await window.config.load()
      const newRepo = config.repos?.find((r: { name: string }) => r.name === repoName)
      const repoId = newRepo?.id

      // Optionally save and run init script
      if (initScript.trim() && repoId) {
        await window.repos.saveInitScript(repoId, initScript)
      }

      onComplete(mainDir, selectedAgentId, { repoId, name: repoName })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const handleBrowseLocation = async () => {
    const folder = await window.dialog.openFolder()
    if (folder) setLocation(folder)
  }

  return (
    <>
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <button onClick={onBack} className="text-text-secondary hover:text-text-primary transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="text-lg font-medium text-text-primary">Clone Repository</h2>
      </div>

      <div className="p-4 space-y-3">
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Repository URL</label>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://github.com/user/repo.git"
            className="w-full px-3 py-2 text-sm rounded border border-border bg-bg-primary text-text-primary placeholder-text-secondary focus:outline-none focus:border-accent"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Location</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="flex-1 px-3 py-2 text-sm rounded border border-border bg-bg-primary text-text-primary focus:outline-none focus:border-accent"
            />
            <button
              onClick={handleBrowseLocation}
              className="px-3 py-2 text-sm rounded border border-border bg-bg-primary hover:bg-bg-tertiary text-text-secondary transition-colors"
            >
              Browse
            </button>
          </div>
        </div>

        {repoName && (
          <div className="text-xs text-text-secondary">
            Will clone to: <span className="font-mono text-text-primary">{location}/{repoName}/main/</span>
          </div>
        )}

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

        <div>
          <button
            onClick={() => setShowInitScript(!showInitScript)}
            className="text-xs text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1"
          >
            <svg className={`w-3 h-3 transition-transform ${showInitScript ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Init Script
          </button>
          {showInitScript && (
            <textarea
              value={initScript}
              onChange={(e) => setInitScript(e.target.value)}
              placeholder="#!/bin/bash&#10;# Runs in each new worktree&#10;cp ../main/.env .env"
              className="w-full mt-1 px-3 py-2 text-xs font-mono rounded border border-border bg-bg-primary text-text-primary placeholder-text-secondary focus:outline-none focus:border-accent resize-y"
              rows={3}
            />
          )}
        </div>

        {error && (
          <div className="text-xs text-red-400 bg-red-400/10 rounded px-3 py-2">{error}</div>
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
          onClick={handleClone}
          disabled={!url || !location || !repoName || loading}
          className="px-4 py-2 text-sm rounded bg-accent text-white hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Cloning...' : 'Clone'}
        </button>
      </div>
    </>
  )
}

// ─── Add Existing Repo View ──────────────────────────────

function AddExistingRepoView({
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
          <div className="text-xs text-red-400 bg-red-400/10 rounded px-3 py-2">{error}</div>
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

// ─── New Branch View ─────────────────────────────────────

function NewBranchView({
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
          <div className="text-xs text-red-400 bg-red-400/10 rounded px-3 py-2">{error}</div>
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

// ─── Existing Branch View ────────────────────────────────

type BranchInfo = {
  name: string
  hasWorktree: boolean
  worktreePath?: string
  isRemote: boolean
}

function ExistingBranchView({
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

  useEffect(() => {
    const fetchBranches = async () => {
      setLoading(true)
      setError(null)

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

        // Sort: worktrees first, then by name
        branchInfos.sort((a, b) => {
          if (a.hasWorktree && !b.hasWorktree) return -1
          if (!a.hasWorktree && b.hasWorktree) return 1
          return a.name.localeCompare(b.name)
        })

        setBranches(branchInfos)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    }

    fetchBranches()
  }, [repo])

  const handleOpen = async (branch: BranchInfo) => {
    if (branch.hasWorktree && branch.worktreePath) {
      // Already has a worktree - just open it
      onComplete(branch.worktreePath, selectedAgentId, { repoId: repo.id, name: repo.name })
    } else {
      // Need to create a worktree
      setSelectedBranch(branch)
    }
  }

  const handleCreateWorktree = async () => {
    if (!selectedBranch) return
    setCreating(true)
    setError(null)

    try {
      const mainDir = `${repo.rootDir}/main`
      const worktreePath = `${repo.rootDir}/${selectedBranch.name}`

      // Create worktree for existing branch (don't create new branch)
      const result = await window.git.worktreeAdd(mainDir, worktreePath, selectedBranch.name, `origin/${selectedBranch.name}`)
      if (!result.success) {
        throw new Error(result.error || 'Failed to create worktree')
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

      onComplete(worktreePath, selectedAgentId, { repoId: repo.id, name: repo.name })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setCreating(false)
    }
  }

  // If we've selected a branch that needs a worktree, show confirmation
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
            <div className="text-xs text-red-400 bg-red-400/10 rounded px-3 py-2">{error}</div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-border flex justify-end gap-2">
          <button
            onClick={() => setSelectedBranch(null)}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreateWorktree}
            disabled={creating}
            className="px-4 py-2 text-sm rounded bg-accent text-white hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
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
          <div className="text-xs text-red-400 bg-red-400/10 rounded px-3 py-2">{error}</div>
        )}

        {!loading && !error && branches.length === 0 && (
          <div className="text-center text-text-secondary text-sm py-8">
            No other branches found. Use "New" to create a branch.
          </div>
        )}

        {!loading && !error && branches.length > 0 && (
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {branches.map((branch) => (
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

// ─── Repo Settings View ──────────────────────────────────

function RepoSettingsView({
  repo,
  onBack,
}: {
  repo: ManagedRepo
  onBack: () => void
}) {
  const { agents } = useAgentStore()
  const { updateRepo, removeRepo } = useRepoStore()

  const [defaultAgentId, setDefaultAgentId] = useState<string | null>(repo.defaultAgentId || null)
  const [initScript, setInitScript] = useState('')
  const [reviewInstructions, setReviewInstructions] = useState(repo.reviewInstructions || '')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Load init script
  useEffect(() => {
    const loadInitScript = async () => {
      try {
        const script = await window.repos.getInitScript(repo.id)
        setInitScript(script || '')
      } catch {
        setInitScript('')
      } finally {
        setLoading(false)
      }
    }
    loadInitScript()
  }, [repo.id])

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)

    try {
      // Update repo default agent and review instructions
      await updateRepo(repo.id, {
        defaultAgentId: defaultAgentId || undefined,
        reviewInstructions: reviewInstructions || undefined,
      })

      // Save init script
      await window.repos.saveInitScript(repo.id, initScript)

      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    const confirmed = await window.menu.popup([
      { id: 'delete', label: `Remove "${repo.name}" from managed repos` },
    ])
    if (confirmed === 'delete') {
      await removeRepo(repo.id)
      onBack()
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
          <h2 className="text-lg font-medium text-text-primary">Repository Settings</h2>
          <p className="text-xs text-text-secondary">{repo.name}</p>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-text-secondary text-sm">
            <svg className="animate-spin w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading...
          </div>
        ) : (
          <>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Repository Path</label>
              <div className="text-sm font-mono text-text-primary bg-bg-tertiary rounded px-3 py-2 truncate">
                {repo.rootDir}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Default Agent</label>
              <select
                value={defaultAgentId || ''}
                onChange={(e) => setDefaultAgentId(e.target.value || null)}
                className="w-full px-3 py-2 text-sm rounded border border-border bg-bg-primary text-text-primary focus:outline-none focus:border-accent"
              >
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
                <option value="">Shell Only</option>
              </select>
              <p className="text-xs text-text-secondary mt-1">
                Pre-selected when creating new branches in this repo.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Init Script</label>
              <textarea
                value={initScript}
                onChange={(e) => setInitScript(e.target.value)}
                placeholder="#!/bin/bash&#10;# Runs in each new worktree&#10;cp ../main/.env .env"
                className="w-full px-3 py-2 text-xs font-mono rounded border border-border bg-bg-primary text-text-primary placeholder-text-secondary focus:outline-none focus:border-accent resize-y"
                rows={5}
              />
              <p className="text-xs text-text-secondary mt-1">
                Script that runs in each new worktree after creation. Useful for copying config files.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Review Instructions</label>
              <textarea
                value={reviewInstructions}
                onChange={(e) => setReviewInstructions(e.target.value)}
                placeholder="Focus on: error handling, test coverage, API design..."
                className="w-full px-3 py-2 text-xs font-mono rounded border border-border bg-bg-primary text-text-primary placeholder-text-secondary focus:outline-none focus:border-accent resize-y"
                rows={3}
              />
              <p className="text-xs text-text-secondary mt-1">
                Custom instructions included when generating AI reviews for PRs in this repo.
              </p>
            </div>

            <div className="pt-2 border-t border-border">
              <button
                onClick={handleDelete}
                className="text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                Remove repository from Broomy
              </button>
              <p className="text-xs text-text-secondary mt-1">
                This won't delete any files, just removes it from Broomy's managed repos list.
              </p>
            </div>
          </>
        )}
      </div>

      <div className="px-4 py-3 border-t border-border flex justify-between items-center">
        <div className="text-xs text-green-400">
          {saved && 'Saved!'}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onBack}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="px-4 py-2 text-sm rounded bg-accent text-white hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </>
  )
}

// ─── Issues View ─────────────────────────────────────────

function IssuesView({
  repo,
  onBack,
  onSelectIssue,
}: {
  repo: ManagedRepo
  onBack: () => void
  onSelectIssue: (issue: GitHubIssue) => void
}) {
  const [issues, setIssues] = useState<GitHubIssue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchIssues = async () => {
      try {
        const mainDir = `${repo.rootDir}/main`
        const result = await window.gh.issues(mainDir)
        setIssues(result)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    }
    fetchIssues()
  }, [repo])

  return (
    <>
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <button onClick={onBack} className="text-text-secondary hover:text-text-primary transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h2 className="text-lg font-medium text-text-primary">Issues</h2>
          <p className="text-xs text-text-secondary">{repo.name} &middot; Assigned to me</p>
        </div>
      </div>

      <div className="p-4 max-h-80 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-8 text-text-secondary text-sm">
            <svg className="animate-spin w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading issues...
          </div>
        )}

        {error && (
          <div className="text-xs text-red-400 bg-red-400/10 rounded px-3 py-2">{error}</div>
        )}

        {!loading && !error && issues.length === 0 && (
          <div className="text-center text-text-secondary text-sm py-8">
            No open issues assigned to you.
          </div>
        )}

        {!loading && !error && issues.length > 0 && (
          <div className="space-y-1">
            {issues.map((issue) => (
              <button
                key={issue.number}
                onClick={() => onSelectIssue(issue)}
                className="w-full flex items-start gap-3 p-2 rounded border border-border bg-bg-primary hover:bg-bg-tertiary hover:border-accent transition-colors text-left"
              >
                <span className="text-accent font-mono text-xs mt-0.5 flex-shrink-0">#{issue.number}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-text-primary">{issue.title}</div>
                  {issue.labels.length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {issue.labels.map((label) => (
                        <span key={label} className="text-xs px-1.5 py-0.5 rounded-full bg-accent/20 text-accent">
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

// ─── Review PRs View ─────────────────────────────────────

function ReviewPrsView({
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
    fetchPrs()
  }, [repo])

  const handleSelectPr = async (pr: GitHubPrForReview) => {
    setSelectedPr(pr)
  }

  const handleCreateReviewSession = async () => {
    if (!selectedPr) return
    setCreating(true)
    setError(null)

    try {
      const mainDir = `${repo.rootDir}/main`
      const branchName = selectedPr.headRefName
      const worktreePath = `${repo.rootDir}/${branchName}`

      // Check if worktree already exists
      const worktrees = await window.git.worktreeList(mainDir)
      const existingWorktree = worktrees.find(wt => wt.branch === branchName)

      if (existingWorktree) {
        // Worktree exists, just open it
        onComplete(existingWorktree.path, selectedAgentId, {
          repoId: repo.id,
          name: repo.name,
          sessionType: 'review',
          prNumber: selectedPr.number,
          prTitle: selectedPr.title,
          prUrl: selectedPr.url,
          prBaseBranch: selectedPr.baseRefName,
        })
        return
      }

      // Fetch the PR head ref (works for both same-repo and fork PRs)
      const fetchResult = await window.git.fetchPrHead(mainDir, selectedPr.number)
      if (!fetchResult.success) {
        throw new Error(fetchResult.error || 'Failed to fetch PR head')
      }

      // Create worktree for the PR branch from FETCH_HEAD
      const result = await window.git.worktreeAdd(mainDir, worktreePath, branchName, 'FETCH_HEAD')
      if (!result.success) {
        throw new Error(result.error || 'Failed to create worktree')
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
            <div className="text-xs text-red-400 bg-red-400/10 rounded px-3 py-2">{error}</div>
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
          <div className="text-xs text-red-400 bg-red-400/10 rounded px-3 py-2">{error}</div>
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

// ─── Agent Picker View ───────────────────────────────────

function AgentPickerView({
  directory,
  repoId,
  repoName,
  onBack,
  onComplete,
}: {
  directory: string
  repoId?: string
  repoName?: string
  onBack: () => void
  onComplete: (directory: string, agentId: string | null, extra?: { repoId?: string; name?: string }) => void
}) {
  const { agents } = useAgentStore()
  const folderName = repoName || directory.split('/').pop() || directory

  return (
    <>
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <button onClick={onBack} className="text-text-secondary hover:text-text-primary transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h2 className="text-lg font-medium text-text-primary">Select Agent</h2>
          <p className="text-xs text-text-secondary font-mono">{folderName}</p>
        </div>
      </div>

      <div className="p-4 space-y-2 max-h-80 overflow-y-auto">
        {agents.map((agent) => (
          <button
            key={agent.id}
            onClick={() => onComplete(directory, agent.id, repoId ? { repoId, name: repoName } : undefined)}
            className="w-full flex items-center gap-3 p-3 rounded border border-border bg-bg-primary hover:bg-bg-tertiary hover:border-accent transition-colors text-left"
          >
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: agent.color || '#4a9eff' }}
            />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm text-text-primary">{agent.name}</div>
              <div className="text-xs text-text-secondary font-mono truncate">{agent.command}</div>
            </div>
          </button>
        ))}

        <button
          onClick={() => onComplete(directory, null, repoId ? { repoId, name: repoName } : undefined)}
          className="w-full flex items-center gap-3 p-3 rounded border border-border bg-bg-primary hover:bg-bg-tertiary hover:border-accent transition-colors text-left"
        >
          <div className="w-3 h-3 rounded-full flex-shrink-0 bg-text-secondary" />
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm text-text-primary">Shell Only</div>
            <div className="text-xs text-text-secondary">No agent, just a terminal</div>
          </div>
        </button>

        {agents.length === 0 && (
          <div className="text-center text-text-secondary text-sm py-4">
            No agents configured. Add agents in Settings.
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
