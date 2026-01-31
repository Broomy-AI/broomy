import { useState } from 'react'
import { useAgentStore, type AgentConfig } from '../store/agents'

interface AgentSettingsProps {
  onClose: () => void
}

export default function AgentSettings({ onClose }: AgentSettingsProps) {
  const { agents, addAgent, updateAgent, removeAgent } = useAgentStore()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)

  // Form state
  const [name, setName] = useState('')
  const [command, setCommand] = useState('')
  const [color, setColor] = useState('')

  const resetForm = () => {
    setName('')
    setCommand('')
    setColor('')
    setShowAddForm(false)
    setEditingId(null)
  }

  const handleAdd = async () => {
    if (!name.trim() || !command.trim()) return

    await addAgent({
      name: name.trim(),
      command: command.trim(),
      color: color.trim() || undefined,
    })
    resetForm()
  }

  const handleEdit = (agent: AgentConfig) => {
    setEditingId(agent.id)
    setName(agent.name)
    setCommand(agent.command)
    setColor(agent.color || '')
    setShowAddForm(false)
  }

  const handleUpdate = async () => {
    if (!editingId || !name.trim() || !command.trim()) return

    await updateAgent(editingId, {
      name: name.trim(),
      command: command.trim(),
      color: color.trim() || undefined,
    })
    resetForm()
  }

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this agent?')) {
      await removeAgent(id)
      if (editingId === id) {
        resetForm()
      }
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
