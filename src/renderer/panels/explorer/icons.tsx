/**
 * SVG icon components and status badges used throughout the explorer panel.
 */
import type { BranchStatus } from '../../store/sessions'
import { statusLabel, statusBadgeColor } from '../../features/git/explorerHelpers'

// Inline SVG icons
export const FileTreeIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M1.5 1h3l1 1H14v11H1.5V1zm1 1v10h10V3H5.5l-1-1H2.5z" />
    <path d="M4 6h8v1H4zm0 2h6v1H4z" />
  </svg>
)

export const SourceControlIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="18" r="3" />
    <circle cx="6" cy="6" r="3" />
    <path d="M6 21V9a9 9 0 0 0 9 9" />
  </svg>
)

export const SearchIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z" />
  </svg>
)

export const ReviewIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <path d="M9 15l2 2 4-4" />
  </svg>
)

export const RecentIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
)

// Status letter badge
export const StatusBadge = ({ status }: { status: string }) => {
  const letter = status.charAt(0).toUpperCase()
  const color = statusBadgeColor(status)
  return <span className={`text-xs font-mono ${color}`} title={statusLabel(status)}>{letter}</span>
}

export function BranchStatusCard({ status }: { status: BranchStatus }) {
  const config: Partial<Record<BranchStatus, { label: string; chipClasses: string; description: string }>> = {
    pushed: {
      label: 'PUSHED',
      chipClasses: 'bg-info-base/20 text-info-fg',
      description: 'Changes pushed to remote.',
    },
    empty: {
      label: 'EMPTY',
      chipClasses: 'bg-muted/20 text-text-secondary',
      description: 'No changes on this branch.',
    },
    open: {
      label: 'PR OPEN',
      chipClasses: 'bg-success-base/20 text-success-fg',
      description: 'Pull request is open.',
    },
    merged: {
      label: 'MERGED',
      chipClasses: 'bg-review-base/20 text-review-fg',
      description: 'Merged into main.',
    },
    closed: {
      label: 'CLOSED',
      chipClasses: 'bg-danger-base/20 text-danger-fg',
      description: 'PR was closed.',
    },
  }

  const c = config[status]
  if (!c) return null

  return (
    <div className="flex flex-col items-center gap-2">
      <span className={`text-xs px-2 py-1 rounded font-medium ${c.chipClasses}`}>
        {c.label}
      </span>
      <span className="text-xs text-text-secondary text-center">{c.description}</span>
    </div>
  )
}
