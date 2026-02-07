import TechBadge from './TechBadge'

const techStack = [
  'Electron',
  'React',
  'TypeScript',
  'Zustand',
  'xterm.js',
  'Monaco Editor',
  'node-pty',
  'simple-git',
]

const highlights = [
  'Type-safe IPC between all processes',
  'Intelligent agent status detection via terminal output parsing',
  'Modular panel system — show what you need, hide what you don\'t',
  'Full E2E test suite with Playwright',
  'Zero external services — everything runs locally',
]

export default function Architecture() {
  return (
    <section className="px-6 py-20 md:px-12 lg:py-28">
      <div className="mx-auto max-w-[1200px]">
        <div className="text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-text-primary md:text-4xl">
            Built for developers, by developers
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-text-body leading-relaxed">
            Broomy is a native desktop app built on proven technology. No web
            wrappers. No Electron bloat. Just fast, reliable tooling.
          </p>
        </div>

        {/* Tech stack badges */}
        <div className="mt-12 flex flex-wrap justify-center gap-3">
          {techStack.map((tech) => (
            <TechBadge key={tech} name={tech} />
          ))}
        </div>

        {/* Architecture highlights */}
        <ul className="mx-auto mt-12 max-w-xl space-y-4">
          {highlights.map((point) => (
            <li
              key={point}
              className="flex items-start gap-3 text-text-body"
            >
              <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent" />
              {point}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
