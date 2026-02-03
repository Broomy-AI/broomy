import { useState } from 'react'
import { useAgentStore, type AgentConfig } from '../store/agents'

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
    const newEnv = { ...env }
    delete newEnv[key]
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

export default function AgentSettings({ onClose }: AgentSettingsProps) {
  const { agents, addAgent, updateAgent, removeAgent } = useAgentStore()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)

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
        <h2 className="text-lg font-medium text-text-primary">Agent Settings</h2>
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
        {/* Agent list */}
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
      </div>
    </div>
  )
}
