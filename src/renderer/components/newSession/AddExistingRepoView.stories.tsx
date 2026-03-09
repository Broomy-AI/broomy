import type { Meta, StoryObj } from '@storybook/react'
import { AddExistingRepoView } from './AddExistingRepoView'
import { useAgentStore } from '../../store/agents'
import { useRepoStore } from '../../store/repos'
import type { Decorator } from '@storybook/react'
import { makeAgent } from '../../../../.storybook/mockData'

const withStores: Decorator = (Story) => {
  useAgentStore.setState({
    agents: [
      makeAgent({ id: 'agent-1', name: 'Claude Code', command: 'claude' }),
      makeAgent({ id: 'agent-2', name: 'Aider', command: 'aider' }),
    ],
  })
  useRepoStore.setState({
    repos: [],
  })
  return <Story />
}

const meta: Meta<typeof AddExistingRepoView> = {
  title: 'NewSession/AddExistingRepoView',
  component: AddExistingRepoView,
  decorators: [withStores],
}
export default meta
type Story = StoryObj<typeof AddExistingRepoView>

export const Default: Story = {
  args: {
    onBack: () => console.log('Back'),
    onComplete: (dir, agentId, extra) => console.log('Complete:', dir, agentId, extra),
  },
}
