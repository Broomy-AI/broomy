interface WelcomeScreenProps {
  onNewSession: () => void
}

export default function WelcomeScreen({ onNewSession }: WelcomeScreenProps) {
  return (
    <div className="h-full w-full flex items-center justify-center bg-bg-primary">
      <div className="max-w-md text-center px-8">
        <h1 className="text-2xl font-semibold text-text-primary mb-3">
          Welcome to Broomy
        </h1>
        <p className="text-sm text-text-secondary mb-8">
          Manage multiple AI sessions across branches and repositories.
          See what every agent is doing. Fully open source, extensible, and MIT licensed.
        </p>

        <button
          onClick={onNewSession}
          className="px-6 py-2.5 rounded-lg bg-accent text-white font-medium hover:bg-accent/90 transition-colors mb-8"
        >
          + New Session
        </button>

        <div className="space-y-3 text-xs text-text-secondary">
          <p>
            Click the{' '}
            <span className="inline-flex align-middle mx-0.5 p-0.5 rounded bg-bg-tertiary text-text-primary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </span>
            {' '}button in the toolbar to open the step-by-step tutorial.
          </p>
          <p>
            Check the <span className="text-text-primary font-medium">Help</span> menu for keyboard shortcuts and more.
          </p>
        </div>
      </div>
    </div>
  )
}
