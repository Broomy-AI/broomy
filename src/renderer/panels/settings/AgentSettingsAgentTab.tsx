/**
 * Agent configuration tab for creating, editing, and deleting agent definitions.
 */
import { type RefObject } from 'react'
import type { AgentConfig } from '../../store/agents'
import type { SdkModelInfo } from '../../../preload/apis/types'
import { EnvVarEditor, type EnvVarEditorRef } from './EnvVarEditor'
import { useSdkModels, DEFAULT_MODEL } from '../../shared/hooks/useSdkModels'

interface AgentSettingsAgentTabProps {
  agents: AgentConfig[]
  editingId: string | null
  showAddForm: boolean
  name: string
  command: string
  color: string
  env: Record<string, string>
  skipApprovalFlag: string
  connectionMode: 'terminal' | 'api'
  model?: string
  effort?: string
  envEditorRef: RefObject<EnvVarEditorRef>
  onNameChange: (v: string) => void
  onCommandChange: (v: string) => void
  onColorChange: (v: string) => void
  onEnvChange: (v: Record<string, string>) => void
  onSkipApprovalFlagChange: (v: string) => void
  onConnectionModeChange: (v: 'terminal' | 'api') => void
  onModelChange?: (v: string) => void
  onEffortChange?: (v: string) => void
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
  skipApprovalFlag,
  connectionMode,
  model,
  effort,
  envEditorRef,
  onNameChange,
  onCommandChange,
  onColorChange,
  onEnvChange,
  onSkipApprovalFlagChange,
  onConnectionModeChange,
  onModelChange,
  onEffortChange,
  onEdit,
  onUpdate,
  onDelete,
  onAdd,
  onShowAddForm,
  onCancel,
}: AgentSettingsAgentTabProps) {
  const { models, loading } = useSdkModels()

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
                skipApprovalFlag={skipApprovalFlag}
                connectionMode={connectionMode}
                model={model}
                effort={effort}
                models={models}
                modelsLoading={loading}
                envEditorRef={envEditorRef}
                onNameChange={onNameChange}
                onCommandChange={onCommandChange}
                onColorChange={onColorChange}
                onEnvChange={onEnvChange}
                onSkipApprovalFlagChange={onSkipApprovalFlagChange}
                onConnectionModeChange={onConnectionModeChange}
                onModelChange={onModelChange}
                onEffortChange={onEffortChange}
                onSave={onUpdate}
                onCancel={onCancel}
              />
            ) : (
              <AgentRow agent={agent} models={models} onEdit={onEdit} onDelete={onDelete} />
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
          <div className="space-y-1">
            <label className="text-xs text-text-secondary">Connection mode</label>
            <select
              value={connectionMode}
              onChange={(e) => onConnectionModeChange(e.target.value as 'terminal' | 'api')}
              className="w-full px-3 py-2 bg-bg-secondary border border-border rounded text-sm text-text-primary focus:outline-none focus:border-accent"
            >
              <option value="terminal">Terminal (PTY)</option>
              <option value="api">API (Agent SDK)</option>
            </select>
            <p className="text-xs text-text-tertiary">
              API mode uses the Claude Agent SDK for structured output instead of terminal.
            </p>
          </div>
          {connectionMode === 'api' && (
            <ApiModeOptions
              model={model}
              effort={effort}
              models={models}
              modelsLoading={loading}
              onModelChange={onModelChange}
              onEffortChange={onEffortChange}
            />
          )}
          <EnvVarEditor ref={envEditorRef} env={env} onChange={onEnvChange} command={command} />
          <div className="space-y-1">
            <label className="text-xs text-text-secondary">Auto-approve flag</label>
            <input
              type="text"
              value={skipApprovalFlag}
              onChange={(e) => onSkipApprovalFlagChange(e.target.value)}
              placeholder="e.g., --dangerously-skip-permissions"
              className="w-full px-3 py-2 bg-bg-secondary border border-border rounded text-sm text-text-primary font-mono placeholder-text-secondary focus:outline-none focus:border-accent"
            />
            <p className="text-xs text-text-tertiary">
              Appended to the command when the repo has auto-approve enabled.
            </p>
          </div>
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
  skipApprovalFlag,
  connectionMode,
  model,
  effort,
  models,
  modelsLoading,
  envEditorRef,
  onNameChange,
  onCommandChange,
  onColorChange,
  onEnvChange,
  onSkipApprovalFlagChange,
  onConnectionModeChange,
  onModelChange,
  onEffortChange,
  onSave,
  onCancel,
}: {
  name: string
  command: string
  color: string
  env: Record<string, string>
  skipApprovalFlag: string
  connectionMode: 'terminal' | 'api'
  model?: string
  effort?: string
  models: SdkModelInfo[]
  modelsLoading: boolean
  envEditorRef: RefObject<EnvVarEditorRef>
  onNameChange: (v: string) => void
  onCommandChange: (v: string) => void
  onColorChange: (v: string) => void
  onEnvChange: (v: Record<string, string>) => void
  onSkipApprovalFlagChange: (v: string) => void
  onConnectionModeChange: (v: 'terminal' | 'api') => void
  onModelChange?: (v: string) => void
  onEffortChange?: (v: string) => void
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
      <div className="space-y-1">
        <label className="text-xs text-text-secondary">Connection mode</label>
        <select
          value={connectionMode}
          onChange={(e) => onConnectionModeChange(e.target.value as 'terminal' | 'api')}
          className="w-full px-3 py-2 bg-bg-secondary border border-border rounded text-sm text-text-primary focus:outline-none focus:border-accent"
        >
          <option value="terminal">Terminal (PTY)</option>
          <option value="api">API (Agent SDK)</option>
        </select>
      </div>
      {connectionMode === 'api' && (
        <ApiModeOptions
          model={model}
          effort={effort}
          models={models}
          modelsLoading={modelsLoading}
          onModelChange={onModelChange}
          onEffortChange={onEffortChange}
        />
      )}
      <EnvVarEditor ref={envEditorRef} env={env} onChange={onEnvChange} command={command} />
      <div className="space-y-1">
        <label className="text-xs text-text-secondary">Auto-approve flag</label>
        <input
          type="text"
          value={skipApprovalFlag}
          onChange={(e) => onSkipApprovalFlagChange(e.target.value)}
          placeholder="e.g., --dangerously-skip-permissions"
          className="w-full px-3 py-2 bg-bg-secondary border border-border rounded text-sm text-text-primary font-mono placeholder-text-secondary focus:outline-none focus:border-accent"
        />
        <p className="text-xs text-text-tertiary">
          Appended to the command when the repo has auto-approve enabled.
        </p>
      </div>
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

/** Model + effort controls shown when connection mode is API. */
function ApiModeOptions({ model, effort, models, modelsLoading, onModelChange, onEffortChange }: {
  model?: string
  effort?: string
  models: SdkModelInfo[]
  modelsLoading: boolean
  onModelChange?: (v: string) => void
  onEffortChange?: (v: string) => void
}) {
  const selectedModel = models.find((m) => m.value === model) ?? models[0]
  const effortLevels = selectedModel.supportedEffortLevels ?? []
  const supportsEffort = effortLevels.length > 0 && !!selectedModel.supportsEffort

  // If current effort isn't supported by the new model, clear it
  const effectiveEffort = (supportsEffort && effortLevels.includes(effort as 'low' | 'medium' | 'high' | 'max'))
    ? effort
    : ''

  return (
    <>
      <div className="space-y-1">
        <label className="text-xs text-text-secondary flex items-center gap-1">
          Model
          {modelsLoading && <span className="text-text-tertiary">(loading...)</span>}
        </label>
        <select
          value={model || DEFAULT_MODEL}
          onChange={(e) => {
            onModelChange?.(e.target.value)
            // Reset effort when model changes since capabilities may differ
            onEffortChange?.('')
          }}
          className="w-full px-3 py-2 bg-bg-secondary border border-border rounded text-sm text-text-primary focus:outline-none focus:border-accent"
        >
          {models.map((m) => (
            <option key={m.value} value={m.value}>
              {m.displayName}{m.description ? ` — ${m.description}` : ''}
            </option>
          ))}
        </select>
      </div>
      {supportsEffort && (
        <div className="space-y-1">
          <label className="text-xs text-text-secondary">Thinking effort</label>
          <select
            value={effectiveEffort}
            onChange={(e) => onEffortChange?.(e.target.value)}
            className="w-full px-3 py-2 bg-bg-secondary border border-border rounded text-sm text-text-primary focus:outline-none focus:border-accent"
          >
            <option value="">Auto (model decides)</option>
            {effortLevels.map((level) => (
              <option key={level} value={level}>{level}</option>
            ))}
          </select>
          <p className="text-xs text-text-tertiary">
            Controls how much Claude thinks before responding. Auto lets the model decide.
          </p>
        </div>
      )}
    </>
  )
}

function AgentRow({
  agent,
  models,
  onEdit,
  onDelete,
}: {
  agent: AgentConfig
  models: SdkModelInfo[]
  onEdit: (agent: AgentConfig) => void
  onDelete: (id: string) => void
}) {
  const modelInfo = agent.connectionMode === 'api' && agent.model
    ? models.find((m) => m.value === agent.model)
    : null
  const modelLabel = modelInfo?.displayName ?? (agent.connectionMode === 'api' && agent.model ? agent.model : null)
  const effortLabel = agent.connectionMode === 'api' && agent.effort ? agent.effort : null

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
          <div className="font-medium text-sm text-text-primary flex items-center gap-2">
            {agent.name}
            {agent.connectionMode === 'api' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-normal">API</span>
            )}
            {agent.skipApprovalFlag && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 font-normal">auto</span>
            )}
          </div>
          <div className="text-xs text-text-secondary font-mono">
            {agent.command}
            {modelLabel && <span className="ml-2 font-sans not-italic text-text-tertiary">({modelLabel}{effortLabel ? `, ${effortLabel}` : ''})</span>}
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

