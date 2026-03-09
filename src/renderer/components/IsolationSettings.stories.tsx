import type { Meta, StoryObj } from '@storybook/react'
import { IsolationSettings } from './IsolationSettings'

const noop = () => {}

const meta: Meta<typeof IsolationSettings> = {
  title: 'Settings/IsolationSettings',
  component: IsolationSettings,
}
export default meta
type Story = StoryObj<typeof IsolationSettings>

export const Default: Story = {
  args: {
    isolated: false,
    skipApproval: false,
    dockerStatus: null,
    devcontainerStatus: null,
    hasDevcontainerConfig: null,
    onIsolatedChange: noop,
    onSkipApprovalChange: noop,
  },
}

export const IsolatedWithDevcontainer: Story = {
  args: {
    isolated: true,
    skipApproval: false,
    dockerStatus: { available: true },
    devcontainerStatus: { available: true, version: '0.62.0' },
    hasDevcontainerConfig: true,
    onIsolatedChange: noop,
    onSkipApprovalChange: noop,
  },
}

export const IsolatedMissingTools: Story = {
  args: {
    isolated: true,
    skipApproval: false,
    dockerStatus: { available: false, error: 'Docker Desktop not running', installUrl: 'https://www.docker.com/products/docker-desktop/' },
    devcontainerStatus: { available: false, error: 'devcontainer CLI not installed' },
    hasDevcontainerConfig: false,
    onIsolatedChange: noop,
    onSkipApprovalChange: noop,
    onGenerateDevcontainerConfig: () => console.log('Generate devcontainer config'),
  },
}

export const SkipApprovalNoIsolation: Story = {
  args: {
    isolated: false,
    skipApproval: true,
    dockerStatus: null,
    devcontainerStatus: null,
    hasDevcontainerConfig: null,
    onIsolatedChange: noop,
    onSkipApprovalChange: noop,
  },
}

export const FullyConfigured: Story = {
  args: {
    isolated: true,
    skipApproval: true,
    dockerStatus: { available: true },
    devcontainerStatus: { available: true, version: '0.62.0' },
    hasDevcontainerConfig: true,
    onIsolatedChange: noop,
    onSkipApprovalChange: noop,
  },
}
