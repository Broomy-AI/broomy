import { useState, useEffect } from 'react'
import { useAgentStore, type AgentConfig } from '../store/agents'
import { useRepoStore } from '../store/repos'
import type { ManagedRepo } from '../../preload/index'

interface AgentSettingsProps {
  onClose: () => void
}

// Suggested env vars for different commands
const ENV_SUGGESTIONS: Record<string, { key: string; description: string }[]> = {
  claude: [
    { key: 'CLAUDE_CONFIG_DIR', description: 'Config directory (default: ~/.claude)' },
  ],
}

function EnvVarEditor({
  env,
  onChange,
  command,
}: {
  env: Record<string, string>
  onChange: (env: Record<string, string>) => void
  command: string
}) {
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')

  const entries = Object.entries(env)
  const suggestions = ENV_SUGGESTIONS[command] || []
  const unusedSuggestions = suggestions.filter(s => !(s.key in env))

  const handleAdd = () => {
    if (!newKey.trim()) return
    onChange({ ...env, [newKey.trim()]: newValue })
    setNewKey('')
    setNewValue('')
  }

  const handleRemove = (key: string) => {
    const { [key]: _, ...newEnv } = env
    onChange(newEnv)
  }

  const handleChange = (key: string, value: string) => {
    onChange({ ...env, [key]: value })
  }

  const handleAddSuggestion = (key: string) => {
    setNewKey(key)
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-text-secondary">Environment Variables</div>

      {/* Existing env vars */}
      {entries.map(([key, value]) => (
        <div key={key} className="flex gap-2">
          <input
            type="text"
            value={key}
            disabled
            className="w-1/3 px-2 py-1.5 bg-bg-tertiary border border-border rounded text-xs text-text-secondary font-mono"
          />
          <input
            type="text"
            value={value}
            onChange={(e) => handleChange(key, e.target.value)}
            className="flex-1 px-2 py-1.5 bg-bg-secondary border border-border rounded text-xs text-text-primary font-mono focus:outline-none focus:border-accent"
            placeholder="Value"
          />
          <button
            onClick={() => handleRemove(key)}
            className="p-1.5 text-text-secondary hover:text-status-error transition-colors"
            title="Remove"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}

      {/* Add new env var */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          className="w-1/3 px-2 py-1.5 bg-bg-secondary border border-border rounded text-xs text-text-primary font-mono focus:outline-none focus:border-accent"
          placeholder="KEY"
        />
        <input
          type="text"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          className="flex-1 px-2 py-1.5 bg-bg-secondary border border-border rounded text-xs text-text-primary font-mono focus:outline-none focus:border-accent"
          placeholder="value"
        />
        <button
          onClick={handleAdd}
          disabled={!newKey.trim()}
          className="px-2 py-1.5 bg-bg-tertiary text-text-secondary text-xs rounded hover:text-text-primary disabled:opacity-50 transition-colors"
        >
          Add
        </button>
      </div>

      {/* Suggestions */}
      {unusedSuggestions.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {unusedSuggestions.map(suggestion => (
            <button
              key={suggestion.key}
              onClick={() => handleAddSuggestion(suggestion.key)}
              className="px-2 py-0.5 text-xs bg-accent/20 text-accent rounded hover:bg-accent/30 transition-colors"
              title={suggestion.description}
            >
              + {suggestion.key}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Repo settings editor component
function RepoSettingsEditor({
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

export default function AgentSettings({ onClose }: AgentSettingsProps) {
  const { agents, addAgent, updateAgent, removeAgent } = useAgentStore()
  const { repos, loadRepos, updateRepo } = useRepoStore()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingRepoId, setEditingRepoId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)

  // Load repos on mount
  useEffect(() => {
    loadRepos()
  }, [loadRepos])

  // Form state
  const [name, setName] = useState('')
  const [command, setCommand] = useState('')
  const [color, setColor] = useState('')
  const [env, setEnv] = useState<Record<string, string>>({})

  const resetForm = () => {
    setName('')
    setCommand('')
    setColor('')
    setEnv({})
    setShowAddForm(false)
    setEditingId(null)
  }

  const handleAdd = async () => {
    if (!name.trim() || !command.trim()) return

    await addAgent({
      name: name.trim(),
      command: command.trim(),
      color: color.trim() || undefined,
      env: Object.keys(env).length > 0 ? env : undefined,
    })
    resetForm()
  }

  const handleEdit = (agent: AgentConfig) => {
    setEditingId(agent.id)
    setEditingRepoId(null)
    setName(agent.name)
    setCommand(agent.command)
    setColor(agent.color || '')
    setEnv(agent.env || {})
    setShowAddForm(false)
  }

  const handleUpdate = async () => {
    if (!editingId || !name.trim() || !command.trim()) return

    await updateAgent(editingId, {
      name: name.trim(),
      command: command.trim(),
      color: color.trim() || undefined,
      env: Object.keys(env).length > 0 ? env : undefined,
    })
    resetForm()
  }

  const handleDelete = async (id: string) => {
    await removeAgent(id)
    if (editingId === id) {
      resetForm()
    }
  }

  return (
    <div className="h-full flex flex-col bg-bg-secondary">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h2 className="text-lg font-medium text-text-primary">Settings</h2>
        <button
          onClick={onClose}
          className="p-1 text-text-secondary hover:text-text-primary transition-colors"
          title="Close settings"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6L6 18" />
            <path d="M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Agents section */}
        <h3 className="text-sm font-medium text-text-primary mb-3">Agents</h3>
        <div className="space-y-2 mb-4">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className={`p-3 rounded border transition-colors ${
                editingId === agent.id
                  ? 'border-accent bg-bg-tertiary'
                  : 'border-border bg-bg-primary hover:bg-bg-tertiary'
              }`}
            >
              {editingId === agent.id ? (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Agent name"
                    className="w-full px-3 py-2 bg-bg-secondary border border-border rounded text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-accent"
                  />
                  <input
                    type="text"
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    placeholder="Command (e.g., claude)"
                    className="w-full px-3 py-2 bg-bg-secondary border border-border rounded text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-accent"
                  />
                  <input
                    type="text"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    placeholder="Color (optional, e.g., #4a9eff)"
                    className="w-full px-3 py-2 bg-bg-secondary border border-border rounded text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-accent"
                  />
                  <EnvVarEditor env={env} onChange={setEnv} command={command} />
                  <div className="flex gap-2">
                    <button
                      onClick={handleUpdate}
                      disabled={!name.trim() || !command.trim()}
                      className="px-3 py-1.5 bg-accent text-white text-sm rounded hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Save
                    </button>
                    <button
                      onClick={resetForm}
                      className="px-3 py-1.5 bg-bg-tertiary text-text-secondary text-sm rounded hover:text-text-primary transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {agent.color && (
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: agent.color }}
                      />
                    )}
                    <div>
                      <div className="font-medium text-sm text-text-primary">
                        {agent.name}
                      </div>
                      <div className="text-xs text-text-secondary font-mono">
                        {agent.command}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEdit(agent)}
                      className="p-1.5 text-text-secondary hover:text-text-primary transition-colors"
                      title="Edit agent"
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
                        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                        <path d="m15 5 4 4" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(agent.id)}
                      className="p-1.5 text-text-secondary hover:text-status-error transition-colors"
                      title="Delete agent"
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
                        <path d="M3 6h18" />
                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {agents.length === 0 && !showAddForm && (
            <div className="text-center text-text-secondary text-sm py-8">
              No agents configured.
              <br />
              Add one to get started.
            </div>
          )}
        </div>

        {/* Add form */}
        {showAddForm && (
          <div className="p-3 rounded border border-accent bg-bg-tertiary space-y-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Agent name"
              className="w-full px-3 py-2 bg-bg-secondary border border-border rounded text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-accent"
              autoFocus
            />
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="Command (e.g., claude)"
              className="w-full px-3 py-2 bg-bg-secondary border border-border rounded text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-accent"
            />
            <input
              type="text"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="Color (optional, e.g., #4a9eff)"
              className="w-full px-3 py-2 bg-bg-secondary border border-border rounded text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-accent"
            />
            <EnvVarEditor env={env} onChange={setEnv} command={command} />
            <div className="flex gap-2">
              <button
                onClick={handleAdd}
                disabled={!name.trim() || !command.trim()}
                className="px-3 py-1.5 bg-accent text-white text-sm rounded hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Add Agent
              </button>
              <button
                onClick={resetForm}
                className="px-3 py-1.5 bg-bg-tertiary text-text-secondary text-sm rounded hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Add button */}
        {!showAddForm && !editingId && (
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full py-2 px-3 border border-dashed border-border text-text-secondary text-sm rounded hover:border-accent hover:text-text-primary transition-colors"
          >
            + Add Agent
          </button>
        )}

        {/* Repositories section */}
        {repos.length > 0 && (
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
                      onUpdate={async (updates) => {
                        await updateRepo(repo.id, updates)
                      }}
                      onClose={() => setEditingRepoId(null)}
                    />
                  ) : (
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
                        onClick={() => {
                          setEditingRepoId(repo.id)
                          setEditingId(null)
                          setShowAddForm(false)
                        }}
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
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
