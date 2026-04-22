/**
 * Inline editor for per-repository settings such as default agent and display name.
 */
import { useState, useEffect } from 'react'
import type { AgentConfig } from '../../store/agents'
import type { ManagedRepo, DevcontainerStatus } from '../../../preload/index'
import { IsolationSettings } from '../../shared/components/IsolationSettings'

export function RepoSettingsEditor({
  repo,
  agents,
  onUpdate,
  onClose,
}: {
  repo: ManagedRepo
  agents: AgentConfig[]
  onUpdate: (updates: Partial<Omit<ManagedRepo, 'id'>>) => void
  onClose: () => void
}) {
  const [defaultAgentId, setDefaultAgentId] = useState(repo.defaultAgentId || '')
  const [allowMerge, setAllowMerge] = useState(repo.allowApproveAndMerge ?? true)
  const [isolated, setIsolated] = useState(repo.isolated ?? false)
  const [skipApproval, setSkipApproval] = useState(repo.skipApproval ?? false)
  const [devcontainerStatus, setDevcontainerStatus] = useState<DevcontainerStatus | null>(null)
  const [hasDevcontainerConfigState, setHasDevcontainerConfig] = useState<boolean | null>(null)
  const [initScript, setInitScript] = useState('')
  const [loadingScript, setLoadingScript] = useState(true)
  const [saving, setSaving] = useState(false)
  const [writeAccessError, setWriteAccessError] = useState<string | null>(null)

  useEffect(() => {
    if (isolated) {
      void window.devcontainer.status().then(setDevcontainerStatus)
      // Check main worktree for devcontainer config (rootDir/main/)
      const mainWorktree = `${repo.rootDir}/main`
      void window.devcontainer.hasConfig(mainWorktree).then(setHasDevcontainerConfig)
    }
  }, [isolated, repo.rootDir])

  useEffect(() => {
    if (isolated) {
      void window.devcontainer.status().then(setDevcontainerStatus)
    }
  }, [isolated])

  useEffect(() => {
    async function loadScript() {
      setLoadingScript(true)
      try {
        const script = await window.repos.getInitScript(repo.id)
        setInitScript(script || '')
      } catch {
        setInitScript('')
      }
      setLoadingScript(false)
    }
    void loadScript()
  }, [repo.id])

  const handleSave = async () => {
    setSaving(true)
    try {
      onUpdate({
        defaultAgentId: defaultAgentId || undefined,
        allowApproveAndMerge: allowMerge,
        isolated: isolated || undefined,
        skipApproval: skipApproval || undefined,
      })
      await window.repos.saveInitScript(repo.id, initScript)
      onClose()
    } catch (err) {
      console.error('Failed to save repo settings:', err)
    }
    setSaving(false)
  }

  return (
    <div className="space-y-3">
      <div className="text-sm font-medium text-text-primary">{repo.name}</div>
      <div className="text-xs text-text-secondary font-mono">{repo.rootDir}</div>
      {repo.remoteUrl && (
        <div className="text-xs text-text-secondary font-mono truncate" title={repo.remoteUrl}>{repo.remoteUrl}</div>
      )}

      <div className="space-y-2">
        <label className="text-xs text-text-secondary">Default Agent</label>
        <select
          value={defaultAgentId}
          onChange={(e) => setDefaultAgentId(e.target.value)}
          className="w-full px-3 py-2 bg-bg-secondary border border-border rounded text-sm text-text-primary focus:outline-none focus:border-accent"
        >
          <option value="">No default (ask each time)</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={allowMerge}
            onChange={async (e) => {
              const checked = e.target.checked
              if (checked) {
                setWriteAccessError(null)
                try {
                  const hasAccess = await window.gh.hasWriteAccess(repo.rootDir)
                  if (!hasAccess) {
                    setWriteAccessError('Write access check failed — you may not have permission to merge PRs in this repo.')
                    return
                  }
                } catch {
                  setWriteAccessError('Could not check write access. Is gh CLI installed and authenticated?')
                  return
                }
              }
              setAllowMerge(checked)
              setWriteAccessError(null)
            }}
            className="rounded border-border"
          />
          <span className="text-xs text-text-secondary">Allow "Merge PR" button</span>
        </label>
        {writeAccessError && (
          <div className="text-xs text-red-400 pl-6">{writeAccessError}</div>
        )}
      </div>

      <IsolationSettings
        isolated={isolated} skipApproval={skipApproval}
        dockerStatus={null} devcontainerStatus={devcontainerStatus}
        hasDevcontainerConfig={hasDevcontainerConfigState}
        onIsolatedChange={setIsolated}
        onSkipApprovalChange={setSkipApproval}
        onGenerateDevcontainerConfig={async () => {
          await window.devcontainer.generateDefaultConfig(`${repo.rootDir}/main`)
          setHasDevcontainerConfig(true)
        }}
      />

      <div className="space-y-2">
        <label className="text-xs text-text-secondary">Init Script (runs when session starts)</label>
        {loadingScript ? (
          <div className="text-xs text-text-secondary">Loading...</div>
        ) : (
          <textarea
            value={initScript}
            onChange={(e) => setInitScript(e.target.value)}
            placeholder="# Commands to run when starting a session in this repo&#10;# e.g., source .venv/bin/activate"
            className="w-full px-3 py-2 bg-bg-secondary border border-border rounded text-sm text-text-primary font-mono focus:outline-none focus:border-accent resize-y min-h-[80px]"
            rows={4}
          />
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1.5 bg-accent text-white text-sm rounded hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button
          onClick={onClose}
          className="px-3 py-1.5 bg-bg-tertiary text-text-secondary text-sm rounded hover:text-text-primary transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
