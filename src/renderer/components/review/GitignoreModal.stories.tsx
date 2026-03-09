import type { Meta, StoryObj } from '@storybook/react'
import { GitignoreModal } from './GitignoreModal'
import { withDarkTheme } from '../../../../.storybook/decorators'

const meta: Meta<typeof GitignoreModal> = {
  title: 'Review/GitignoreModal',
  component: GitignoreModal,
  decorators: [withDarkTheme],
}
export default meta
type Story = StoryObj<typeof GitignoreModal>

const noop = () => {}

export const Default: Story = {
  args: {
    onAddToGitignore: noop,
    onContinueWithout: noop,
    onCancel: noop,
  },
}
