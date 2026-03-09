/**
 * Chip component that displays a link to view the issue plan when one exists.
 * The "plan issue" action is now handled by the action system in commands.json.
 */
import type { NavigationTarget } from '../../utils/fileNavigation'

const ClipboardIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    <path d="M9 14l2 2 4-4" />
  </svg>
)

interface IssuePlanChipProps {
  directory: string
  issuePlanExists?: boolean
  onFileSelect?: (target: NavigationTarget) => void
}

export function IssuePlanChip({ directory, issuePlanExists, onFileSelect }: IssuePlanChipProps) {
  if (!issuePlanExists) return null

  return (
    <div className="px-3 py-1.5 border-b border-border">
      <button
        onClick={() => onFileSelect?.({ filePath: `${directory}/.broomy/output/plan.md`, openInDiffMode: false })}
        className="inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors bg-bg-tertiary text-text-secondary hover:text-text-primary hover:bg-accent/20"
        title="Show issue plan"
      >
        <ClipboardIcon />
        Show plan
      </button>
    </div>
  )
}
