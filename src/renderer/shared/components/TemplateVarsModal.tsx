/**
 * Picker for template variables, shared by every surface that accepts them.
 *
 * Shows each variable in the surface's syntax ({name} for data targets,
 * $BROOMY_NAME for shell targets) with its description and current live value.
 * Variables that can never carry a value on this surface render dimmed with a
 * reason rather than being hidden, so the list matches the documentation.
 */
import { useMemo, useState } from 'react'
import {
  TEMPLATE_VARS, buildTemplateVars, isAvailableAt, UNAVAILABLE_REASON,
  type TemplateVarDef, type TemplateVarInput, type TemplateVarSurface,
} from '../../features/commands/templateVars'

/** Data targets take {name}; shell targets take $BROOMY_NAME. */
export function insertionTextFor(def: TemplateVarDef, surface: TemplateVarSurface): string {
  return surface === 'command' || surface === 'envValue' ? `{${def.name}}` : `$${def.envName}`
}

interface TemplateVarsModalProps {
  surface: TemplateVarSurface
  varInput: TemplateVarInput
  onInsert: (text: string) => void
  onClose: () => void
  /** Shown under the list — e.g. that PR values are empty on a new session. */
  footerNote?: string
}

export function TemplateVarsModal({ surface, varInput, onInsert, onClose, footerNote }: TemplateVarsModalProps) {
  const [query, setQuery] = useState('')
  const values = useMemo(() => buildTemplateVars(varInput), [varInput])

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = TEMPLATE_VARS.filter(v =>
      !q ||
      v.name.toLowerCase().includes(q) ||
      v.envName.toLowerCase().includes(q) ||
      v.description.toLowerCase().includes(q)
    )
    const out = new Map<string, TemplateVarDef[]>()
    for (const v of matches) {
      const list = out.get(v.group) ?? []
      list.push(v)
      out.set(v.group, list)
    }
    return [...out.entries()]
  }, [query])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/60"
      onClick={onClose}
      onKeyDown={e => { if (e.key === 'Escape') onClose() }}
      role="dialog"
      aria-label="Template variables"
      tabIndex={-1}
    >
      <div
        className="bg-bg-secondary border border-border rounded-lg shadow-xl w-[min(560px,90vw)] max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
          <h3 className="text-sm font-medium text-text-primary">Template variables</h3>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary px-2"
            title="Close"
            data-testid="close-template-vars"
          >
            ✕
          </button>
        </div>

        <div className="px-4 py-2 border-b border-border">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search variables…"
            autoFocus
            className="w-full px-2 py-1.5 text-sm rounded border border-border bg-bg-primary text-text-primary focus:outline-none focus:border-accent"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {groups.length === 0 && (
            <p className="p-3 text-sm text-text-secondary">No variables match.</p>
          )}
          {groups.map(([group, vars]) => (
            <div key={group} className="mb-2">
              <div className="px-2 py-1 text-2xs uppercase tracking-wide text-text-tertiary">{group}</div>
              {vars.map(v => {
                const available = isAvailableAt(v, surface)
                const value = values[v.name]
                return (
                  <button
                    key={v.name}
                    type="button"
                    disabled={!available}
                    onClick={() => { onInsert(insertionTextFor(v, surface)); onClose() }}
                    className={`w-full text-left px-2 py-1.5 rounded flex items-baseline gap-2 ${
                      available ? 'hover:bg-bg-tertiary' : 'opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <span className="text-sm font-mono text-text-primary shrink-0">
                      {insertionTextFor(v, surface)}
                    </span>
                    <span className="text-2xs text-text-secondary flex-1 truncate">{v.description}</span>
                    <span className="text-2xs font-mono text-text-tertiary truncate max-w-[40%]">
                      {available ? (value || '—') : UNAVAILABLE_REASON[surface]}
                    </span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        <div className="px-4 py-2 border-t border-border text-2xs text-text-tertiary">
          {footerNote ?? 'Click a variable to insert it at the cursor.'}
        </div>
      </div>
    </div>
  )
}
