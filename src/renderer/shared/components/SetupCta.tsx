interface SetupCtaProps {
  onSetup: () => void
  onStartBlank: () => void
}

export function SetupCta({ onSetup, onStartBlank }: SetupCtaProps) {
  return (
    <div className="px-3 py-4 border-b border-border flex flex-col items-stretch gap-2">
      <button
        onClick={onSetup}
        className="w-full px-3 py-2 text-sm rounded bg-accent text-white hover:bg-accent/80 transition-colors"
      >
        Set up commands
      </button>
      <button
        onClick={onStartBlank}
        className="text-xs text-text-tertiary hover:text-text-primary transition-colors"
      >
        Or start with an empty config →
      </button>
    </div>
  )
}
