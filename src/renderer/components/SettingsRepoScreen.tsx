/**
 * Settings sub-screen for a single repository.
 * Embeds RepoSettingsEditor and provides a link to the commands editor.
 */
import type { AgentConfig } from '../store/agents'
import type { ManagedRepo } from '../../preload/index'
import { RepoSettingsEditor } from './RepoSettingsEditor'

interface SettingsRepoScreenProps {
  repo: ManagedRepo
  agents: AgentConfig[]
  onUpdateRepo: (repoId: string, updates: Partial<Omit<ManagedRepo, 'id'>>) => void
  onOpenCommandsEditor: (directory: string) => void
}

export function SettingsRepoScreen({
  repo,
  agents,
  onUpdateRepo,
  onOpenCommandsEditor,
}: SettingsRepoScreenProps) {
  return (
    <div className="space-y-4">
      <RepoSettingsEditor
        repo={repo}
        agents={agents}
        onUpdate={(updates) => onUpdateRepo(repo.id, updates)}
        onClose={() => {/* noop — navigation handles going back */}}
      />

      <div className="border-t border-border pt-4">
        <button
          onClick={() => onOpenCommandsEditor(repo.rootDir)}
          className="w-full flex items-center justify-between p-3 rounded border border-border bg-bg-primary hover:bg-bg-tertiary transition-colors text-left"
          data-testid="edit-commands-link"
        >
          <div>
            <div className="text-sm text-text-primary">Edit Commands</div>
            <div className="text-xs text-text-secondary">
              Configure action buttons shown in source control
            </div>
          </div>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-text-tertiary shrink-0 ml-2"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>
    </div>
  )
}
