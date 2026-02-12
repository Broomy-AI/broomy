import { useRepoStore } from '../../store/repos'
import type { ManagedRepo } from '../../../preload/index'

export function HomeView({
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
