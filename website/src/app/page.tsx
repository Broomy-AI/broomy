import NavBar from '@/components/NavBar'
import Hero from '@/components/Hero'
import Problem from '@/components/Problem'
import FeatureSection from '@/components/FeatureSection'
import AgentLogos from '@/components/AgentLogos'
import Architecture from '@/components/Architecture'
import OpenSource from '@/components/OpenSource'
import GetStarted from '@/components/GetStarted'
import Footer from '@/components/Footer'

const features = [
  {
    eyebrow: 'SESSIONS',
    title: 'Run many agents at once',
    description:
      'Run Claude Code on your backend, Aider on your frontend, and keep a terminal open for your docs — all in one window. Broomy watches each agent and shows you who\'s working, who\'s idle, and who just finished and needs your attention. When an agent completes a task, you get a notification so nothing slips through.',
    screenshot: '/screenshots/sidebar.png',
    alt: 'Broomy sidebar showing multiple AI agent sessions with status indicators',
    direction: 'left' as const,
  },
  {
    eyebrow: 'REVIEW',
    title: 'AI-guided code review',
    description:
      'AI agents write code fast — but someone still needs to review it. Broomy uses AI to help you understand what changed and why, highlights potential issues, and lets you click through to diffs. It\'s not about rubber-stamping AI output — it\'s about keeping you in the loop so the codebase stays healthy even as agents move fast.',
    screenshot: '/screenshots/review.png',
    alt: 'Review panel showing AI-guided code review with change explanations and potential issues',
    direction: 'right' as const,
  },
  {
    eyebrow: 'IDE',
    title: 'A real IDE, not just a chat window',
    description:
      'Edit files, browse your repo, check git status, stage changes, and commit — without switching windows. You\'re not forced to hand everything to the AI. When you need to step in and fix something yourself, the tools are right there.',
    screenshot: '/screenshots/explorer.png',
    alt: 'Explorer panel with file editor and source control view',
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
        <AgentLogos />
        <Architecture />
        <OpenSource />
        <GetStarted />
      </main>
      <Footer />
    </>
  )
}
