/**
 * Collapsible section for generating and viewing a screenshot walkthrough.
 */
import { CollapsibleSection } from '../CollapsibleSection'
import type { WalkthroughDataState } from './useWalkthroughData'
import type { WalkthroughActionsState } from './useWalkthroughActions'

export function WalkthroughSection({
  data,
  actions,
  directory,
  onSelectFile,
}: {
  data: WalkthroughDataState
  actions: WalkthroughActionsState
  directory: string
  onSelectFile?: (filePath: string, openInDiffMode: boolean) => void
}) {
  const walkthroughPath = `${directory}/.broomy/walkthrough.html`

  return (
    <CollapsibleSection title="Walkthrough" defaultOpen={true}>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <button
            onClick={actions.handleGenerateWalkthrough}
            disabled={actions.waitingForAgent}
            className="px-2 py-1 text-xs rounded bg-accent text-white hover:bg-accent/80 disabled:opacity-50 transition-colors"
          >
            {actions.waitingForAgent ? (
              <span className="flex items-center gap-1.5">
                <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Waiting for agent...
              </span>
            ) : data.exists ? 'Regenerate Walkthrough' : 'Generate Walkthrough'}
          </button>

          {data.exists && onSelectFile && (
            <button
              onClick={() => onSelectFile(walkthroughPath, false)}
              className="px-2 py-1 text-xs rounded bg-bg-tertiary text-text-secondary hover:text-text-primary hover:bg-bg-secondary transition-colors"
            >
              View Walkthrough
            </button>
          )}
        </div>

        {data.exists && (
          <div className="text-xs text-text-secondary">
            Walkthrough available at <code className="font-mono bg-bg-tertiary px-1 rounded">.broomy/walkthrough.html</code>
          </div>
        )}

        {!data.exists && !actions.waitingForAgent && (
          <div className="text-xs text-text-secondary">
            Generate a screenshot walkthrough documenting the feature flow.
          </div>
        )}
      </div>
    </CollapsibleSection>
  )
}
