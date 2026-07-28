import { useState } from 'react'
import { TemplateVarsModal, TemplateVarsButton } from '../../shared/components/TemplateVarsModal'
import { useInsertAtCursor } from '../../shared/hooks/useInsertAtCursor'

/**
 * Command input with a template variable picker.
 *
 * Inserts the $BROOMY_ form: this string is handed to a shell, so session
 * values arrive as environment variables rather than being spliced into the
 * command line. Settings has no session in scope, so live values read as "—".
 */
export function AgentCommandField({
  command, onCommandChange,
}: {
  command: string
  onCommandChange: (v: string) => void
}) {
  const [showVars, setShowVars] = useState(false)
  const { ref, insert } = useInsertAtCursor<HTMLInputElement>()
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <input
          ref={ref}
          type="text"
          value={command}
          onChange={(e) => onCommandChange(e.target.value)}
          placeholder="Command (e.g., claude)"
          className="flex-1 px-3 py-2 bg-bg-secondary border border-border rounded text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-accent"
        />
        <TemplateVarsButton
          onClick={() => setShowVars(true)}
          testId="open-template-vars-agent-command"
          className="px-2 py-2 shrink-0"
        />
      </div>
      {showVars && (
        <TemplateVarsModal
          surface="agent"
          varInput={{ directory: '' }}
          footerNote="Values arrive as environment variables. Pull request values are empty until the branch has a PR."
          onInsert={(t) => insert(t, command, onCommandChange)}
          onClose={() => setShowVars(false)}
        />
      )}
    </div>
  )
}
