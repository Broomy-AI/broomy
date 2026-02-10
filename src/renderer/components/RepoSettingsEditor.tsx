import { useState, useEffect } from 'react'
import type { AgentConfig } from '../store/agents'
import type { ManagedRepo } from '../../preload/index'

// Repo settings editor component
export function RepoSettingsEditor({
  repo,
  agents,
  onUpdate,
  onClose,
}: {
  repo: ManagedRepo
  agents: AgentConfig[]
  onUpdate: (updates: Partial<Omit<ManagedRepo, 'id'>>) => Promise<void>
  onClose: () => void
}) {
  const [defaultAgentId, setDefaultAgentId] = useState(repo.defaultAgentId || '')
  const [allowPushToMain, setAllowPushToMain] = useState(repo.allowPushToMain ?? false)
  const [initScript, setInitScript] = useState('')
  const [loadingScript, setLoadingScript] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pushToMainError, setPushToMainError] = useState<string | null>(null)

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
    loadScript()
  }, [repo.id])

  const handleSave = async () => {
    setSaving(true)
    try {
      await onUpdate({ defaultAgentId: defaultAgentId || undefined, allowPushToMain })
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
            checked={allowPushToMain}
            onChange={async (e) => {
              const checked = e.target.checked
              if (checked) {
                setPushToMainError(null)
                try {
                  const hasAccess = await window.gh.hasWriteAccess(repo.rootDir)
                  if (!hasAccess) {
                    setPushToMainError('You do not have write access to this repository.')
                    return
                  }
                } catch {
                  setPushToMainError('Failed to check write access. Is gh CLI installed?')
                  return
                }
              }
              setAllowPushToMain(checked)
              setPushToMainError(null)
            }}
            className="rounded border-border"
          />
          <span className="text-xs text-text-secondary">Allow "Push to main" button</span>
        </label>
        {pushToMainError && (
          <div className="text-xs text-red-400">{pushToMainError}</div>
        )}
      </div>

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
