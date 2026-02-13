import type { AgentConfig } from '../store/agents'
import type { ManagedRepo } from '../../preload/index'
import { RepoSettingsEditor } from './RepoSettingsEditor'

interface AgentSettingsRepoTabProps {
  repos: ManagedRepo[]
  agents: AgentConfig[]
  editingRepoId: string | null
  onEditRepo: (repoId: string) => void
  onUpdateRepo: (repoId: string, updates: Partial<Omit<ManagedRepo, 'id'>>) => void
  onCloseRepoEditor: () => void
}

export function AgentSettingsRepoTab({
  repos,
  agents,
  editingRepoId,
  onEditRepo,
  onUpdateRepo,
  onCloseRepoEditor,
}: AgentSettingsRepoTabProps) {
  if (repos.length === 0) return null

  return (
    <>
      <div className="mt-8 mb-4 border-t border-border pt-4">
        <h3 className="text-sm font-medium text-text-primary mb-3">Repositories</h3>
      </div>

      <div className="space-y-2">
        {repos.map((repo) => (
          <div
            key={repo.id}
            className={`p-3 rounded border transition-colors ${
              editingRepoId === repo.id
                ? 'border-accent bg-bg-tertiary'
                : 'border-border bg-bg-primary hover:bg-bg-tertiary'
            }`}
          >
            {editingRepoId === repo.id ? (
              <RepoSettingsEditor
                repo={repo}
                agents={agents}
                onUpdate={(updates) => {
                  onUpdateRepo(repo.id, updates)
                }}
                onClose={onCloseRepoEditor}
              />
            ) : (
              <RepoRow
                repo={repo}
                agents={agents}
                onEdit={onEditRepo}
              />
            )}
          </div>
        ))}
      </div>
    </>
  )
}

function RepoRow({
  repo,
  agents,
  onEdit,
}: {
  repo: ManagedRepo
  agents: AgentConfig[]
  onEdit: (repoId: string) => void
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="font-medium text-sm text-text-primary">
          {repo.name}
        </div>
        <div className="text-xs text-text-secondary font-mono">
          {repo.rootDir}
        </div>
        {repo.defaultAgentId && (
          <div className="text-xs text-text-secondary mt-1">
            Default: {agents.find((a) => a.id === repo.defaultAgentId)?.name || 'Unknown'}
          </div>
        )}
      </div>
      <button
        onClick={() => onEdit(repo.id)}
        className="p-1.5 text-text-secondary hover:text-text-primary transition-colors"
        title="Edit repo settings"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>
    </div>
  )
}
