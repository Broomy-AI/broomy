import type { Meta, StoryObj } from '@storybook/react'
import { IssuePlanChip } from './IssuePlanChip'

const meta: Meta<typeof IssuePlanChip> = {
  title: 'Explorer/IssuePlanChip',
  component: IssuePlanChip,
  args: {
    directory: '/Users/test/projects/my-app',
    onFileSelect: () => {},
  },
}
export default meta
type Story = StoryObj<typeof IssuePlanChip>

export const Hidden: Story = {
  args: {
    issuePlanExists: false,
  },
}

export const Visible: Story = {
  args: {
    issuePlanExists: true,
  },
}
