import type { Meta, StoryObj } from '@storybook/react'
import { CommitMessageDialog } from './CommitMessageDialog'

const meta: Meta<typeof CommitMessageDialog> = {
  title: 'Explorer/CommitMessageDialog',
  component: CommitMessageDialog,
  args: {
    onCommit: () => {},
    onClose: () => {},
    hasStagedFiles: true,
  },
}
export default meta
type Story = StoryObj<typeof CommitMessageDialog>

export const Open: Story = {
  args: {},
}

export const NoStagedFiles: Story = {
  args: {
    hasStagedFiles: false,
  },
}
