/**
 * Banners shown above a terminal after its process exits.
 *
 * ExitErrorBanner (red) is for exits that come with a detailed explanation (e.g. the Docker
 * out-of-memory kill); clicking the message opens the detail. AgentExitBanner (yellow) is for an
 * agent that exited without one, and offers Restart Agent. Both can be dismissed with ×; a restart
 * clears them too.
 */
import { useErrorStore } from '../../store/errors'
import type { ExitInfo } from './hooks/useTerminalSetup'

export function ExitErrorBanner({ exitInfo, onDismiss }: { exitInfo: ExitInfo; onDismiss: () => void }) {
  const { showErrorDetail } = useErrorStore()

  const handleClick = () => {
    if (exitInfo.detail) {
      showErrorDetail({
        id: 'exit-error',
        message: exitInfo.message,
        displayMessage: exitInfo.message,
        detail: exitInfo.detail,
        scope: 'app',
        dismissed: false,
        timestamp: Date.now(),
      })
    }
  }

  return (
    <div data-exit-error-banner className="mx-2 mt-2 px-3 py-2 rounded bg-danger-base/10 border border-danger-base/30 text-xs text-danger-fg shrink-0 flex items-center justify-between">
      <button
        onClick={handleClick}
        className={`flex-1 text-left ${exitInfo.detail ? 'cursor-pointer hover:text-danger-soft' : 'cursor-default'}`}
        title={exitInfo.detail ? 'Click for details' : undefined}
      >
        {exitInfo.message}
      </button>
      <button className="ml-2 hover:text-danger-soft" onClick={onDismiss} aria-label="Dismiss">
        &times;
      </button>
    </div>
  )
}

export function AgentExitBanner({ exitInfo, onRestart, onDismiss }: { exitInfo: ExitInfo; onRestart: () => void; onDismiss: () => void }) {
  return (
    <div data-agent-exit-banner className="mx-2 mt-2 px-3 py-2 rounded bg-warning-base/10 border border-warning-base/30 text-xs text-warning-soft shrink-0 flex items-center justify-between">
      <span>{exitInfo.message}</span>
      <div className="flex items-center shrink-0">
        <button
          className="ml-3 px-2 py-0.5 rounded bg-warning-base/20 hover:bg-warning-base/30 font-medium transition-colors"
          onClick={onRestart}
        >
          Restart Agent
        </button>
        <button className="ml-2 hover:text-warning-subtle" onClick={onDismiss} aria-label="Dismiss" title="Dismiss">
          &times;
        </button>
      </div>
    </div>
  )
}
