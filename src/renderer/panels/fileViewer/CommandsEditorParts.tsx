/**
 * Small helper components for CommandsEditor, extracted to keep the main file within line limits.
 */
import { useState } from 'react'
import type { ArgSpec } from '../../features/commands/commandsConfig'
import type { TemplateArg } from '../../features/commands/templateParser'

type Tab = 'user' | 'project'

// ---- Field wrapper ----

export function Field({
  label, hint, action, children,
}: {
  label: string
  hint?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-xs text-text-secondary">{label}</label>
        {action}
      </div>
      {children}
      {hint && <p className="text-[11px] text-text-tertiary">{hint}</p>}
    </div>
  )
}

// ---- Stage chip multi-select ----

export function StageChips({
  selected, options, onChange,
}: {
  selected: string[]
  options: string[]
  onChange: (v: string[]) => void
}) {
  function toggle(s: string) {
    onChange(selected.includes(s) ? selected.filter(x => x !== s) : [...selected, s])
  }
  function addNew() {
    const name = (window.prompt('New stage name') ?? '').trim()
    if (name && !selected.includes(name)) onChange([...selected, name])
  }
  return (
    <div className="flex flex-wrap gap-1">
      {options.map(s => {
        const on = selected.includes(s)
        return (
          <button
            key={s}
            type="button"
            onClick={() => toggle(s)}
            className={`px-2 py-0.5 text-xs rounded-full border ${on ? 'bg-accent text-white border-accent' : 'bg-bg-primary border-border text-text-secondary'}`}
          >
            {s}
          </button>
        )
      })}
      <button
        type="button"
        onClick={addNew}
        className="px-2 py-0.5 text-xs rounded-full border border-dashed border-border text-text-tertiary hover:text-text-primary"
        data-testid="add-new-stage"
      >
        + New stage…
      </button>
    </div>
  )
}

// ---- Empty pane (no file exists) ----

export function EmptyPane({ tab, onAddProjectFile }: { tab: Tab; onAddProjectFile: () => void }) {
  if (tab === 'project') {
    return (
      <div className="p-4 flex flex-col items-center justify-center h-full text-center space-y-2">
        <p className="text-sm text-text-secondary">No project commands.</p>
        <button
          onClick={onAddProjectFile}
          className="px-3 py-1.5 text-sm rounded bg-accent text-white hover:bg-accent/80"
        >
          Add project commands
        </button>
      </div>
    )
  }
  return <div className="p-4 text-sm text-text-secondary">No user commands.</div>
}

// ---- Two-step delete button ----

export function DeleteButton({ id, onDelete }: { id: string; onDelete: () => void }) {
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  return (
    <div className="pt-3 border-t border-border">
      {pendingDelete === id ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-secondary">Delete this command?</span>
          <button onClick={onDelete} className="text-xs text-red-400 hover:text-red-300">
            Confirm delete
          </button>
          <button onClick={() => setPendingDelete(null)} className="text-xs text-text-secondary hover:text-text-primary">
            Cancel
          </button>
        </div>
      ) : (
        <button onClick={() => setPendingDelete(id)} className="text-xs text-red-400 hover:text-red-300">
          Delete command
        </button>
      )}
    </div>
  )
}

// ---- Unsaved changes modal (tab-switch confirmation) ----

export function UnsavedChangesModal({
  tabName,
  onSave,
  onDiscard,
  onCancel,
}: {
  tabName: string
  onSave: () => void
  onDiscard: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-bg-secondary border border-border rounded-lg shadow-xl w-full max-w-sm mx-4 p-4 space-y-3">
        <h3 className="text-base font-medium text-text-primary">Unsaved changes</h3>
        <p className="text-sm text-text-secondary">
          You have unsaved changes to {tabName} commands.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onDiscard}
            className="px-3 py-1.5 text-sm rounded bg-bg-tertiary text-text-primary hover:bg-bg-secondary transition-colors"
          >
            Discard
          </button>
          <button
            onClick={onSave}
            className="px-3 py-1.5 text-sm rounded bg-accent text-white hover:bg-accent/80 transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

// ---- Args table (auto-derived from template placeholders) ----

export function ArgsTable({
  parsedArgs, argsMeta, updateArgMeta,
}: {
  parsedArgs: TemplateArg[]
  argsMeta: ArgSpec[]
  updateArgMeta: (name: string, patch: Partial<{ description: string; multiline: boolean }>) => void
}) {
  return (
    <Field label={`Arguments (${parsedArgs.length} detected)`}>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-text-tertiary">
            <th className="text-left pr-2 pb-1">Name</th>
            <th className="text-left pr-2 pb-1">Description</th>
            <th className="text-left pr-2 pb-1">Multi-line</th>
            <th className="text-left pb-1"></th>
          </tr>
        </thead>
        <tbody>
          {parsedArgs.map(a => {
            const meta = argsMeta.find(m => m.name === a.name)
            return (
              <tr key={a.name}>
                <td className="pr-2 py-0.5 font-mono">{a.name}</td>
                <td className="pr-2 py-0.5">
                  <input
                    type="text"
                    value={meta?.description ?? ''}
                    onChange={e => updateArgMeta(a.name, { description: e.target.value })}
                    className="w-full px-1 py-0.5 text-xs rounded border border-border bg-bg-primary text-text-primary"
                  />
                </td>
                <td className="pr-2 py-0.5">
                  <input
                    type="checkbox"
                    checked={meta?.multiline ?? false}
                    onChange={e => updateArgMeta(a.name, { multiline: e.target.checked })}
                    aria-label={`${a.name} multi-line`}
                    className="accent-accent"
                  />
                </td>
                <td className="py-0.5">
                  {a.optional && (
                    <span className="text-[10px] px-1 py-0.5 rounded bg-purple-500/20 text-purple-400">
                      optional
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Field>
  )
}

// ---- Command expanded editor (full-pane overlay) ----

export function CommandExpandedEditor({
  value, onChange, onClose,
}: {
  value: string
  onChange: (v: string) => void
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
      role="dialog"
    >
      <div
        className="bg-bg-secondary border border-border rounded-lg shadow-xl w-[min(900px,90vw)] h-[min(700px,85vh)] mx-4 flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
          <h3 className="text-sm font-medium text-text-primary">Command</h3>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary px-2"
            title="Close"
            data-testid="close-expanded-command"
          >
            ✕
          </button>
        </div>
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          className="flex-1 w-full p-4 text-sm font-mono bg-bg-primary text-text-primary resize-none focus:outline-none"
          autoFocus
          spellCheck={false}
          data-testid="expanded-command-textarea"
        />
        <div className="px-4 py-2 border-t border-border text-[11px] text-text-tertiary">
          Use {'{name}'} for args; {'--flag {name}'} makes the arg optional. Changes save as you type.
        </div>
      </div>
    </div>
  )
}
