/**
 * Agent and repository configuration panel rendered as a global settings overlay.
 *
 * Provides CRUD for agent definitions (name, command, environment variables) and
 * per-repository settings (default agent, allow-push-to-main flag, init script).
 * The EnvVarEditor sub-component manages key-value environment variable pairs with
 * suggested variables based on the agent command. Repo settings include an init script
 * editor for commands that run when a new worktree is created for that repository.
 */
import { useState, useEffect, useRef } from 'react'
import { useAgentStore, type AgentConfig } from '../store/agents'
import { useRepoStore } from '../store/repos'
import type { EnvVarEditorRef } from './EnvVarEditor'
import { AgentSettingsAgentTab } from './AgentSettingsAgentTab'
import { AgentSettingsRepoTab } from './AgentSettingsRepoTab'

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
    void loadRepos()
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

  const handleAdd = () => {
    if (!name.trim() || !command.trim()) return

    const finalEnv = envEditorRef.current?.getPendingEnv() ?? env
    addAgent({
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

  const handleUpdate = () => {
    if (!editingId || !name.trim() || !command.trim()) return

    const finalEnv = envEditorRef.current?.getPendingEnv() ?? env
    updateAgent(editingId, {
      name: name.trim(),
      command: command.trim(),
      color: color.trim() || undefined,
      env: Object.keys(finalEnv).length > 0 ? finalEnv : undefined,
    })
    resetForm()
  }

  const handleDelete = (id: string) => {
    removeAgent(id)
    if (editingId === id) {
      resetForm()
    }
  }

  const handleEditRepo = (repoId: string) => {
    setEditingRepoId(repoId)
    setEditingId(null)
    setShowAddForm(false)
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

        <AgentSettingsAgentTab
          agents={agents}
          editingId={editingId}
          showAddForm={showAddForm}
          name={name}
          command={command}
          color={color}
          env={env}
          envEditorRef={envEditorRef}
          onNameChange={setName}
          onCommandChange={setCommand}
          onColorChange={setColor}
          onEnvChange={setEnv}
          onEdit={handleEdit}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          onAdd={handleAdd}
          onShowAddForm={() => setShowAddForm(true)}
          onCancel={resetForm}
        />

        <AgentSettingsRepoTab
          repos={repos}
          agents={agents}
          editingRepoId={editingRepoId}
          onEditRepo={handleEditRepo}
          onUpdateRepo={updateRepo}
          onCloseRepoEditor={() => setEditingRepoId(null)}
        />
      </div>
    </div>
  )
}
