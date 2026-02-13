const agents = [
  {
    name: 'Claude Code',
    color: '#D97757',
    icon: (
      <svg width="32" height="32" viewBox="0 0 16 16" fill="#D97757" aria-hidden="true">
        <path d="m3.127 10.604 3.135-1.76.053-.153-.053-.085H6.11l-.525-.032-1.791-.048-1.554-.065-1.505-.08-.38-.081L0 7.832l.036-.234.32-.214.455.04 1.009.069 1.513.105 1.097.064 1.626.17h.259l.036-.105-.089-.065-.068-.064-1.566-1.062-1.695-1.121-.887-.646-.48-.327-.243-.306-.104-.67.435-.48.585.04.15.04.593.456 1.267.981 1.654 1.218.242.202.097-.068.012-.049-.109-.181-.9-1.626-.96-1.655-.428-.686-.113-.411a2 2 0 0 1-.068-.484l.496-.674L4.446 0l.662.089.279.242.411.94.666 1.48 1.033 2.014.302.597.162.553.06.17h.105v-.097l.085-1.134.157-1.392.154-1.792.052-.504.25-.605.497-.327.387.186.319.456-.045.294-.19 1.23-.37 1.93-.243 1.29h.142l.161-.16.654-.868 1.097-1.372.484-.545.565-.601.363-.287h.686l.505.751-.226.775-.707.895-.585.759-.839 1.13-.524.904.048.072.125-.012 1.897-.403 1.024-.186 1.223-.21.553.258.06.263-.218.536-1.307.323-1.533.307-2.284.54-.028.02.032.04 1.029.098.44.024h1.077l2.005.15.525.346.315.424-.053.323-.807.411-3.631-.863-.872-.218h-.12v.073l.726.71 1.331 1.202 1.667 1.55.084.383-.214.302-.226-.032-1.464-1.101-.565-.497-1.28-1.077h-.084v.113l.295.432 1.557 2.34.08.718-.112.234-.404.141-.444-.08-.911-1.28-.94-1.44-.759-1.291-.093.053-.448 4.821-.21.246-.484.186-.403-.307-.214-.496.214-.98.258-1.28.21-1.016.19-1.263.112-.42-.008-.028-.092.012-.953 1.307-1.448 1.957-1.146 1.227-.274.109-.477-.247.045-.44.266-.39 1.586-2.018.956-1.25.617-.723-.004-.105h-.036l-4.212 2.736-.75.096-.324-.302.04-.496.154-.162 1.267-.871z"/>
      </svg>
    ),
  },
  {
    name: 'Codex',
    color: '#10A37F',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v3.005l-2.607 1.5-2.602-1.5z" fill="#10A37F" />
      </svg>
    ),
  },
  {
    name: 'Gemini CLI',
    color: '#4285F4',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 24C12 20.2 10.6 17.1 7.8 14.7C5.4 12.7 2.8 12.1 0 12C2.8 11.9 5.4 11.3 7.8 9.3C10.6 6.9 12 3.8 12 0C12 3.8 13.4 6.9 16.2 9.3C18.6 11.3 21.2 11.9 24 12C21.2 12.1 18.6 12.7 16.2 14.7C13.4 17.1 12 20.2 12 24Z" fill="url(#gemini-gradient)" />
        <defs>
          <linearGradient id="gemini-gradient" x1="0" y1="0" x2="24" y2="24">
            <stop stopColor="#4285F4" />
            <stop offset="1" stopColor="#A855F7" />
          </linearGradient>
        </defs>
      </svg>
    ),
  },
]

export default function AgentLogos() {
  return (
    <section className="px-6 py-16 md:px-12 lg:py-20">
      <div className="mx-auto max-w-[900px] text-center">
        <span className="font-mono text-sm font-medium uppercase tracking-wider text-accent">
          AGENTS
        </span>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-text-primary md:text-3xl">
          Works with every agent
        </h2>
        <p className="mx-auto mt-4 max-w-lg leading-relaxed text-text-body">
          Broomy doesn&apos;t lock you into one AI provider. It works with any
          terminal-based coding agent, and adding support for new ones is
          trivial.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-8">
          {agents.map((agent) => (
            <div
              key={agent.name}
              className="flex flex-col items-center gap-3"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border-subtle bg-bg-raised">
                {agent.icon}
              </div>
              <span className="text-sm font-medium text-text-body">
                {agent.name}
              </span>
            </div>
          ))}
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border-subtle bg-bg-raised">
              <span className="text-2xl text-text-muted">+</span>
            </div>
            <span className="text-sm font-medium text-text-muted">
              Any agent
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
