/**
 * Banner shown when no .broomy/commands.json exists, prompting the user to set up modular actions.
 */

interface CommandsSetupBannerProps {
  onSetup: () => void
}

export function CommandsSetupBanner({ onSetup }: CommandsSetupBannerProps) {
  return (
    <div className="px-3 py-2 border-b border-border bg-blue-500/10 flex items-center gap-2 text-xs">
      <span className="text-blue-400 flex-1">
        No <code className="font-mono">commands.json</code> &mdash; actions use built-in defaults
      </span>
      <button
        onClick={onSetup}
        className="px-2 py-1 text-xs rounded bg-accent text-white hover:bg-accent/80 shrink-0"
      >
        Set up
      </button>
    </div>
  )
}
