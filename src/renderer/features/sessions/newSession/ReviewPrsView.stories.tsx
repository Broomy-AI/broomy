import type { Meta, StoryObj } from '@storybook/react'
import { ReviewPrsView } from './ReviewPrsView'
import { useAgentStore } from '../../../store/agents'
import { useSessionStore } from '../../../store/sessions'
import type { Decorator } from '@storybook/react'
import { makeAgent, makeRepo } from '../../../../../.storybook/mockData'

const repo = makeRepo({ id: 'repo-1', name: 'my-app', rootDir: '/Users/test/repos/my-app', defaultBranch: 'main' })

const withStores: Decorator = (Story) => {
  useAgentStore.setState({
    agents: [
      makeAgent({ id: 'agent-1', name: 'Claude Code', command: 'claude' }),
    ],
  })
  useSessionStore.setState({
    sessions: [],
  })
  return <Story />
}

const meta: Meta<typeof ReviewPrsView> = {
  title: 'NewSession/ReviewPrsView',
  component: ReviewPrsView,
  decorators: [withStores],
}
export default meta
type Story = StoryObj<typeof ReviewPrsView>

const handlers = {
  onBack: () => console.log('Back'),
  onComplete: (dir: string, agentId: string | null, extra?: unknown) => console.log('Complete:', dir, agentId, extra),
}

export const Default: Story = {
  args: { repo, ...handlers },
}

/** Repo whose saved filter shows only PRs the user was asked to review directly. */
export const MineMode: Story = {
  args: { repo: { ...repo, prReviewFilter: 'mine' }, ...handlers },
}

/** Repo whose saved filter shows every open PR, not just review requests. */
export const AllMode: Story = {
  args: { repo: { ...repo, prReviewFilter: 'all' }, ...handlers },
}
