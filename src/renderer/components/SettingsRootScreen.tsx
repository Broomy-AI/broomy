/**
 * Root screen of the settings panel showing General settings and navigation rows
 * for Agents and individual repositories.
 */
import type { AgentConfig } from '../store/agents'
import type { ManagedRepo } from '../../preload/index'
import type { ShellOption } from '../../preload/apis/types'

interface SettingsRootScreenProps {
  defaultCloneDir: string
  defaultShell: string | null
  availableShells: ShellOption[]
  agents: AgentConfig[]
  repos: ManagedRepo[]
  onSetDefaultCloneDir: (dir: string) => Promise<void>
  onSetDefaultShell: (shell: string) => void
  onNavigateToAgents: () => void
  onNavigateToRepo: (repoId: string) => void
}

export function SettingsRootScreen({
  defaultCloneDir,
  defaultShell,
  availableShells,
  agents,
  repos,
  onSetDefaultCloneDir,
  onSetDefaultShell,
  onNavigateToAgents,
  onNavigateToRepo,
}: SettingsRootScreenProps) {
  return (
    <div className="space-y-4">
      {/* General section */}
      <h3 className="text-sm font-medium text-text-primary mb-3">General</h3>
      <div className="space-y-2">
        <label className="text-xs text-text-secondary">Default Repo Folder</label>
        <div className="flex gap-2">
          <div className="flex-1 px-3 py-2 text-sm rounded border border-border bg-bg-primary text-text-primary font-mono truncate">
            {defaultCloneDir || '~/repos'}
          </div>
          <button
            onClick={async () => {
              const folder = await window.dialog.openFolder()
              if (folder) await onSetDefaultCloneDir(folder)
            }}
            className="px-3 py-2 text-sm rounded border border-border bg-bg-primary hover:bg-bg-tertiary text-text-secondary transition-colors"
          >
            Browse
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs text-text-secondary">Terminal Shell</label>
        {availableShells.length > 0 ? (
          <select
            value={defaultShell || availableShells.find((s) => s.isDefault)?.path || ''}
            onChange={(e) => onSetDefaultShell(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded border border-border bg-bg-primary text-text-primary font-mono"
          >
            {availableShells.map((s) => (
              <option key={s.path} value={s.path}>
                {s.name}{s.isDefault ? ' (system default)' : ''}
              </option>
            ))}
          </select>
        ) : (
          <div className="px-3 py-2 text-sm rounded border border-border bg-bg-primary text-text-secondary font-mono">
            Detecting shells…
          </div>
        )}
        <p className="text-xs text-text-tertiary">
          Applied to new terminal sessions. Existing sessions are not affected.
        </p>
      </div>

      {/* Agents nav row */}
      <div className="mt-6 border-t border-border pt-4">
        <h3 className="text-sm font-medium text-text-primary mb-3">Agents</h3>
        <button
          onClick={onNavigateToAgents}
          className="w-full flex items-center justify-between p-3 rounded border border-border bg-bg-primary hover:bg-bg-tertiary transition-colors text-left"
          data-testid="nav-agents"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-primary">Manage Agents</span>
            <span className="text-xs text-text-tertiary bg-bg-tertiary px-1.5 py-0.5 rounded-full">
              {agents.length}
            </span>
          </div>
          <ChevronRight />
        </button>
      </div>

      {/* Repositories nav rows */}
      {repos.length > 0 && (
        <div className="mt-6 border-t border-border pt-4">
          <h3 className="text-sm font-medium text-text-primary mb-3">Repositories</h3>
          <div className="space-y-2">
            {repos.map((repo) => (
              <button
                key={repo.id}
                onClick={() => onNavigateToRepo(repo.id)}
                className="w-full flex items-center justify-between p-3 rounded border border-border bg-bg-primary hover:bg-bg-tertiary transition-colors text-left"
                data-testid={`nav-repo-${repo.id}`}
              >
                <div className="min-w-0">
                  <div className="text-sm text-text-primary truncate">{repo.name}</div>
                  <div className="text-xs text-text-secondary font-mono truncate">{repo.rootDir}</div>
                </div>
                <ChevronRight />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ChevronRight() {
  return (
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
  )
}
