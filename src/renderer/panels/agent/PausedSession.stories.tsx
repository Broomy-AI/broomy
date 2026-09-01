import type { Meta, StoryObj } from '@storybook/react'
import PausedSession from './PausedSession'

const meta: Meta<typeof PausedSession> = {
  title: 'Agent/PausedSession',
  component: PausedSession,
  decorators: [
    (Story) => (
      <div style={{ width: 800, height: 600 }}>
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof PausedSession>

export const Default: Story = {
  args: { onResume: () => console.log('Resume session') },
}
