import type { Meta, StoryObj } from '@storybook/react'
import WelcomeScreen from './WelcomeScreen'

const meta: Meta<typeof WelcomeScreen> = {
  title: 'UI/WelcomeScreen',
  component: WelcomeScreen,
  decorators: [
    (Story) => (
      <div style={{ width: 800, height: 600 }}>
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof WelcomeScreen>

export const Default: Story = {
  args: {
    onNewSession: () => console.log('New session'),
  },
}
