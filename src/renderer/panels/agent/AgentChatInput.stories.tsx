import type { Meta, StoryObj } from '@storybook/react'
import { AgentChatInput } from './AgentChatInput'

const meta: Meta<typeof AgentChatInput> = {
  title: 'Agent/AgentChatInput',
  component: AgentChatInput,
  decorators: [(Story) => <div className="bg-[#1a1a1a] max-w-2xl"><Story /></div>],
}
export default meta
type Story = StoryObj<typeof AgentChatInput>

const noop = () => {}

export const Idle: Story = {
  args: {
    onSubmit: noop,
    onStop: noop,
    isRunning: false,
    sessionId: 'session-1',
  },
}

export const Running: Story = {
  args: {
    onSubmit: noop,
    onStop: noop,
    isRunning: true,
    sessionId: 'session-1',
  },
}
