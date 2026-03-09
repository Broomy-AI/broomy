import type { Meta, StoryObj } from '@storybook/react'
import { CommandsSetupBanner } from './CommandsSetupBanner'

const meta: Meta<typeof CommandsSetupBanner> = {
  title: 'Explorer/CommandsSetupBanner',
  component: CommandsSetupBanner,
  args: {
    onSetup: () => {},
  },
}
export default meta
type Story = StoryObj<typeof CommandsSetupBanner>

export const Default: Story = {
  args: {},
}
