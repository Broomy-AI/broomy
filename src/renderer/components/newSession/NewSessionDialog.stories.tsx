import type { Meta, StoryObj } from '@storybook/react'
import { NewSessionDialog } from './index'
import { useRepoStore } from '../../store/repos'
import { useAgentStore } from '../../store/agents'
import type { Decorator } from '@storybook/react'
import { makeRepo, makeAgent } from '../../../../.storybook/mockData'

const withStores: Decorator = (Story) => {
  useAgentStore.setState({
    agents: [
      makeAgent({ id: 'agent-1', name: 'Claude Code', command: 'claude', color: '#4a9eff' }),
      makeAgent({ id: 'agent-2', name: 'Aider', command: 'aider', color: '#22c55e' }),
    ],
  })
  useRepoStore.setState({
    repos: [
      makeRepo({ id: 'repo-1', name: 'my-app', rootDir: '/Users/test/repos/my-app', defaultBranch: 'main' }),
      makeRepo({ id: 'repo-2', name: 'backend', rootDir: '/Users/test/repos/backend', defaultBranch: 'main' }),
    ],
    ghAvailable: true,
  })
  return <Story />
}

const meta: Meta<typeof NewSessionDialog> = {
  title: 'NewSession/NewSessionDialog',
  component: NewSessionDialog,
  decorators: [withStores],
}
export default meta
type Story = StoryObj<typeof NewSessionDialog>

export const Default: Story = {
  args: {
    onComplete: (dir, agentId, extra) => console.log('Complete:', dir, agentId, extra),
    onCancel: () => console.log('Cancel'),
  },
}
