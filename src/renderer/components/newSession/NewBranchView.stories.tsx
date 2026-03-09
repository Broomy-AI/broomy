import type { Meta, StoryObj } from '@storybook/react'
import { NewBranchView } from './NewBranchView'
import { useAgentStore } from '../../store/agents'
import { useRepoStore } from '../../store/repos'
import type { Decorator } from '@storybook/react'
import { makeAgent, makeRepo } from '../../../../.storybook/mockData'

const repo = makeRepo({ id: 'repo-1', name: 'my-app', rootDir: '/Users/test/repos/my-app', defaultBranch: 'main' })

const withStores: Decorator = (Story) => {
  useAgentStore.setState({
    agents: [
      makeAgent({ id: 'agent-1', name: 'Claude Code', command: 'claude' }),
      makeAgent({ id: 'agent-2', name: 'Aider', command: 'aider' }),
    ],
  })
  useRepoStore.setState({ ghAvailable: true })
  return <Story />
}

const meta: Meta<typeof NewBranchView> = {
  title: 'NewSession/NewBranchView',
  component: NewBranchView,
  decorators: [withStores],
}
export default meta
type Story = StoryObj<typeof NewBranchView>

export const Default: Story = {
  args: {
    repo,
    onBack: () => console.log('Back'),
    onComplete: (dir, agentId, extra) => console.log('Complete:', dir, agentId, extra),
    onUseExisting: (branch) => console.log('Use existing:', branch),
  },
}

export const WithIssue: Story = {
  args: {
    repo,
    issue: { number: 42, title: 'Fix login bug', labels: ['bug', 'high-priority'], url: 'https://github.com/test/my-app/issues/42' },
    onBack: () => console.log('Back'),
    onComplete: (dir, agentId, extra) => console.log('Complete:', dir, agentId, extra),
    onUseExisting: (branch) => console.log('Use existing:', branch),
  },
}
