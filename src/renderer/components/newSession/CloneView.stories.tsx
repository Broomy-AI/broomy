import type { Meta, StoryObj } from '@storybook/react'
import { CloneView } from './CloneView'
import { useAgentStore } from '../../store/agents'
import { useRepoStore } from '../../store/repos'
import type { Decorator } from '@storybook/react'
import { makeAgent } from '../../../../.storybook/mockData'

const withStores: Decorator = (Story) => {
  useAgentStore.setState({
    agents: [
      makeAgent({ id: 'agent-1', name: 'Claude Code', command: 'claude' }),
    ],
  })
  useRepoStore.setState({
    defaultCloneDir: '/Users/test/repos',
    ghAvailable: true,
  })
  return <Story />
}

const meta: Meta<typeof CloneView> = {
  title: 'NewSession/CloneView',
  component: CloneView,
  decorators: [withStores],
}
export default meta
type Story = StoryObj<typeof CloneView>

export const Default: Story = {
  args: {
    onBack: () => console.log('Back'),
    onComplete: (dir, agentId, extra) => console.log('Complete:', dir, agentId, extra),
  },
}
