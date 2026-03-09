/**
 * Shared isolation settings UI for container isolation and auto-approve.
 * Used by RepoSettingsEditor, CloneView, AddExistingRepoView, and RepoSettingsView.
 */
import type { DockerStatus, DevcontainerStatus } from '../../preload/index'

export function IsolationSettings({ isolated, skipApproval, dockerStatus, devcontainerStatus, hasDevcontainerConfig, onIsolatedChange, onSkipApprovalChange, onGenerateDevcontainerConfig }: {
  isolated: boolean
  skipApproval: boolean
  dockerStatus: DockerStatus | null
  devcontainerStatus: DevcontainerStatus | null
  hasDevcontainerConfig: boolean | null
  onIsolatedChange: (v: boolean) => void
  onSkipApprovalChange: (v: boolean) => void
  onGenerateDevcontainerConfig?: () => void
}) {
  return (
    <>
      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={isolated} onChange={(e) => onIsolatedChange(e.target.checked)} className="rounded border-border" />
          <span className="text-xs text-text-secondary">Run agent in isolated container</span>
          <span className="px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">Experimental</span>
        </label>
        {isolated && (
          <div className="ml-6 space-y-2">
            {devcontainerStatus && (
              <div className={`text-xs flex items-center gap-1.5 ${devcontainerStatus.available ? 'text-green-400' : 'text-yellow-400'}`}>
                <span className={`w-2 h-2 rounded-full ${devcontainerStatus.available ? 'bg-green-400' : 'bg-yellow-400'}`} />
                {devcontainerStatus.available
                  ? `devcontainer CLI ${devcontainerStatus.version || ''}`
                  : (devcontainerStatus.error || 'devcontainer CLI not available')
                }
                {!devcontainerStatus.available && (
                  <span className="text-text-secondary ml-1">npm install -g @devcontainers/cli</span>
                )}
              </div>
            )}
            {dockerStatus && (
              <div className={`text-xs flex items-center gap-1.5 ${dockerStatus.available ? 'text-green-400' : 'text-yellow-400'}`}>
                <span className={`w-2 h-2 rounded-full ${dockerStatus.available ? 'bg-green-400' : 'bg-yellow-400'}`} />
                {dockerStatus.available ? 'Docker available' : (dockerStatus.error || 'Docker not available')}
                {!dockerStatus.available && dockerStatus.installUrl && (
                  <button onClick={() => void window.shell.openExternal(dockerStatus.installUrl!)} className="underline hover:text-text-primary transition-colors ml-1">Install</button>
                )}
              </div>
            )}
            {hasDevcontainerConfig !== null && (
              <div className={`text-xs flex items-center gap-1.5 ${hasDevcontainerConfig ? 'text-green-400' : 'text-zinc-500'}`}>
                <span className={`w-2 h-2 rounded-full ${hasDevcontainerConfig ? 'bg-green-400' : 'bg-zinc-500'}`} />
                {hasDevcontainerConfig
                  ? '.devcontainer/devcontainer.json found'
                  : (
                    <>
                      <span>No .devcontainer config found</span>
                      {onGenerateDevcontainerConfig && (
                        <button
                          onClick={onGenerateDevcontainerConfig}
                          className="underline hover:text-text-primary transition-colors ml-1"
                        >
                          Generate default
                        </button>
                      )}
                    </>
                  )
                }
              </div>
            )}
          </div>
        )}
      </div>
      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={skipApproval} onChange={(e) => onSkipApprovalChange(e.target.checked)} className="rounded border-border" />
          <span className="text-xs text-text-secondary">Auto-approve agent commands</span>
        </label>
        {skipApproval && !isolated && (
          <p className="text-xs text-yellow-400 ml-6">
            Warning: Auto-approving without container isolation gives agents unrestricted access to your machine.
            Enable &quot;Run agent in isolated container&quot; above for safe auto-approval.
          </p>
        )}
      </div>
    </>
  )
}
