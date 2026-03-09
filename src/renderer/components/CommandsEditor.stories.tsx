import type { Meta, StoryObj } from '@storybook/react'
import { CommandsEditor } from './CommandsEditor'
import { useAgentStore } from '../store/agents'
import type { Decorator } from '@storybook/react'
import { makeAgent } from '../../../.storybook/mockData'

const withAgents: Decorator = (Story) => {
  useAgentStore.setState({
    agents: [
      makeAgent({ id: 'agent-1', name: 'Claude Code', command: 'claude' }),
      makeAgent({ id: 'agent-2', name: 'Aider', command: 'aider' }),
    ],
  })
  return <Story />
}

const meta: Meta<typeof CommandsEditor> = {
  title: 'Settings/CommandsEditor',
  component: CommandsEditor,
  decorators: [withAgents],
}
export default meta
type Story = StoryObj<typeof CommandsEditor>

export const Default: Story = {
  args: {
    directory: '/Users/test/repos/my-app/main',
    onClose: () => console.log('Close'),
  },
}
