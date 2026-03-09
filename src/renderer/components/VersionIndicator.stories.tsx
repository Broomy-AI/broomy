import type { Meta, StoryObj } from '@storybook/react'
import VersionIndicator from './VersionIndicator'
import { useUpdateStore } from '../hooks/useUpdateState'
import type { Decorator } from '@storybook/react'

const withUpdateAvailable: Decorator = (Story) => {
  useUpdateStore.setState({
    updateState: { status: 'available', version: '2.1.0' },
    currentVersion: '2.0.0',
    popoverOpen: false,
  })
  return <Story />
}

const withDownloading: Decorator = (Story) => {
  useUpdateStore.setState({
    updateState: { status: 'downloading', percent: 45 },
    currentVersion: '2.0.0',
    popoverOpen: true,
  })
  return <Story />
}

const withReady: Decorator = (Story) => {
  useUpdateStore.setState({
    updateState: { status: 'ready' },
    currentVersion: '2.0.0',
    popoverOpen: true,
  })
  return <Story />
}

const meta: Meta<typeof VersionIndicator> = {
  title: 'UI/VersionIndicator',
  component: VersionIndicator,
}
export default meta
type Story = StoryObj<typeof VersionIndicator>

export const UpdateAvailable: Story = {
  decorators: [withUpdateAvailable],
}

export const Downloading: Story = {
  decorators: [withDownloading],
}

export const Ready: Story = {
  decorators: [withReady],
}
