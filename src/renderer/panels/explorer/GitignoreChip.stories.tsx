import type { Meta, StoryObj } from '@storybook/react'
import { GitignoreChip } from './GitignoreChip'
import { withDarkTheme } from '../../../../.storybook/decorators'

const meta: Meta<typeof GitignoreChip> = {
  title: 'Explorer/GitignoreChip',
  component: GitignoreChip,
  decorators: [withDarkTheme],
  args: {
    directory: '/Users/test/projects/my-app',
    onDismiss: () => {},
  },
}
export default meta
type Story = StoryObj<typeof GitignoreChip>

export const Hidden: Story = {
  args: {
    showSuggestion: false,
  },
}

export const Visible: Story = {
  args: {
    showSuggestion: true,
  },
}
