/**
 * Renders a vertical stack of action buttons from commands.json, filtered by showWhen conditions.
 * Falls back to the default action set when no commands.json exists.
 */
import { useState, useCallback } from 'react'
import type { ActionDefinition, ConditionState, TemplateVars } from '../../features/commands/commandsConfig'
import { evaluateShowWhen, resolveTemplateVars, getDefaultCommandsConfig, matchesSurface } from '../../features/commands/commandsConfig'
import { executeAction, type ActionExecutionContext } from '../../features/commands/actionExecutor'
import { useAgentStore } from '../../store/agents'
import { DialogErrorBanner } from './ErrorBanner'

interface ActionButtonsProps {
  actions: ActionDefinition[] | null // null = use defaults
  conditionState: ConditionState
  templateVars: TemplateVars
  directory: string
  agentPtyId?: string
  agentId?: string | null
  onGitStatusRefresh?: () => void
  /** Called when an action specifies switchTab (e.g. "review") */
  onSwitchTab?: (tab: string) => void
  /** Filter actions by surface (e.g. 'source-control', 'review'). Defaults to 'source-control'. */
  surface?: string
  /** Opens the commands.json editor */
  onOpenCommandsEditor?: () => void
}

const STYLE_CLASSES: Record<string, string> = {
  primary: 'bg-accent text-white hover:bg-accent/80',
  secondary: 'bg-bg-tertiary text-text-primary hover:bg-bg-secondary',
  accent: 'bg-purple-600 text-white hover:bg-purple-500',
  danger: 'bg-orange-600 text-white hover:bg-orange-500',
}

export function ActionButtons({
  actions,
  conditionState,
  templateVars,
  directory,
  agentPtyId,
  agentId,
  onGitStatusRefresh,
  onSwitchTab,
  surface = 'source-control',
  onOpenCommandsEditor,
}: ActionButtonsProps) {
  const [loadingActions, setLoadingActions] = useState<Set<string>>(new Set())
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({})

  const effectiveActions = actions ?? getDefaultCommandsConfig().actions

  const visibleActions = effectiveActions.filter(action =>
    matchesSurface(action, surface) && evaluateShowWhen(action.showWhen, conditionState)
  )

  const handleClick = useCallback(async (action: ActionDefinition) => {
    // Switch to specified tab if configured
    if (action.switchTab && onSwitchTab) {
      onSwitchTab(action.switchTab)
    }

    setLoadingActions(prev => new Set(prev).add(action.id))
    setActionErrors(prev => {
      const { [action.id]: _, ...next } = prev
      return next
    })

    const ctx: ActionExecutionContext = {
      directory,
      agentPtyId,
      agentId,
      templateVars,
      onGitStatusRefresh,
    }

    const result = await executeAction(action, ctx)

    setLoadingActions(prev => {
      const next = new Set(prev)
      next.delete(action.id)
      return next
    })

    if (!result.success && result.error) {
      setActionErrors(prev => ({ ...prev, [action.id]: result.error! }))
    }
  }, [directory, agentPtyId, agentId, templateVars, onGitStatusRefresh, onSwitchTab])

  if (visibleActions.length === 0 && !onOpenCommandsEditor) return null

  return (
    <div className="px-3 py-2 border-b border-border flex flex-col gap-1.5">
      {visibleActions.map(action => {
        const isLoading = loadingActions.has(action.id)
        const error = actionErrors[action.id]
        const style = STYLE_CLASSES[action.style ?? 'secondary']
        const label = resolveTemplateVars(action.label, templateVars)
        const isApiMode = agentId ? useAgentStore.getState().agents.find(a => a.id === agentId)?.connectionMode === 'api' : false
        const isDisabled = isLoading || (action.type === 'agent' && !agentPtyId && !isApiMode)

        return (
          <div key={action.id}>
            <button
              onClick={() => void handleClick(action)}
              disabled={isDisabled}
              className={`w-full px-3 py-1.5 text-xs rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${style}`}
              title={isDisabled && action.type === 'agent' ? 'No agent available' : undefined}
            >
              {isLoading ? `${label}...` : label}
            </button>
            {error && (
              <div className="mt-1">
                <DialogErrorBanner
                  error={error}
                  label={`${label} failed`}
                  onDismiss={() => setActionErrors(prev => {
                    const { [action.id]: _, ...next } = prev
                    return next
                  })}
                />
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
    </div>
  )
}
