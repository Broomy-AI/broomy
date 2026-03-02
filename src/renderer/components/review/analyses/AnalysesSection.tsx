/**
 * Collapsible section displaying agent analysis results with severity badges and location links.
 */
import { CollapsibleSection } from '../CollapsibleSection'
import { SeverityBadge } from '../ReviewHelpers'
import type { AnalysisResult, AnalysisFinding } from '../../../types/analysis'
import { BUILTIN_ANALYSES } from './analysisDefinitions'
import type { AnalysesActionsState } from './useAnalysesActions'

function FindingSeverityBadge({ severity }: { severity: AnalysisFinding['severity'] }) {
  const mapped = severity === 'critical' ? 'concern' : severity
  return <SeverityBadge severity={mapped} />
}

function AnalysisCard({
  id,
  result,
  isWaiting,
  onRun,
  onClickLocation,
}: {
  id: string
  result?: AnalysisResult
  isWaiting: boolean
  onRun: () => void
  onClickLocation?: (file: string, line?: number) => void
}) {
  const def = BUILTIN_ANALYSES.find((a) => a.id === id)
  const label = def?.label ?? id

  return (
    <div className="rounded border border-border overflow-hidden">
      <div className="flex items-center gap-2 px-2 py-1.5 bg-bg-tertiary/30">
        <span className="text-sm text-text-primary flex-1">{label}</span>
        {isWaiting && (
          <span className="flex items-center gap-1 text-xs text-text-secondary">
            <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Waiting...
          </span>
        )}
        {result && !isWaiting && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">
            {result.findings.length} finding{result.findings.length !== 1 ? 's' : ''}
          </span>
        )}
        <button
          onClick={onRun}
          className="px-1.5 py-0.5 text-xs rounded bg-bg-tertiary text-text-secondary hover:text-text-primary hover:bg-bg-secondary transition-colors"
          title={`Run ${label}`}
        >
          Run
        </button>
      </div>

      {result && (
        <div className="px-2 py-2 space-y-2">
          {result.summary && (
            <div className="text-xs text-text-secondary">{result.summary}</div>
          )}
          {result.findings.map((finding, i) => (
            <div key={i} className="text-sm">
              <div className="flex items-center gap-2">
                <FindingSeverityBadge severity={finding.severity} />
                <span className="font-medium text-text-primary">{finding.title}</span>
              </div>
              <div className="text-text-secondary text-xs mt-0.5">{finding.description}</div>
              {finding.file && (
                <button
                  onClick={() => onClickLocation?.(finding.file!, finding.line)}
                  className="text-xs text-accent hover:text-accent/80 font-mono mt-0.5 transition-colors"
                >
                  {finding.file}{finding.line ? `:${finding.line}` : ''}
                </button>
              )}
            </div>
          ))}
          {result.findings.length === 0 && (
            <div className="text-xs text-green-400">No issues found.</div>
          )}
        </div>
      )}
    </div>
  )
}

export function AnalysesSection({
  enabledAnalyses,
  results,
  actions,
  onClickLocation,
}: {
  enabledAnalyses: string[]
  results: Map<string, AnalysisResult>
  actions: AnalysesActionsState
  onClickLocation?: (file: string, line?: number) => void
}) {
  const totalFindings = Array.from(results.values()).reduce((sum, r) => sum + r.findings.length, 0)

  return (
    <CollapsibleSection
      title="Analyses"
      count={totalFindings > 0 ? totalFindings : undefined}
      defaultOpen={true}
    >
      <div className="space-y-2">
        {enabledAnalyses.length > 1 && (
          <div className="flex justify-end mb-1">
            <button
              onClick={actions.handleRunAllAnalyses}
              className="px-2 py-1 text-xs rounded bg-accent text-white hover:bg-accent/80 transition-colors"
            >
              Run All
            </button>
          </div>
        )}

        {enabledAnalyses.map((id) => (
          <AnalysisCard
            key={id}
            id={id}
            result={results.get(id)}
            isWaiting={actions.waitingFor.has(id)}
            onRun={() => actions.handleRunAnalysis(id)}
            onClickLocation={onClickLocation}
          />
        ))}
      </div>
    </CollapsibleSection>
  )
}
