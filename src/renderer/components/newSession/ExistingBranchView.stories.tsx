import type { Meta, StoryObj } from '@storybook/react'
import { ExistingBranchView } from './ExistingBranchView'
import { useAgentStore } from '../../store/agents'
import type { Decorator } from '@storybook/react'
import { makeAgent, makeRepo } from '../../../../.storybook/mockData'

const repo = makeRepo({ id: 'repo-1', name: 'my-app', rootDir: '/Users/test/repos/my-app', defaultBranch: 'main' })

const withAgents: Decorator = (Story) => {
  useAgentStore.setState({
    agents: [
      makeAgent({ id: 'agent-1', name: 'Claude Code', command: 'claude' }),
      makeAgent({ id: 'agent-2', name: 'Aider', command: 'aider' }),
    ],
  })
  return <Story />
}

const meta: Meta<typeof ExistingBranchView> = {
  title: 'NewSession/ExistingBranchView',
  component: ExistingBranchView,
  decorators: [withAgents],
}
export default meta
type Story = StoryObj<typeof ExistingBranchView>

export const Default: Story = {
  args: {
    repo,
    onBack: () => console.log('Back'),
    onComplete: (dir, agentId, extra) => console.log('Complete:', dir, agentId, extra),
  },
}
