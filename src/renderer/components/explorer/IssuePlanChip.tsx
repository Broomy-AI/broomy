/**
 * Chip component that displays issue plan status and allows viewing or requesting a plan.
 */
import type { NavigationTarget } from '../../utils/fileNavigation'
import { sendSkillAwarePrompt } from '../../utils/skillAwarePrompt'

const ClipboardIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    <path d="M9 14l2 2 4-4" />
  </svg>
)

const QuestionIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
)

interface IssuePlanChipProps {
  directory: string
  issueNumber?: number
  issuePlanExists?: boolean
  agentPtyId?: string
  agentId?: string | null
  onFileSelect?: (target: NavigationTarget) => void
}

export function IssuePlanChip({ directory, issueNumber, issuePlanExists, agentPtyId, agentId, onFileSelect }: IssuePlanChipProps) {
  if (issuePlanExists) {
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

  if (issueNumber) {
    return (
      <div className="px-3 py-1.5 border-b border-border">
        <button
          onClick={() => {
            if (!agentPtyId) return
            const command = `Read issue #${issueNumber} using \`gh issue view ${issueNumber}\`. Before doing anything, ask me any questions about the issue to clarify requirements and resolve ambiguities. Then write a plan to .broomy/output/plan.md that includes: a detailed description of what you will do, and any open questions or assumptions.`
            void sendSkillAwarePrompt({
              action: 'plan-issue',
              agentPtyId,
              directory,
              agentId: agentId ?? null,
              fallbackPrompt: command,
              context: { issueNumber },
            })
          }}
          disabled={!agentPtyId}
          className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors ${
            agentPtyId
              ? 'bg-bg-tertiary text-text-secondary hover:text-text-primary hover:bg-accent/20'
              : 'bg-bg-tertiary text-text-secondary/50 cursor-not-allowed'
          }`}
          title={agentPtyId ? 'Ask agent to plan this issue' : 'No agent terminal available'}
        >
          <QuestionIcon />
          Ask agent to plan this issue
        </button>
      </div>
    )
  }

  return null
}
