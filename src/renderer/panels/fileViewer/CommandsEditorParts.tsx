/**
 * Small helper components for CommandsEditor, extracted to keep the main file within line limits.
 */
import { useState } from 'react'

type Tab = 'user' | 'project'

// ---- Field wrapper ----

export function Field({
  label, hint, children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-text-secondary">{label}</label>
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
