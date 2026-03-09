import type { Meta, StoryObj } from '@storybook/react'
import { DialogErrorBanner } from './ErrorBanner'

const meta: Meta<typeof DialogErrorBanner> = {
  title: 'UI/DialogErrorBanner',
  component: DialogErrorBanner,
}
export default meta
type Story = StoryObj<typeof DialogErrorBanner>

export const Default: Story = {
  args: {
    error: 'Failed to create worktree: permission denied',
    onDismiss: () => console.log('Dismissed'),
  },
}

export const WithLongError: Story = {
  args: {
    error: 'Error: Command failed with exit code 128: git worktree add /Users/test/projects/my-app/.worktrees/feature-branch feature-branch\nfatal: a]ready checked out in /Users/test/projects/my-app',
    onDismiss: () => console.log('Dismissed'),
  },
}
