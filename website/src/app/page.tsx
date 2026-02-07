import NavBar from '@/components/NavBar'
import Hero from '@/components/Hero'
import Problem from '@/components/Problem'
import FeatureSection from '@/components/FeatureSection'
import Architecture from '@/components/Architecture'
import OpenSource from '@/components/OpenSource'
import GetStarted from '@/components/GetStarted'
import Footer from '@/components/Footer'

const features = [
  {
    eyebrow: 'SESSIONS',
    title: 'Every agent, one sidebar',
    description:
      'Run Claude Code on your backend, Aider on your frontend, and keep a terminal open for your docs — all in one window. Status indicators show which agents are working, which are idle, and which just finished and need your attention.',
    screenshot: '/screenshots/sidebar.png',
    alt: 'Broomy sidebar showing multiple AI agent sessions with status indicators',
    direction: 'left' as const,
  },
  {
    eyebrow: 'STATUS',
    title: 'Know what your agents are doing',
    description:
      'Broomy watches terminal output and understands agent state. Working, idle, waiting for input — you see it at a glance. When an agent finishes a task, you get a notification so nothing slips through.',
    screenshot: '/screenshots/status.png',
    alt: 'Session showing Working status with spinner and tool output in the terminal',
    direction: 'right' as const,
  },
  {
    eyebrow: 'FILES',
    title: 'Built-in source control',
    description:
      'Browse your repo, check git status, stage changes, and commit — without switching windows. See exactly what your agents changed, with file status badges showing modifications, additions, and deletions.',
    screenshot: '/screenshots/explorer.png',
    alt: 'Explorer panel with file tree and source control view',
    direction: 'left' as const,
  },
  {
    eyebrow: 'REVIEW',
    title: 'Review before you commit',
    description:
      'See side-by-side diffs of every change your agents made. Full syntax highlighting powered by Monaco Editor — the same engine behind VS Code. Catch issues before they hit your branch.',
    screenshot: '/screenshots/diff.png',
    alt: 'Diff view showing side-by-side code changes',
    direction: 'right' as const,
  },
  {
    eyebrow: 'AGENTS',
    title: 'Your agents, your way',
    description:
      'Configure Claude Code, Aider, or any CLI-based agent. Each session gets its own terminal, working directory, and branch. Set up different agents for different repos with custom environment variables.',
    screenshot: '/screenshots/settings.png',
    alt: 'Settings panel with agent configurations',
    direction: 'left' as const,
  },
]

export default function Home() {
  return (
    <>
      <NavBar />
      <main id="main-content">
        <Hero />
        <Problem />
        {features.map((feature) => (
          <FeatureSection key={feature.eyebrow} {...feature} />
        ))}
        <Architecture />
        <OpenSource />
        <GetStarted />
      </main>
      <Footer />
    </>
  )
}
