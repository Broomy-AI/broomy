import type { Meta, StoryObj } from '@storybook/react'
import { ReviewPrsView } from './ReviewPrsView'
import { useAgentStore } from '../../store/agents'
import { useSessionStore } from '../../store/sessions'
import type { Decorator } from '@storybook/react'
import { makeAgent, makeRepo } from '../../../../.storybook/mockData'

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

export const Default: Story = {
  args: {
    repo,
    onBack: () => console.log('Back'),
    onComplete: (dir, agentId, extra) => console.log('Complete:', dir, agentId, extra),
  },
}
