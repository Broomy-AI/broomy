interface SetupCtaProps {
  onSetup: () => void
}

export function SetupCta({ onSetup }: SetupCtaProps) {
  return (
    <div className="px-3 py-4 border-b border-border flex flex-col items-stretch gap-2">
      <button
        onClick={onSetup}
        className="w-full px-3 py-2 text-sm rounded bg-accent text-on-accent hover:bg-accent/80 transition-colors"
      >
        Set up commands
      </button>
    </div>
  )
}
