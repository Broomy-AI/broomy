import type { Meta, StoryObj } from '@storybook/react'
import ProfileDropdown from './ProfileDropdown'
import { useRef } from 'react'
import type { ProfileData } from '../../preload/index'

const profiles: ProfileData[] = [
  { id: 'profile-1', name: 'Default', color: '#3b82f6' },
  { id: 'profile-2', name: 'Work', color: '#22c55e' },
  { id: 'profile-3', name: 'Personal', color: '#f59e0b' },
]

function ProfileDropdownWrapper(props: Partial<React.ComponentProps<typeof ProfileDropdown>>) {
  const dropdownRef = useRef<HTMLDivElement>(null)
  return (
    <div className="relative" style={{ width: 300 }}>
      <ProfileDropdown
        profiles={profiles}
        currentProfileId="profile-1"
        currentProfile={profiles[0]}
        showNewForm={false}
        showEditForm={false}
        setShowNewForm={() => {}}
        setShowEditForm={() => {}}
        newName=""
        setNewName={() => {}}
        newColor="#3b82f6"
        setNewColor={() => {}}
        editName=""
        setEditName={() => {}}
        editColor=""
        setEditColor={() => {}}
        onSwitchProfile={() => {}}
        onCreateProfile={() => {}}
        onStartEdit={() => {}}
        onSaveEdit={() => {}}
        onDelete={() => {}}
        dropdownRef={dropdownRef}
        {...props}
      />
    </div>
  )
}

const meta: Meta<typeof ProfileDropdown> = {
  title: 'UI/ProfileDropdown',
  component: ProfileDropdown,
}
export default meta
type Story = StoryObj<typeof ProfileDropdown>

export const Default: Story = {
  render: () => <ProfileDropdownWrapper />,
}

export const WithNewForm: Story = {
  render: () => <ProfileDropdownWrapper showNewForm={true} newName="New Profile" />,
}

export const WithEditForm: Story = {
  render: () => (
    <ProfileDropdownWrapper
      showEditForm={true}
      editName="Default"
      editColor="#3b82f6"
    />
  ),
}
