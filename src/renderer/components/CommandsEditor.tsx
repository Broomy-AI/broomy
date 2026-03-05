/**
 * Visual editor for .broomy/commands.json — renders in the file viewer panel area.
 *
 * Shows an accordion list of action definitions with editable fields.
 * When no commands.json exists, shows a setup prompt with a "Create" button.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  loadCommandsConfig,
  commandsConfigPath,
  getDefaultCommandsConfig,
  ensureOutputGitignore,
  type ActionDefinition,
} from '../utils/commandsConfig'
import { SKILL_ACTIONS, skillCommandPath } from '../utils/skillActions'
import {
  checkLegacyBroomyGitignore,
  removeLegacyBroomyGitignore,
} from './review/useReviewActions'
import { ShowWhenPicker } from './ShowWhenPicker'

const STYLE_OPTIONS = ['primary', 'secondary', 'accent', 'danger'] as const

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

  const load = useCallback(async () => {
    const config = await loadCommandsConfig(directory)
    if (config) {
      setActions(config.actions)
      setExists(true)
    } else {
      setActions(null)
      setExists(false)
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

      // Write Claude Code skill files
      const commandsDir = `${directory}/.claude/commands`
      await window.fs.mkdir(`${directory}/.claude`)
      await window.fs.mkdir(commandsDir)
      for (const action of SKILL_ACTIONS) {
        const path = skillCommandPath(directory, action.name)
        const fileExists = await window.fs.exists(path)
        if (!fileExists) {
          await window.fs.writeFile(path, action.defaultContent)
        }
      }

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

  if (!exists || !actions) {
    return (
      <div className="h-full flex flex-col">
        <EditorHeader title="Commands" onClose={onClose} isDirty={false} />
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-md space-y-4">
            <h3 className="text-lg font-medium text-text-primary">No commands.json</h3>
            <p className="text-sm text-text-secondary">
              <code className="font-mono bg-bg-tertiary px-1 rounded">commands.json</code> defines
              the action buttons shown in source control. Each action can be a shell command or an
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
  onDelete,
  deleteConfirm,
  onCancelDelete,
}: {
  action: ActionDefinition
  isExpanded: boolean
  onToggle: () => void
  onUpdate: (updates: Partial<ActionDefinition>) => void
  onDelete: () => void
  deleteConfirm: boolean
  onCancelDelete: () => void
}) {
  // Derive prompt mode from action data, allow manual override
  const derivedMode = (action.promptFile && !action.prompt) ? 'file' as const : 'inline' as const
  const [promptMode, setPromptMode] = useState<'inline' | 'file'>(derivedMode)
  const prevActionId = useRef(action.id)
  if (prevActionId.current !== action.id) {
    prevActionId.current = action.id
    setPromptMode(derivedMode)
  }

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
            </Field>
          )}

          {action.type === 'agent' && (
            <Field label="Prompt">
              <div className="flex gap-1 mb-2">
                <button
                  onClick={() => setPromptMode('inline')}
                  className={`px-3 py-1 text-xs rounded ${
                    promptMode === 'inline'
                      ? 'bg-accent text-white'
                      : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'
                  } transition-colors`}
                  data-testid={`prompt-mode-inline-${action.id}`}
                >
                  Inline Prompt
                </button>
                <button
                  onClick={() => setPromptMode('file')}
                  className={`px-3 py-1 text-xs rounded ${
                    promptMode === 'file'
                      ? 'bg-accent text-white'
                      : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'
                  } transition-colors`}
                  data-testid={`prompt-mode-file-${action.id}`}
                >
                  Prompt File
                </button>
              </div>
              {promptMode === 'inline' ? (
                <textarea
                  value={action.prompt ?? ''}
                  onChange={(e) => onUpdate({ prompt: e.target.value })}
                  className="w-full px-2 py-1.5 text-sm rounded border border-border bg-bg-secondary text-text-primary font-mono focus:outline-none focus:border-accent resize-y min-h-[60px]"
                  placeholder="Enter an inline prompt..."
                  rows={3}
                  data-testid={`action-prompt-${action.id}`}
                />
              ) : (
                <input
                  type="text"
                  value={action.promptFile ?? ''}
                  onChange={(e) => onUpdate({ promptFile: e.target.value })}
                  className="w-full px-2 py-1.5 text-sm rounded border border-border bg-bg-secondary text-text-primary font-mono focus:outline-none focus:border-accent"
                  placeholder=".broomy/prompts/my-action.md"
                  data-testid={`action-promptFile-${action.id}`}
                />
              )}
            </Field>
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

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
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
