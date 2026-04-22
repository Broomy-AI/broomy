/**
 * Visual editor for .broomy/commands.json — renders in the file viewer panel area.
 *
 * Shows an accordion list of action definitions with editable fields.
 * When no commands.json exists, shows a setup prompt with a "Create" button.
 */
import { useState, useEffect, useCallback } from 'react'
import { useMemo } from 'react'
import {
  loadCommandsConfig,
  commandsConfigPath,
  getDefaultCommandsConfig,
  ensureOutputGitignore,
  getAgentTypes,
  checkLegacyBroomyGitignore,
  removeLegacyBroomyGitignore,
  type ActionDefinition,
} from '../../features/commands/commandsConfig'
import { DialogErrorBanner } from '../../shared/components/ErrorBanner'
import { ShowWhenPicker } from '../../shared/components/ShowWhenPicker'
import { PromptVariants, TemplateVarsHint } from '../../shared/components/PromptVariants'
import { useAgentStore } from '../../store/agents'

const STYLE_OPTIONS = ['primary', 'secondary', 'accent', 'danger'] as const
const SURFACE_OPTIONS = [
  { value: 'source-control', label: 'Source Control' },
  { value: 'review', label: 'Review' },
] as const

const SWITCH_TAB_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'source-control', label: 'Source Control' },
  { value: 'files', label: 'Files' },
  { value: 'search', label: 'Search' },
  { value: 'recent', label: 'Recent Files' },
  { value: 'review', label: 'Review' },
] as const

/** Normalize the surface field to a string array for the UI. */
function normalizeSurface(surface: string | string[] | undefined): string[] {
  if (!surface) return ['source-control']
  if (Array.isArray(surface)) return surface
  return [surface]
}

interface CommandsEditorProps {
  directory: string
  onClose: () => void
}

function makeDefaultAction(): ActionDefinition {
  return {
    id: `action-${Date.now()}`,
    label: 'New Action',
    type: 'agent',
    prompt: '',
    showWhen: [],
    style: 'secondary',
  }
}

