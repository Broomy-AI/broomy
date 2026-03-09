import type { Meta, StoryObj } from '@storybook/react'
import AgentSettings from './AgentSettings'
import { useAgentStore } from '../store/agents'
import { useRepoStore } from '../store/repos'
import type { Decorator } from '@storybook/react'
import { makeAgent, makeRepo } from '../../../.storybook/mockData'

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
    defaultCloneDir: '/Users/test/repos',
    defaultShell: '/bin/zsh',
  })
  return <Story />
}

const meta: Meta<typeof AgentSettings> = {
  title: 'Settings/AgentSettings',
  component: AgentSettings,
  decorators: [withStores],
}
export default meta
type Story = StoryObj<typeof AgentSettings>

export const Default: Story = {
  args: {
    onClose: () => console.log('Close'),
  },
}
