import type { Meta, StoryObj } from '@storybook/react'
import ProfileChip from './ProfileChip'
import { useProfileStore } from '../store/profiles'
import type { Decorator } from '@storybook/react'

const withProfileStore: Decorator = (Story) => {
  useProfileStore.setState({
    profiles: [
      { id: 'profile-1', name: 'Default', color: '#3b82f6' },
      { id: 'profile-2', name: 'Work', color: '#22c55e' },
    ],
    currentProfileId: 'profile-1',
  })
  return <Story />
}

const meta: Meta<typeof ProfileChip> = {
  title: 'UI/ProfileChip',
  component: ProfileChip,
  decorators: [withProfileStore],
}
export default meta
type Story = StoryObj<typeof ProfileChip>

export const Default: Story = {
  args: {
    onSwitchProfile: (profileId: string) => console.log('Switch to', profileId),
  },
}
