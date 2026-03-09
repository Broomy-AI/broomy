import type { Meta, StoryObj } from '@storybook/react'
import { AgentPickerView } from './AgentPickerView'
import { useAgentStore } from '../../store/agents'
import type { Decorator } from '@storybook/react'
import { makeAgent } from '../../../../.storybook/mockData'

const withAgents: Decorator = (Story) => {
  useAgentStore.setState({
    agents: [
      makeAgent({ id: 'agent-1', name: 'Claude Code', command: 'claude', color: '#4a9eff' }),
      makeAgent({ id: 'agent-2', name: 'Aider', command: 'aider', color: '#22c55e' }),
    ],
  })
  return <Story />
}

const withNoAgents: Decorator = (Story) => {
  useAgentStore.setState({ agents: [] })
  return <Story />
}

const meta: Meta<typeof AgentPickerView> = {
  title: 'NewSession/AgentPickerView',
  component: AgentPickerView,
}
export default meta
type Story = StoryObj<typeof AgentPickerView>

export const WithAgents: Story = {
  decorators: [withAgents],
  args: {
    directory: '/Users/test/repos/my-app/main',
    repoId: 'repo-1',
    repoName: 'my-app',
    onBack: () => console.log('Back'),
    onComplete: (dir, agentId, extra) => console.log('Complete:', dir, agentId, extra),
  },
}

export const NoAgents: Story = {
  decorators: [withNoAgents],
  args: {
    directory: '/Users/test/repos/my-app/main',
    onBack: () => console.log('Back'),
    onComplete: (dir, agentId, extra) => console.log('Complete:', dir, agentId, extra),
  },
}

export const FolderOnly: Story = {
  decorators: [withAgents],
  args: {
    directory: '/Users/test/some-folder',
    onBack: () => console.log('Back'),
    onComplete: (dir, agentId, extra) => console.log('Complete:', dir, agentId, extra),
  },
}
