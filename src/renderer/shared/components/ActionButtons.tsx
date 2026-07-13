import { useState, useCallback, useMemo, useRef } from 'react'
import type { ActionDefinition, ConditionState } from '../../features/commands/commandsConfig'
import type { SubContext, ArgValue } from '../../features/commands/templateSubstitute'
import { isVisible, discoverStages } from '../../features/commands/commandsConfig'
import { parseTemplate } from '../../features/commands/templateParser'
import { executeAction, type ActionExecutionContext } from '../../features/commands/actionExecutor'
import { useAgentStore } from '../../store/agents'
import { ENABLE_AGENT_SDK } from '../../../shared/featureFlags'
import { DialogErrorBanner } from './ErrorBanner'
import { StagePill } from './StagePill'
import { ArgDialog } from './ArgDialog'
import { SetupCta } from './SetupCta'

interface ActionButtonsProps {
  actions: ActionDefinition[] | null
  /** True while commands.json is still being read. Avoids flashing the Setup CTA. */
  loading?: boolean
  conditionState: ConditionState
  templateVars: SubContext
  currentStage: string
  directory: string
  agentPtyId?: string
  agentId?: string | null
  onGitStatusRefresh?: () => void
  onSwitchTab?: (tab: string) => void
  surface?: string
  onOpenCommandsEditor?: () => void
  onSetSessionStage: (stage: string) => void
  onSetup: () => void
}

const STYLE_CLASSES: Record<string, string> = {
  primary: 'bg-accent text-white hover:bg-accent/80',
  secondary: 'bg-bg-tertiary text-text-primary hover:bg-bg-secondary',
  accent: 'bg-review-solid text-white hover:bg-review-base',
  danger: 'bg-attention-solid text-white hover:bg-attention-base',
}

function slashSubtitle(template: string): string | null {
  if (template.includes('\n')) return null
  if (!template.startsWith('/')) return null
  return template.split(/\s+/)[0]
}

export function ActionButtons(props: ActionButtonsProps) {
  const {
    actions, loading = false, conditionState, templateVars, currentStage, directory,
    agentPtyId, agentId, onGitStatusRefresh, onSwitchTab, surface = 'source-control',
    onOpenCommandsEditor, onSetSessionStage, onSetup,
  } = props

  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [argDialogAction, setArgDialogAction] = useState<ActionDefinition | null>(null)
  const lastUsedArgs = useRef<Map<string, Record<string, ArgValue>>>(new Map())

  const allActions = actions ?? []
  const visible = allActions.filter(a => isVisible(a, conditionState, currentStage, surface))
  const stagesShown = useMemo(() =>
    allActions.some(a => a.stages || a.setStage !== undefined),
  [allActions])
  const stageOptions = useMemo(() => discoverStages(allActions, currentStage), [allActions, currentStage])

  const isApiMode = ENABLE_AGENT_SDK && agentId
    ? useAgentStore.getState().agents.find(a => a.id === agentId)?.connectionMode === 'api'
    : false

  const dispatch = useCallback(async (action: ActionDefinition, argValues: Record<string, ArgValue>) => {
    if (action.switchTab && onSwitchTab) onSwitchTab(action.switchTab)
    setLoadingIds(prev => new Set(prev).add(action.id))
    setErrors(prev => { const { [action.id]: _, ...rest } = prev; return rest })

    const ctx: ActionExecutionContext = {
      directory, agentPtyId, agentId, templateVars, argValues, onGitStatusRefresh,
    }
    const result = await executeAction(action, ctx)

    setLoadingIds(prev => { const next = new Set(prev); next.delete(action.id); return next })
    if (!result.success && result.error) setErrors(prev => ({ ...prev, [action.id]: result.error! }))
  }, [directory, agentPtyId, agentId, templateVars, onGitStatusRefresh, onSwitchTab])

  const onClick = (action: ActionDefinition) => {
    const parsed = parseTemplate(action.template)
    if (parsed.args.length === 0) {
      void dispatch(action, {})
      return
    }
    setArgDialogAction(action)
  }

  if (allActions.length === 0) {
    if (loading) {
      return (
        <div className="px-3 py-3 border-b border-border text-xs text-text-tertiary" data-testid="commands-loading">
          Loading commands…
        </div>
      )
    }
    return <SetupCta onSetup={onSetup} />
  }

  return (
    <div className="px-3 py-2 border-b border-border flex flex-col gap-1.5">
      {stagesShown && (
        <div className="flex justify-start pb-1">
          <StagePill currentStage={currentStage} allStages={stageOptions} onSelect={onSetSessionStage} />
        </div>
      )}
      {visible.map(action => {
        const subtitle = slashSubtitle(action.template)
        const style = STYLE_CLASSES[action.style ?? 'secondary']
        const isLoading = loadingIds.has(action.id)
        const isAgentTemplate = !action.template.startsWith('!')
        const disabled = isLoading || (isAgentTemplate && !agentPtyId && !isApiMode)
        const opensDialog = parseTemplate(action.template).args.length > 0
        const err = errors[action.id]

        return (
          <div key={action.id}>
            <button
              onClick={() => onClick(action)}
              disabled={disabled}
              title={action.description ?? (disabled && isAgentTemplate ? 'No agent available' : undefined)}
              className={`w-full px-3 py-2 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-start ${style}`}
            >
              <span className="text-sm">{isLoading || opensDialog ? `${action.label}…` : action.label}</span>
              {subtitle && <span className="text-3xs opacity-70 font-mono">{subtitle}</span>}
            </button>
            {err && (
              <div className="mt-1">
                <DialogErrorBanner error={err} label={`${action.label} failed`} onDismiss={() => setErrors(p => { const { [action.id]: _, ...r } = p; return r })} />
              </div>
            )}
          </div>
        )
      })}
      {onOpenCommandsEditor && (
        <button
          onClick={onOpenCommandsEditor}
          className="mt-1 text-xs text-text-tertiary hover:text-text-primary transition-colors"
          data-testid="edit-commands-link"
        >
          edit commands
        </button>
      )}

      {argDialogAction && (
        <ArgDialog
          title={argDialogAction.label}
          description={argDialogAction.description}
          template={argDialogAction.template}
          argsMeta={argDialogAction.args ?? []}
          context={templateVars}
          initialValues={lastUsedArgs.current.get(argDialogAction.id)}
          onRun={(values) => {
            const a = argDialogAction
            lastUsedArgs.current.set(a.id, values)
            setArgDialogAction(null)
            void dispatch(a, values)
          }}
          onCancel={() => setArgDialogAction(null)}
        />
      )}
    </div>
  )
}
