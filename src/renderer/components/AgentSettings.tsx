import { useState, useEffect, useRef } from 'react'
import { useAgentStore, type AgentConfig } from '../store/agents'
import { useRepoStore } from '../store/repos'
import type { ManagedRepo } from '../../preload/index'
import { EnvVarEditor, type EnvVarEditorRef } from './EnvVarEditor'
import { RepoSettingsEditor } from './RepoSettingsEditor'

interface AgentSettingsProps {
  onClose: () => void
}

export default function AgentSettings({ onClose }: AgentSettingsProps) {
  const { agents, addAgent, updateAgent, removeAgent } = useAgentStore()
  const { repos, loadRepos, updateRepo, defaultCloneDir, setDefaultCloneDir } = useRepoStore()
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
  const envEditorRef = useRef<EnvVarEditorRef>(null)

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

    const finalEnv = envEditorRef.current?.getPendingEnv() ?? env
    await addAgent({
      name: name.trim(),
      command: command.trim(),
      color: color.trim() || undefined,
      env: Object.keys(finalEnv).length > 0 ? finalEnv : undefined,
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

    const finalEnv = envEditorRef.current?.getPendingEnv() ?? env
    await updateAgent(editingId, {
      name: name.trim(),
      command: command.trim(),
      color: color.trim() || undefined,
      env: Object.keys(finalEnv).length > 0 ? finalEnv : undefined,
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
        {/* General section */}
        <h3 className="text-sm font-medium text-text-primary mb-3">General</h3>
        <div className="space-y-2 mb-4">
          <label className="text-xs text-text-secondary">Default Repo Folder</label>
          <div className="flex gap-2">
            <div className="flex-1 px-3 py-2 text-sm rounded border border-border bg-bg-primary text-text-primary font-mono truncate">
              {defaultCloneDir || '~/repos'}
            </div>
            <button
              onClick={async () => {
                const folder = await window.dialog.openFolder()
                if (folder) await setDefaultCloneDir(folder)
              }}
              className="px-3 py-2 text-sm rounded border border-border bg-bg-primary hover:bg-bg-tertiary text-text-secondary transition-colors"
            >
              Browse
            </button>
          </div>
        </div>

        {/* Agents section */}
        <div className="mt-8 mb-4 border-t border-border pt-4">
          <h3 className="text-sm font-medium text-text-primary mb-3">Agents</h3>
        </div>
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
                  <EnvVarEditor ref={envEditorRef} env={env} onChange={setEnv} command={command} />
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
            <EnvVarEditor ref={envEditorRef} env={env} onChange={setEnv} command={command} />
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
