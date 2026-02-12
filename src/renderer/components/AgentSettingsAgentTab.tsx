import type { RefObject } from 'react'
import type { AgentConfig } from '../store/agents'
import { EnvVarEditor, type EnvVarEditorRef } from './EnvVarEditor'

interface AgentSettingsAgentTabProps {
  agents: AgentConfig[]
  editingId: string | null
  showAddForm: boolean
  name: string
  command: string
  color: string
  env: Record<string, string>
  envEditorRef: RefObject<EnvVarEditorRef>
  onNameChange: (v: string) => void
  onCommandChange: (v: string) => void
  onColorChange: (v: string) => void
  onEnvChange: (v: Record<string, string>) => void
  onEdit: (agent: AgentConfig) => void
  onUpdate: () => void
  onDelete: (id: string) => void
  onAdd: () => void
  onShowAddForm: () => void
  onCancel: () => void
}

export function AgentSettingsAgentTab({
  agents,
  editingId,
  showAddForm,
  name,
  command,
  color,
  env,
  envEditorRef,
  onNameChange,
  onCommandChange,
  onColorChange,
  onEnvChange,
  onEdit,
  onUpdate,
  onDelete,
  onAdd,
  onShowAddForm,
  onCancel,
}: AgentSettingsAgentTabProps) {
  return (
    <>
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
              <AgentEditForm
                name={name}
                command={command}
                color={color}
                env={env}
                envEditorRef={envEditorRef}
                onNameChange={onNameChange}
                onCommandChange={onCommandChange}
                onColorChange={onColorChange}
                onEnvChange={onEnvChange}
                onSave={onUpdate}
                onCancel={onCancel}
              />
            ) : (
              <AgentRow agent={agent} onEdit={onEdit} onDelete={onDelete} />
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
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Agent name"
            className="w-full px-3 py-2 bg-bg-secondary border border-border rounded text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-accent"
            autoFocus
          />
          <input
            type="text"
            value={command}
            onChange={(e) => onCommandChange(e.target.value)}
            placeholder="Command (e.g., claude)"
            className="w-full px-3 py-2 bg-bg-secondary border border-border rounded text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-accent"
          />
          <input
            type="text"
            value={color}
            onChange={(e) => onColorChange(e.target.value)}
            placeholder="Color (optional, e.g., #4a9eff)"
            className="w-full px-3 py-2 bg-bg-secondary border border-border rounded text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-accent"
          />
          <EnvVarEditor ref={envEditorRef} env={env} onChange={onEnvChange} command={command} />
          <div className="flex gap-2">
            <button
              onClick={onAdd}
              disabled={!name.trim() || !command.trim()}
              className="px-3 py-1.5 bg-accent text-white text-sm rounded hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Add Agent
            </button>
            <button
              onClick={onCancel}
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
          onClick={onShowAddForm}
          className="w-full py-2 px-3 border border-dashed border-border text-text-secondary text-sm rounded hover:border-accent hover:text-text-primary transition-colors"
        >
          + Add Agent
        </button>
      )}
    </>
  )
}

// --- Sub-components ---

function AgentEditForm({
  name,
  command,
  color,
  env,
  envEditorRef,
  onNameChange,
  onCommandChange,
  onColorChange,
  onEnvChange,
  onSave,
  onCancel,
}: {
  name: string
  command: string
  color: string
  env: Record<string, string>
  envEditorRef: RefObject<EnvVarEditorRef>
  onNameChange: (v: string) => void
  onCommandChange: (v: string) => void
  onColorChange: (v: string) => void
  onEnvChange: (v: Record<string, string>) => void
  onSave: () => void
  onCancel: () => void
}) {
  return (
    <div className="space-y-3">
      <input
        type="text"
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        placeholder="Agent name"
        className="w-full px-3 py-2 bg-bg-secondary border border-border rounded text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-accent"
      />
      <input
        type="text"
        value={command}
        onChange={(e) => onCommandChange(e.target.value)}
        placeholder="Command (e.g., claude)"
        className="w-full px-3 py-2 bg-bg-secondary border border-border rounded text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-accent"
      />
      <input
        type="text"
        value={color}
        onChange={(e) => onColorChange(e.target.value)}
        placeholder="Color (optional, e.g., #4a9eff)"
        className="w-full px-3 py-2 bg-bg-secondary border border-border rounded text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-accent"
      />
      <EnvVarEditor ref={envEditorRef} env={env} onChange={onEnvChange} command={command} />
      <div className="flex gap-2">
        <button
          onClick={onSave}
          disabled={!name.trim() || !command.trim()}
          className="px-3 py-1.5 bg-accent text-white text-sm rounded hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Save
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 bg-bg-tertiary text-text-secondary text-sm rounded hover:text-text-primary transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function AgentRow({
  agent,
  onEdit,
  onDelete,
}: {
  agent: AgentConfig
  onEdit: (agent: AgentConfig) => void
  onDelete: (id: string) => void
}) {
  return (
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
          onClick={() => onEdit(agent)}
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
          onClick={() => onDelete(agent.id)}
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
  )
}
