import { useState, useEffect } from 'react'
import type { ManagedRepo, GitHubIssue } from '../../../preload/index'

export function IssuesView({
  repo,
  onBack,
  onSelectIssue,
}: {
  repo: ManagedRepo
  onBack: () => void
  onSelectIssue: (issue: GitHubIssue) => void
}) {
  const [issues, setIssues] = useState<GitHubIssue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchIssues = async () => {
      try {
        const mainDir = `${repo.rootDir}/main`
        const result = await window.gh.issues(mainDir)
        setIssues(result)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    }
    void fetchIssues()
  }, [repo])

  return (
    <>
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <button onClick={onBack} className="text-text-secondary hover:text-text-primary transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h2 className="text-lg font-medium text-text-primary">Issues</h2>
          <p className="text-xs text-text-secondary">{repo.name} &middot; Assigned to me</p>
        </div>
      </div>

      <div className="p-4 max-h-80 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-8 text-text-secondary text-sm">
            <svg className="animate-spin w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading issues...
          </div>
        )}

        {error && (
          <div className="text-xs text-red-400 bg-red-400/10 rounded px-3 py-2 whitespace-pre-wrap">{error}</div>
        )}

        {!loading && !error && issues.length === 0 && (
          <div className="text-center text-text-secondary text-sm py-8">
            No open issues assigned to you.
          </div>
        )}

        {!loading && !error && issues.length > 0 && (
          <div className="space-y-1">
            {issues.map((issue) => (
              <button
                key={issue.number}
                onClick={() => onSelectIssue(issue)}
                className="w-full flex items-start gap-3 p-2 rounded border border-border bg-bg-primary hover:bg-bg-tertiary hover:border-accent transition-colors text-left"
              >
                <span className="text-accent font-mono text-xs mt-0.5 flex-shrink-0">#{issue.number}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-text-primary">{issue.title}</div>
                  {issue.labels.length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {issue.labels.map((label) => (
                        <span key={label} className="text-xs px-1.5 py-0.5 rounded-full bg-accent/20 text-accent">
                          {label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="px-4 py-3 border-t border-border flex justify-end">
        <button
          onClick={onBack}
          className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          Cancel
        </button>
      </div>
    </>
  )
}
