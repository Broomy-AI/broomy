/**
 * Shown in place of the agent panel when a session is paused.
 *
 * A paused session runs no agent, no terminals, and nothing they started.
 * Because this replaces the whole agent panel, one message covers the agent
 * and every terminal tab.
 */
export default function PausedSession({ onResume }: { onResume: () => void }) {
  return (
    <div className="h-full w-full flex items-center justify-center bg-bg-primary">
      <div className="text-center max-w-md px-8">
        <div className="text-base font-medium text-text-primary mb-2">Session paused</div>
        <div className="text-sm text-text-secondary mb-8">
          No agent or terminal is running for this session. Resuming starts a fresh agent.
        </div>
        <button
          onClick={onResume}
          className="px-6 py-2.5 rounded-lg bg-accent text-on-accent font-medium hover:bg-accent/90 transition-colors"
        >
          Resume Session
        </button>
      </div>
    </div>
  )
}
