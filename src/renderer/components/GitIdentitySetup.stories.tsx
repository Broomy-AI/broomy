import type { Meta, StoryObj } from '@storybook/react'
import { GitIdentitySetup } from './GitIdentitySetup'

const meta: Meta<typeof GitIdentitySetup> = {
  title: 'Settings/GitIdentitySetup',
  component: GitIdentitySetup,
}
export default meta
type Story = StoryObj<typeof GitIdentitySetup>

export const IdentityNotConfigured: Story = {
  args: {
    error: 'Please tell me who you are',
    onRetry: () => console.log('Retry'),
    retryLabel: 'Retry Create Branch',
  },
}

export const MergeModeNotConfigured: Story = {
  args: {
    error: 'Need to specify how to reconcile divergent branches',
    onRetry: () => console.log('Retry'),
    retryLabel: 'Retry',
  },
}

export const NoError: Story = {
  args: {
    error: null,
    onRetry: () => console.log('Retry'),
  },
}
