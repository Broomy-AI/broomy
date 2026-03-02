/**
 * Collapsible section that displays automated check results with status icons and expandable output.
 */
import { useState } from 'react'
import { CollapsibleSection } from '../CollapsibleSection'
import type { CheckResult } from '../../../types/checks'
import type { ChecksRunnerState } from './useChecksRunner'

function StatusIcon({ status }: { status: CheckResult['status'] }) {
  if (status === 'running') {
    return (
      <svg className="animate-spin w-3.5 h-3.5 text-text-secondary" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    )
  }
  if (status === 'passed') {
    return (
      <svg className="w-3.5 h-3.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    )
  }
  if (status === 'failed') {
    return (
      <svg className="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    )
  }
  // pending / skipped
  return <div className="w-3.5 h-3.5 rounded-full border border-border" />
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function CheckItem({ result, label }: { result: CheckResult; label: string }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={() => result.output && setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-bg-tertiary/50 transition-colors"
      >
        <StatusIcon status={result.status} />
        <span className="text-text-primary flex-1 text-left">{label}</span>
        {result.durationMs > 0 && (
          <span className="text-xs text-text-secondary">{formatDuration(result.durationMs)}</span>
        )}
        {result.output && (
          <svg
            className={`w-3 h-3 text-text-secondary transition-transform ${expanded ? 'rotate-90' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        )}
      </button>
      {expanded && result.output && (
        <div className="px-2 pb-2">
          <pre className="text-xs font-mono text-text-secondary bg-bg-primary rounded p-2 overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap">
            {result.output}
          </pre>
        </div>
      )}
    </div>
  )
}

export function ChecksSection({ state }: { state: ChecksRunnerState }) {
  const { results, isRunning, checks, runChecks } = state
  const passedCount = results.filter((r) => r.status === 'passed').length
  const failedCount = results.filter((r) => r.status === 'failed').length

  const summaryCount = results.length > 0
    ? (failedCount > 0 ? failedCount : passedCount)
    : undefined

  return (
    <CollapsibleSection
      title="Checks"
      count={summaryCount}
      defaultOpen={true}
    >
      <div className="space-y-1">
        <div className="flex items-center justify-end mb-2">
          <button
            onClick={runChecks}
            disabled={isRunning}
            className="px-2 py-1 text-xs rounded bg-accent text-white hover:bg-accent/80 disabled:opacity-50 transition-colors"
          >
            {isRunning ? 'Running...' : 'Run Checks'}
          </button>
        </div>

        {results.length === 0 && (
          <div className="text-xs text-text-secondary text-center py-2">
            Click "Run Checks" to run {checks.length} check{checks.length !== 1 ? 's' : ''}.
          </div>
        )}

        {results.length > 0 && (
          <div className="rounded border border-border overflow-hidden">
            {results.map((result) => {
              const check = checks.find((c) => c.id === result.id)
              return (
                <CheckItem
                  key={result.id}
                  result={result}
                  label={check?.label ?? result.id}
                />
              )
            })}
          </div>
        )}
      </div>
    </CollapsibleSection>
  )
}
