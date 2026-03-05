/**
 * Condition picker for action showWhen configuration.
 *
 * Shows only active conditions as a compact list. Each row shows the
 * human-readable label, a true/false dropdown, and an X to remove.
 * An "add condition" button opens a full-screen modal to pick from
 * remaining conditions with descriptions.
 */
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'

const CONDITION_LABELS: Record<string, string> = {
  'has-changes': 'Has changes',
  'clean': 'Clean working tree',
  'merging': 'Merge in progress',
  'conflicts': 'Has conflicts',
  'no-tracking': 'No tracking branch',
  'ahead': 'Ahead of remote',
  'behind': 'Behind remote',
  'behind-main': 'Behind main',
  'on-main': 'On main branch',
  'in-progress': 'In progress',
  'pushed': 'Pushed',
  'empty': 'Empty branch',
  'open': 'PR open',
  'merged': 'PR merged',
  'closed': 'PR closed',
  'no-pr': 'No PR',
  'has-write-access': 'Write access',
  'allow-push-to-main': 'Push to main allowed',
  'has-issue': 'Issue linked',
  'no-devcontainer': 'No devcontainer',
  'review': 'Review session',
}

const CONDITION_DESCRIPTIONS: Record<string, string> = {
  'has-changes': 'Working tree has uncommitted changes',
  'clean': 'Working tree is clean (no uncommitted changes)',
  'merging': 'A merge is currently in progress',
  'conflicts': 'There are unresolved merge conflicts',
  'no-tracking': 'Branch has no remote tracking branch set',
  'ahead': 'Local branch is ahead of the remote tracking branch',
  'behind': 'Local branch is behind the remote tracking branch',
  'behind-main': 'Branch is behind the main branch',
  'on-main': 'Currently on the main or master branch',
  'in-progress': 'Feature branch work is in progress',
  'pushed': 'Changes have been pushed to remote',
  'empty': 'No commits on this branch yet',
  'open': 'A pull request is open for this branch',
  'merged': 'The pull request has been merged',
  'closed': 'The pull request has been closed',
  'no-pr': 'No pull request exists for this branch',
  'has-write-access': 'User has write access to the repository',
  'allow-push-to-main': 'Direct pushes to main are allowed',
  'has-issue': 'An issue is linked to this session',
  'no-devcontainer': 'No devcontainer configuration found',
  'review': 'This session is a review of someone else\'s work',
}

const ALL_TOKENS = Object.keys(CONDITION_LABELS)

/** Parse a showWhen token into its base token and whether it's negated */
function parseToken(raw: string): { token: string; negated: boolean } {
  if (raw.startsWith('!')) return { token: raw.slice(1), negated: true }
  return { token: raw, negated: false }
}

function ConditionPickerModal({ availableTokens, onSelect, onClose }: {
  availableTokens: string[]
  onSelect: (token: string) => void
  onClose: () => void
}) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      data-testid="condition-modal"
    >
      <div className="bg-bg-primary border border-border rounded-lg shadow-xl w-[400px] max-h-[70vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-medium text-text-primary">Add Condition</h3>
          <button
            onClick={onClose}
            className="p-1 text-text-secondary hover:text-text-primary transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18" /><path d="M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {availableTokens.map((token) => (
            <button
              key={token}
              onClick={() => onSelect(token)}
              className="w-full text-left px-4 py-2.5 hover:bg-bg-tertiary transition-colors"
              data-testid={`add-condition-${token}`}
            >
              <div className="text-xs font-medium text-text-primary">{CONDITION_LABELS[token] ?? token}</div>
              <div className="text-xs text-text-tertiary mt-0.5">{CONDITION_DESCRIPTIONS[token] ?? ''}</div>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function ShowWhenPicker({ showWhen, onChange }: { showWhen: string[]; onChange: (showWhen: string[]) => void }) {
  const [showModal, setShowModal] = useState(false)

  const activeTokens = showWhen.map(parseToken)
  const usedTokens = new Set(activeTokens.map((a) => a.token))
  const availableTokens = ALL_TOKENS.filter((t) => !usedTokens.has(t))

  const remove = (token: string) => {
    onChange(showWhen.filter((t) => t !== token && t !== `!${token}`))
  }

  const setValue = (token: string, negated: boolean) => {
    const without = showWhen.filter((t) => t !== token && t !== `!${token}`)
    onChange([...without, negated ? `!${token}` : token])
  }

  const addCondition = (token: string) => {
    onChange([...showWhen, token])
    setShowModal(false)
  }

  return (
    <div className="space-y-1" data-testid="show-when-picker">
      {activeTokens.map(({ token, negated }) => {
        const label = CONDITION_LABELS[token] ?? token
        return (
          <div key={token} className="flex items-center gap-1.5 text-xs">
            <span className="text-text-primary">{label}</span>
            <span className="text-text-tertiary">is</span>
            <select
              value={negated ? 'false' : 'true'}
              onChange={(e) => setValue(token, e.target.value === 'false')}
              className="px-1.5 py-0.5 text-xs rounded border border-border bg-bg-secondary text-text-primary focus:outline-none focus:border-accent"
              data-testid={`condition-value-${token}`}
            >
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
            <button
              onClick={() => remove(token)}
              className="text-text-tertiary hover:text-text-primary transition-colors ml-auto"
              title="Remove condition"
              data-testid={`condition-remove-${token}`}
            >
              &times;
            </button>
          </div>
        )
      })}

      <button
        onClick={() => setShowModal(true)}
        className="text-xs text-text-tertiary hover:text-text-primary transition-colors"
        data-testid="add-condition"
        disabled={availableTokens.length === 0}
      >
        + add condition
      </button>

      {showModal && availableTokens.length > 0 && (
        <ConditionPickerModal
          availableTokens={availableTokens}
          onSelect={addCondition}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}
