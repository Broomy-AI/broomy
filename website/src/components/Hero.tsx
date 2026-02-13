import DownloadButton from './DownloadButton'

export default function Hero() {
  return (
    <section className="px-6 pt-12 pb-16 md:px-12 lg:pt-16 lg:pb-24">
      <div className="mx-auto max-w-[1200px] text-center">
        {/* Logo + name */}
        <div className="flex items-center justify-center gap-4 mb-8">
          <img
            src="/icon.png"
            alt="Broomy icon"
            className="h-14 w-14 rounded-xl"
            width={56}
            height={56}
          />
          <span className="text-3xl font-bold tracking-tight text-text-primary">
            Broomy
          </span>
        </div>

        <h1 className="text-4xl font-bold tracking-tight text-text-primary md:text-5xl lg:text-6xl">
          Your command center for
          <br />
          AI coding agents
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-text-body leading-relaxed">
          Lead a team of agents and see when each needs help. Let an AI help you
          review code. Fully open source and extensible.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <a
            href="https://github.com/broomy-ai/broomy"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-text-primary px-8 py-4 text-lg font-semibold text-bg-page transition-transform hover:scale-[1.02]"
          >
            <GitHubIcon />
            View on GitHub
          </a>
          <DownloadButton />
        </div>

        {/* Badges row */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <a
            href="https://github.com/broomy-ai/broomy/blob/main/LICENSE"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle px-3 py-1 text-xs font-mono text-text-muted hover:text-text-body hover:border-border-hover transition-colors"
          >
            <LicenseIcon />
            MIT License
          </a>
          <a
            href="https://github.com/broomy-ai/broomy"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle px-3 py-1 text-xs font-mono text-text-muted hover:text-text-body hover:border-border-hover transition-colors"
          >
            <StarIcon />
            Star on GitHub
          </a>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle px-3 py-1 text-xs font-mono text-text-muted">
            <CodeIcon />
            TypeScript + React + Electron
          </span>
        </div>

        {/* Hero screenshot */}
        <div className="mt-16">
          <div className="mx-auto max-w-[1100px] overflow-hidden rounded-xl border border-border-subtle shadow-[0_25px_50px_rgba(0,0,0,0.5)]">
            <img
              src="/screenshots/hero.png"
              alt="Broomy desktop app showing multiple AI agent sessions with file explorer and terminal"
              className="w-full"
              width={1400}
              height={900}
            />
          </div>
        </div>
      </div>
    </section>
  )
}

function GitHubIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  )
}

function LicenseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  )
}

function StarIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

function CodeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  )
}
