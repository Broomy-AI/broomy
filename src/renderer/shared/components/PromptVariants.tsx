/**
 * Per-agent prompt variant editor for CommandsEditor action cards.
 *
 * Shows expandable section cards for a "Generic" base prompt and optional
 * agent-specific overrides that can be added/removed.
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import type { ActionDefinition } from '../../features/commands/commandsConfig'

export function PromptVariants({
  action,
  onUpdate,
  fieldSlot: Field,
  agentTypes,
}: {
  action: ActionDefinition
  onUpdate: (updates: Partial<ActionDefinition>) => void
  fieldSlot: React.ComponentType<{ label: string; children: React.ReactNode }>
  agentTypes: string[]
}) {
  const [expandedVariant, setExpandedVariant] = useState<string | null>(null)
  const [showAddPicker, setShowAddPicker] = useState(false)

  const existingOverrides = Object.keys(action.agents ?? {})
  const availableTypes = agentTypes.filter((t) => !existingOverrides.includes(t))

  const toggleVariant = (key: string) => {
    setExpandedVariant(expandedVariant === key ? null : key)
  }

  const addVariant = (type: string) => {
    onUpdate({ agents: { ...(action.agents ?? {}), [type]: { prompt: '' } } })
    setShowAddPicker(false)
    setExpandedVariant(type)
  }

  const removeVariant = (type: string) => {
    const entries = Object.entries(action.agents ?? {}).filter(([k]) => k !== type)
    onUpdate({ agents: entries.length > 0 ? Object.fromEntries(entries) : undefined })
    if (expandedVariant === type) setExpandedVariant(null)
  }

  const updateVariantPrompt = (type: string, prompt: string) => {
    onUpdate({ agents: { ...(action.agents ?? {}), [type]: { prompt } } })
  }

  return (
    <Field label="Prompt">
      <div className="space-y-2">
        {/* Generic (base) prompt — always present */}
        <VariantCard
          label="Generic"
          badge="base"
          isExpanded={expandedVariant === 'generic'}
          onToggle={() => toggleVariant('generic')}
          testId={`variant-generic-${action.id}`}
        >
          <AutoTextarea
            value={action.prompt ?? ''}
            onChange={(e) => onUpdate({ prompt: e.target.value })}
            className="w-full px-2 py-1.5 text-sm rounded border border-border bg-bg-secondary text-text-primary font-mono focus:outline-none focus:border-accent resize-y"
            placeholder="Enter a prompt for the agent..."
            data-testid={`action-prompt-${action.id}`}
          />
          <TemplateVarsHint />
        </VariantCard>

        {/* Agent-specific overrides */}
        {existingOverrides.map((type) => (
          <VariantCard
            key={type}
            label={type.charAt(0).toUpperCase() + type.slice(1)}
            badge="override"
            isExpanded={expandedVariant === type}
            onToggle={() => toggleVariant(type)}
            onRemove={() => removeVariant(type)}
            testId={`variant-${type}-${action.id}`}
          >
            <AutoTextarea
              value={action.agents?.[type]?.prompt ?? ''}
              onChange={(e) => updateVariantPrompt(type, e.target.value)}
              className="w-full px-2 py-1.5 text-sm rounded border border-border bg-bg-secondary text-text-primary font-mono focus:outline-none focus:border-accent resize-y"
              placeholder={`Override prompt for ${type}... (leave empty to use generic)`}
              data-testid={`variant-prompt-${type}-${action.id}`}
            />
            <TemplateVarsHint />
          </VariantCard>
        ))}

        {/* Add agent variant */}
        {availableTypes.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setShowAddPicker(!showAddPicker)}
              className="w-full p-2 rounded border border-dashed border-border text-text-secondary hover:text-text-primary hover:border-text-tertiary transition-colors text-xs"
              data-testid={`add-variant-${action.id}`}
            >
              + Add agent variant
            </button>
            {showAddPicker && (
              <div
                className="absolute left-0 top-full mt-1 z-10 border border-border rounded bg-bg-secondary shadow-lg py-1 min-w-[140px]"
                data-testid={`variant-picker-${action.id}`}
              >
                {availableTypes.map((type) => (
                  <button
                    key={type}
                    onClick={() => addVariant(type)}
                    className="block w-full text-left px-3 py-1.5 text-sm text-text-primary hover:bg-bg-tertiary transition-colors"
                    data-testid={`pick-variant-${type}-${action.id}`}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Field>
  )
}

function AutoTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null)

  const resize = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(el.scrollHeight, 120)}px`
  }, [])

  useEffect(() => { resize() }, [props.value, resize])

  return (
    <textarea
      ref={ref}
      {...props}
      rows={undefined}
      onInput={(e) => {
        resize()
        props.onInput?.(e)
      }}
      style={{ minHeight: 120, ...props.style }}
    />
  )
}

const TEMPLATE_VARS: { name: string; description: string }[] = [
  { name: '{main}', description: 'The repo\'s default branch (e.g. main, master)' },
  { name: '{branch}', description: 'The current branch name' },
  { name: '{directory}', description: 'The repo\'s working directory path' },
  { name: '{issueNumber}', description: 'The linked GitHub issue number (empty if none)' },
]

export function TemplateVarsHint() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div className="relative mt-1" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-[11px] text-text-tertiary hover:text-accent transition-colors"
        data-testid="template-vars-hint"
      >
        Template variables
      </button>
      {open && (
        <div className="absolute left-0 bottom-full mb-1 z-10 border border-border rounded bg-bg-secondary shadow-lg p-2 min-w-[280px]">
          <table className="text-xs w-full">
            <tbody>
              {TEMPLATE_VARS.map((v) => (
                <tr key={v.name}>
                  <td className="pr-3 py-0.5 font-mono text-accent whitespace-nowrap">{v.name}</td>
                  <td className="py-0.5 text-text-secondary">{v.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function VariantCard({
  label,
  badge,
  isExpanded,
  onToggle,
  onRemove,
  testId,
  children,
}: {
  key?: string | number | bigint | null
  label: string
  badge: 'base' | 'override'
  isExpanded: boolean
  onToggle: () => void
  onRemove?: () => void
  testId: string
  children?: React.ReactNode
}) {
  return (
    <div className="rounded border border-border bg-bg-primary overflow-hidden">
      <div className="flex items-center">
        <button
          onClick={onToggle}
          className="flex-1 flex items-center gap-2 px-3 py-2 text-left hover:bg-bg-tertiary transition-colors"
          data-testid={testId}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
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
          <span className="text-sm text-text-primary">{label}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
            badge === 'base'
              ? 'bg-blue-500/20 text-blue-400'
              : 'bg-purple-500/20 text-purple-400'
          }`}>
            {badge}
          </span>
        </button>
        {onRemove && (
          <button
            onClick={onRemove}
            className="px-3 py-2 text-text-tertiary hover:text-red-400 transition-colors"
            title={`Remove ${label} override`}
            data-testid={`remove-${testId}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      {isExpanded && (
        <div className="px-3 pb-3 border-t border-border pt-2">
          {children}
        </div>
      )}
    </div>
  )
}
