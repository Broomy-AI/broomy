import type { Meta, StoryObj } from '@storybook/react'
import { AuthSetupSection } from './AuthSetupSection'

const meta: Meta<typeof AuthSetupSection> = {
  title: 'Settings/AuthSetupSection',
  component: AuthSetupSection,
}
export default meta
type Story = StoryObj<typeof AuthSetupSection>

export const NoError: Story = {
  args: {
    error: null,
    ghAvailable: true,
    onRetry: () => console.log('Retry'),
    retryLabel: 'Retry',
  },
}

export const AuthError: Story = {
  args: {
    error: 'fatal: could not authenticate to GitHub',
    ghAvailable: true,
    onRetry: () => console.log('Retry'),
    retryLabel: 'Retry Clone',
  },
}

export const AuthErrorGhUnavailable: Story = {
  args: {
    error: 'fatal: could not authenticate to GitHub',
    ghAvailable: false,
    onRetry: () => console.log('Retry'),
    retryLabel: 'Retry',
  },
}

export const IdentityError: Story = {
  args: {
    error: 'Please tell me who you are',
    ghAvailable: true,
    onRetry: () => console.log('Retry'),
    retryLabel: 'Retry Create Branch',
  },
}

export const MergeModeError: Story = {
  args: {
    error: 'Need to specify how to reconcile divergent branches',
    ghAvailable: true,
    onRetry: () => console.log('Retry'),
    retryLabel: 'Retry',
  },
}

export const NonAuthError: Story = {
  args: {
    error: 'Some other error that is not auth related',
    ghAvailable: true,
    onRetry: () => console.log('Retry'),
  },
}
