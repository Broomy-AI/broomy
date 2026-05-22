import type { Meta, StoryObj } from '@storybook/react'
import { CommandsSetupDialog } from './CommandsSetupDialog'

const meta: Meta<typeof CommandsSetupDialog> = {
  title: 'Explorer/CommandsSetupDialog',
  component: CommandsSetupDialog,
  args: {
    onClose: () => {},
    onInstalled: () => {},
  },
}
export default meta
type Story = StoryObj<typeof CommandsSetupDialog>

export const Default: Story = {
  args: {},
}
