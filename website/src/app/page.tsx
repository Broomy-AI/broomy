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
    alt: 'Session card showing idle status with PR OPEN badge and last message',
    direction: 'right' as const,
  },
  {
    eyebrow: 'REVIEW',
    title: 'Stay on top of what actually changed',
    description:
      'AI agents can generate code fast — but speed is worthless if the codebase turns into a mess. Broomy gives you an AI-assisted review that explains what changed and why, highlights potential issues, and lets you click through to diffs. Works just as well for reviewing PRs from teammates. The point is keeping humans in the loop, not rubber-stamping AI output.',
    screenshot: '/screenshots/review.png',
    alt: 'Review panel showing AI-assisted code review with change explanations and potential issues',
    direction: 'left' as const,
  },
  {
    eyebrow: 'FILES',
    title: 'Built-in source control',
    description:
      'Browse your repo, check git status, stage changes, and commit — without switching windows. See exactly what your agents changed, with file status badges showing modifications, additions, and deletions.',
    screenshot: '/screenshots/explorer.png',
    alt: 'Explorer panel with source control view showing changed files',
    direction: 'right' as const,
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