export function CommandsEditor({ directory, onClose }: CommandsEditorProps) {
  const [actions, setActions] = useState<ActionDefinition[] | null>(null)
  const [exists, setExists] = useState<boolean | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const agents = useAgentStore((s) => s.agents)

  // Agent types from configured agents + any types already referenced in actions
  const knownAgentTypes = useMemo(() => {
    const fromStore = getAgentTypes(agents)
    const fromActions = new Set<string>()
    for (const action of actions ?? []) {
      for (const key of Object.keys(action.agents ?? {})) {
        fromActions.add(key)
      }
    }
    return [...new Set([...fromStore, ...fromActions])].sort()
  }, [agents, actions])

  const load = useCallback(async () => {
    setLoadError(null)
    const result = await loadCommandsConfig(directory)
    if (result === null) {
      setActions(null)
      setExists(false)
    } else if (!result.ok) {
      setActions(null)
      setExists(true)
      setLoadError(result.error)
    } else {
      setActions(result.config.actions)
      setExists(true)
    }
    setIsDirty(false)
  }, [directory])

  useEffect(() => {
    void load()
  }, [load])

  const handleCreate = async () => {
    setCreating(true)
    try {
      const broomyDir = `${directory}/.broomy`

      await window.fs.mkdir(broomyDir)

      const config = getDefaultCommandsConfig()
      await window.fs.writeFile(commandsConfigPath(directory), JSON.stringify(config, null, 2))

      await ensureOutputGitignore(directory)

      // Remove legacy .broomy from .gitignore if present
      const hasLegacy = await checkLegacyBroomyGitignore(directory)
      if (hasLegacy) {
        await removeLegacyBroomyGitignore(directory)
      }

      await load()
    } finally {
      setCreating(false)
    }
  }

  const handleSave = async () => {
    if (!actions) return
    setSaving(true)
    try {
      const config = { version: 1, actions }
      await window.fs.writeFile(commandsConfigPath(directory), JSON.stringify(config, null, 2))
      setIsDirty(false)
    } finally {
      setSaving(false)
    }
  }

  const updateAction = (id: string, updates: Partial<ActionDefinition>) => {
    if (!actions) return
    setActions(actions.map((a) => a.id === id ? { ...a, ...updates } : a))
    setIsDirty(true)
  }

  const deleteAction = (id: string) => {
    if (!actions) return
    setActions(actions.filter((a) => a.id !== id))
    setDeleteConfirmId(null)
    setIsDirty(true)
  }

  const addAction = () => {
    const newAction = makeDefaultAction()
    setActions((prev) => [...(prev ?? []), newAction])
    setExpandedId(newAction.id)
    setIsDirty(true)
  }

  // Empty state
  if (exists === null) {
    return (
      <div className="h-full flex items-center justify-center text-text-secondary text-sm">
        Loading...
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="h-full flex flex-col">
        <EditorHeader title="Commands" onClose={onClose} isDirty={false} />
        <div className="flex-1 p-4 space-y-4">
          <DialogErrorBanner error={loadError} onDismiss={() => setLoadError(null)} />
          <p className="text-sm text-text-secondary">
            Fix the errors in <code className="font-mono bg-bg-tertiary px-1 rounded">.broomy/commands.json</code> and reload.
          </p>
          <button
            onClick={() => void load()}
            className="px-4 py-2 text-sm rounded bg-accent text-white hover:bg-accent/80 transition-colors"
            data-testid="reload-commands"
          >
            Reload
          </button>
        </div>
      </div>
    )
  }

  if (!exists || !actions) {
    return (
      <div className="h-full flex flex-col">
        <EditorHeader title="Commands" onClose={onClose} isDirty={false} />
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-md space-y-4">
            <h3 className="text-lg font-medium text-text-primary">No commands.json</h3>
            <p className="text-sm text-text-secondary">
              <code className="font-mono bg-bg-tertiary px-1 rounded">commands.json</code> defines
              the actions shown in the Broomy UI. Each action can be a shell command or an
              agent prompt, shown based on your git state.
            </p>
            <button
              onClick={() => void handleCreate()}
              disabled={creating}
              className="px-4 py-2 text-sm rounded bg-accent text-white hover:bg-accent/80 transition-colors disabled:opacity-50"
              data-testid="create-commands"
            >
              {creating ? 'Creating...' : 'Create default commands.json'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <EditorHeader title="Commands" onClose={onClose} isDirty={isDirty} />

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {actions.map((action) => (
          <ActionCard
            key={action.id}
            action={action}
            isExpanded={expandedId === action.id}
            onToggle={() => setExpandedId(expandedId === action.id ? null : action.id)}
            onUpdate={(updates) => updateAction(action.id, updates)}
            agentTypes={knownAgentTypes}
            onDelete={() => {
              if (deleteConfirmId === action.id) {
                deleteAction(action.id)
              } else {
                setDeleteConfirmId(action.id)
              }
            }}
            deleteConfirm={deleteConfirmId === action.id}
            onCancelDelete={() => setDeleteConfirmId(null)}
          />
        ))}

        <button
          onClick={addAction}
          className="w-full p-3 rounded border border-dashed border-border text-text-secondary hover:text-text-primary hover:border-text-tertiary transition-colors text-sm"
          data-testid="add-action"
        >
          + Add Action
        </button>
      </div>

      <div className="p-4 border-t border-border flex items-center gap-2">
        <button
          onClick={() => void handleSave()}
          disabled={saving || !isDirty}
          className="px-4 py-2 text-sm rounded bg-accent text-white hover:bg-accent/80 transition-colors disabled:opacity-50"
          data-testid="save-commands"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        {isDirty && (
          <span className="text-xs text-text-tertiary">Unsaved changes</span>
        )}
      </div>
    </div>
  )
}

function EditorHeader({ title, onClose, isDirty }: { title: string; onClose: () => void; isDirty: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-bg-secondary">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium text-text-primary">{title}</h3>
        {isDirty && (
          <span className="w-2 h-2 rounded-full bg-accent" title="Unsaved changes" />
        )}
      </div>
      <button
        onClick={onClose}
        className="p-1 text-text-secondary hover:text-text-primary transition-colors"
        title="Close commands editor"
        data-testid="close-commands-editor"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6L6 18" />
          <path d="M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

function ActionCard({
  action,
  isExpanded,
  onToggle,
  onUpdate,
  agentTypes,
  onDelete,
  deleteConfirm,
  onCancelDelete,
}: {
  key?: string | number | bigint | null
  action: ActionDefinition
  isExpanded: boolean
  onToggle: () => void
  onUpdate: (updates: Partial<ActionDefinition>) => void
  agentTypes: string[]
  onDelete: () => void
  deleteConfirm: boolean
  onCancelDelete: () => void
}) {
  return (
    <div className="rounded border border-border bg-bg-primary overflow-hidden">
      {/* Collapsed header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 p-3 text-left hover:bg-bg-tertiary transition-colors"
        data-testid={`action-header-${action.id}`}
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
          className={`text-text-tertiary shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
        <span className="text-sm text-text-primary flex-1 truncate">{action.label}</span>
        <TypeBadge type={action.type} />
        {action.style && <StyleBadge style={action.style} />}
      </button>

      {/* Expanded fields */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">
          <Field label="Label">
            <input
              type="text"
              value={action.label}
              onChange={(e) => onUpdate({ label: e.target.value })}
              className="w-full px-2 py-1.5 text-sm rounded border border-border bg-bg-secondary text-text-primary focus:outline-none focus:border-accent"
              data-testid={`action-label-${action.id}`}
            />
          </Field>

          <Field label="Type">
            <div className="flex gap-1">
              {(['agent', 'shell'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => onUpdate({ type: t })}
                  className={`px-3 py-1 text-xs rounded ${
                    action.type === t
                      ? 'bg-accent text-white'
                      : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'
                  } transition-colors`}
                >
                  {t}
                </button>
              ))}
            </div>
          </Field>

          {action.type === 'shell' && (
            <Field label="Command">
              <input
                type="text"
                value={action.command ?? ''}
                onChange={(e) => onUpdate({ command: e.target.value })}
                className="w-full px-2 py-1.5 text-sm rounded border border-border bg-bg-secondary text-text-primary font-mono focus:outline-none focus:border-accent"
                placeholder="git pull && git push"
                data-testid={`action-command-${action.id}`}
              />
              <TemplateVarsHint />
            </Field>
          )}

          {action.type === 'agent' && (
            <PromptVariants action={action} onUpdate={onUpdate} fieldSlot={Field} agentTypes={agentTypes} />
          )}

          <Field label="Show When">
            <ShowWhenPicker
              showWhen={action.showWhen}
              onChange={(showWhen) => onUpdate({ showWhen })}
            />
          </Field>

          <Field label="Style">
            <select
              value={action.style ?? 'secondary'}
              onChange={(e) => onUpdate({ style: e.target.value as ActionDefinition['style'] })}
              className="w-full px-2 py-1.5 text-sm rounded border border-border bg-bg-secondary text-text-primary focus:outline-none focus:border-accent"
              data-testid={`action-style-${action.id}`}
            >
              {STYLE_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Field>

          <Field label="Surface" hint="Where this action appears (defaults to Source Control)">
            <div className="flex gap-2">
              {SURFACE_OPTIONS.map((opt) => {
                const surfaces = normalizeSurface(action.surface)
                const checked = surfaces.includes(opt.value)
                return (
                  <label key={opt.value} className="flex items-center gap-1.5 text-sm text-text-secondary cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const next = checked
                          ? surfaces.filter((s) => s !== opt.value)
                          : [...surfaces, opt.value]
                        onUpdate({ surface: next.length === 0 ? undefined : next.length === 1 ? next[0] : next })
                      }}
                      className="accent-accent"
                      data-testid={`action-surface-${opt.value}-${action.id}`}
                    />
                    {opt.label}
                  </label>
                )
              })}
            </div>
          </Field>

          <Field label="Switch Tab" hint="Navigate to an explorer tab after running this action">
            <select
              value={action.switchTab ?? ''}
              onChange={(e) => onUpdate({ switchTab: e.target.value || undefined })}
              className="w-full px-2 py-1.5 text-sm rounded border border-border bg-bg-secondary text-text-primary focus:outline-none focus:border-accent"
              data-testid={`action-switch-tab-${action.id}`}
            >
              {SWITCH_TAB_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </Field>

          <div className="pt-2 border-t border-border">
            {deleteConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-400">Delete this action?</span>
                <button
                  onClick={onDelete}
                  className="px-2 py-1 text-xs rounded bg-red-500 text-white hover:bg-red-600 transition-colors"
                  data-testid={`action-confirm-delete-${action.id}`}
                >
                  Confirm
                </button>
                <button
                  onClick={onCancelDelete}
                  className="px-2 py-1 text-xs text-text-secondary hover:text-text-primary transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={onDelete}
                className="text-xs text-red-400 hover:text-red-300 transition-colors"
                data-testid={`action-delete-${action.id}`}
              >
                Delete action
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-text-secondary">{label}</label>
      {children}
      {hint && <p className="text-xs text-text-tertiary">{hint}</p>}
    </div>
  )
}

function TypeBadge({ type }: { type: 'agent' | 'shell' }) {
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${
      type === 'agent'
        ? 'bg-blue-500/20 text-blue-400'
        : 'bg-green-500/20 text-green-400'
    }`}>
      {type}
    </span>
  )
}

function StyleBadge({ style }: { style: string }) {
  const colors: Record<string, string> = {
    primary: 'bg-accent/20 text-accent',
    secondary: 'bg-bg-tertiary text-text-secondary',
    accent: 'bg-purple-500/20 text-purple-400',
    danger: 'bg-red-500/20 text-red-400',
  }
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${colors[style] ?? colors.secondary}`}>
      {style}
    </span>
  )
}
