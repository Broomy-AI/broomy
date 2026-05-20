import { useState, useMemo } from 'react'
import { parseTemplate } from '../../features/commands/templateParser'
import { substituteTemplate } from '../../features/commands/templateSubstitute'
import type { ArgValue, SubContext } from '../../features/commands/templateSubstitute'
import type { ArgSpec } from '../../features/commands/commandsConfig'

interface ArgDialogProps {
  title: string
  description?: string
  template: string
  argsMeta: ArgSpec[]
  context: SubContext
  initialValues?: Record<string, ArgValue>
  onRun: (values: Record<string, ArgValue>) => void
  onCancel: () => void
}

export function ArgDialog({ title, description, template, argsMeta, context, initialValues, onRun, onCancel }: ArgDialogProps) {
  const parsed = useMemo(() => parseTemplate(template), [template])
  const metaByName = useMemo(() => new Map(argsMeta.map(a => [a.name, a])), [argsMeta])

  const [values, setValues] = useState<Record<string, ArgValue>>(() => {
    const init: Record<string, ArgValue> = {}
    for (const a of parsed.args) {
      const prior = initialValues?.[a.name]
      init[a.name] = a.optional
        ? { value: prior?.value ?? '', enabled: prior?.enabled ?? false }
        : { value: prior?.value ?? '' }
    }
    return init
  })

  const requiredOk = parsed.args.every(a => a.optional || ((values[a.name] as ArgValue | undefined)?.value ?? '').length > 0)
  const resolved = substituteTemplate(template, { context, args: values })

  function update(name: string, patch: Partial<ArgValue>) {
    setValues(v => ({ ...v, [name]: { ...v[name], ...patch } }))
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onCancel()
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA' && requiredOk) {
      onRun(values)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onCancel}
      onKeyDown={onKeyDown}
      role="dialog"
    >
      <div className="bg-bg-secondary border border-border rounded-lg shadow-xl w-full max-w-md mx-4 p-4 space-y-3" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-medium text-text-primary">{title}</h3>
        {description && <p className="text-xs text-text-secondary">{description}</p>}

        {parsed.args.map(arg => {
          const meta = metaByName.get(arg.name)
          const v = values[arg.name]
          if (arg.optional) {
            return (
              <div key={arg.name} className="space-y-1">
                <div className="flex items-center gap-2 text-xs text-text-secondary">
                  <input
                    type="checkbox"
                    checked={v.enabled ?? false}
                    onChange={e => update(arg.name, { enabled: e.target.checked })}
                    className="accent-accent"
                    title={arg.flag ?? arg.name}
                  />
                  <span className="font-mono text-accent">{arg.flag}</span>
                </div>
                {v.enabled && (
                  <>
                    <label className="text-xs text-text-secondary">{arg.name}</label>
                    <input
                      aria-label={arg.name}
                      type="text"
                      value={v.value}
                      onChange={e => update(arg.name, { value: e.target.value })}
                      className="w-full px-2 py-1.5 text-sm rounded border border-border bg-bg-primary text-text-primary font-mono focus:outline-none focus:border-accent"
                    />
                    {meta?.description && <p className="text-[11px] text-text-tertiary">{meta.description}</p>}
                  </>
                )}
              </div>
            )
          }
          return (
            <div key={arg.name} className="space-y-1">
              <label className="text-xs text-text-secondary">{arg.name} <span className="text-red-400">*</span></label>
              <input
                aria-label={arg.name}
                type="text"
                value={v.value}
                onChange={e => update(arg.name, { value: e.target.value })}
                className="w-full px-2 py-1.5 text-sm rounded border border-border bg-bg-primary text-text-primary font-mono focus:outline-none focus:border-accent"
                autoFocus
              />
              {meta?.description && <p className="text-[11px] text-text-tertiary">{meta.description}</p>}
            </div>
          )
        })}

        <div className="pt-2 border-t border-border">
          <div className="text-[11px] text-text-tertiary">Resolved:</div>
          <code data-testid="resolved-preview" className="block text-xs font-mono text-text-primary break-all">{resolved}</code>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors">Cancel</button>
          <button
            disabled={!requiredOk}
            onClick={() => onRun(values)}
            className="px-3 py-1.5 text-sm rounded bg-accent text-white hover:bg-accent/80 transition-colors disabled:opacity-50"
          >
            Run
          </button>
        </div>
      </div>
    </div>
  )
}
