/**
 * Confirmation dialog for deleting a session, with optional worktree deletion.
 */
import type { Session } from '../../store/sessions'
import type { ManagedRepo } from '../../../preload/index'

export default function DeleteSessionDialog({ session, repos, deleteWorktree, setDeleteWorktree, onConfirm, onCancel }: {
  session: Session; repos: ManagedRepo[]
  deleteWorktree: boolean; setDeleteWorktree: (v: boolean) => void
  onConfirm: () => void; onCancel: () => void
}) {
  const repo = repos.find(r => r.id === session.repoId)
  const isManagedWorktree = !!session.repoId && !!repo && session.branch !== repo.defaultBranch
  const isSafeToDelete = ['closed', 'merged', 'empty'].includes(session.branchStatus) || session.sessionType === 'review'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/50">
      <div role="dialog" className="bg-bg-secondary border border-border rounded-lg shadow-xl p-4 max-w-sm mx-4">
        <h3 className="text-sm font-medium text-text-primary mb-2">Delete Session</h3>
        <p className="text-xs text-text-secondary mb-3">
          Delete session &quot;{session.branch}&quot; ({session.name})?
        </p>
        {isManagedWorktree && (
          <label className="flex items-start gap-2 mb-3 cursor-pointer">
            <input type="checkbox" checked={deleteWorktree} onChange={(e) => setDeleteWorktree(e.target.checked)} className="mt-0.5 accent-accent" />
            <span className="text-xs text-text-primary">Delete worktree and folder</span>
          </label>
        )}
        {isManagedWorktree && deleteWorktree && !isSafeToDelete && (
          <div className="text-xs text-warning-fg bg-warning-fg/10 rounded px-3 py-2 mb-3">
            This session has work in progress. The worktree folder and local branch will be permanently deleted.
          </div>
        )}
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-3 py-1.5 text-xs rounded bg-bg-tertiary text-text-secondary hover:text-text-primary transition-colors">Cancel</button>
          <button onClick={onConfirm} className="px-3 py-1.5 text-xs rounded bg-danger-solid/20 text-danger-fg hover:bg-danger-solid/30 transition-colors">Delete</button>
        </div>
      </div>
    </div>
  )
}
