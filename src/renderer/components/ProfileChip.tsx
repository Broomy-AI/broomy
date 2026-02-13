/**
 * Profile indicator chip displayed in the title bar with a dropdown for profile management.
 *
 * Shows the current profile name as a colored chip. Clicking opens a dropdown listing
 * other profiles (click to switch, which opens a new window), an edit form for the
 * current profile's name and color, and a create-new-profile form. Each profile gets
 * a color from a fixed palette, displayed as a tinted background on the chip.
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { useProfileStore } from '../store/profiles'
import ProfileDropdown, { PROFILE_COLORS } from './ProfileDropdown'

interface ProfileChipProps {
  onSwitchProfile: (profileId: string) => void
}

export default function ProfileChip({ onSwitchProfile }: ProfileChipProps) {
  const { profiles, currentProfileId, addProfile, deleteProfile, updateProfile } = useProfileStore()
  const [showDropdown, setShowDropdown] = useState(false)
  const [showNewForm, setShowNewForm] = useState(false)
  const [showEditForm, setShowEditForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(PROFILE_COLORS[0])
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const chipRef = useRef<HTMLButtonElement>(null)

  const currentProfile = profiles.find((p) => p.id === currentProfileId)

  // Close dropdown on outside click
  useEffect(() => {
    if (!showDropdown) return
    const handleClick = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        chipRef.current &&
        !chipRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false)
        setShowNewForm(false)
        setShowEditForm(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showDropdown])

  const handleChipClick = useCallback(() => {
    setShowDropdown((v) => !v)
    setShowNewForm(false)
    setShowEditForm(false)
  }, [])

  const handleSwitchProfile = useCallback((profileId: string) => {
    setShowDropdown(false)
    onSwitchProfile(profileId)
  }, [onSwitchProfile])

  const handleCreateProfile = useCallback(async () => {
    if (!newName.trim()) return
    const profile = await addProfile(newName.trim(), newColor)
    setNewName('')
    setNewColor(PROFILE_COLORS[0])
    setShowNewForm(false)
    setShowDropdown(false)
    // Open the new profile in a new window
    await useProfileStore.getState().openProfileInNewWindow(profile.id)
  }, [newName, newColor, addProfile])

  const handleStartEdit = useCallback(() => {
    if (!currentProfile) return
    setEditName(currentProfile.name)
    setEditColor(currentProfile.color)
    setShowEditForm(true)
    setShowNewForm(false)
  }, [currentProfile])

  const handleSaveEdit = useCallback(async () => {
    if (!editName.trim() || !currentProfile) return
    await updateProfile(currentProfile.id, { name: editName.trim(), color: editColor })
    setShowEditForm(false)
  }, [editName, editColor, currentProfile, updateProfile])

  const handleDelete = useCallback(async (profileId: string) => {
    await deleteProfile(profileId)
  }, [deleteProfile])

  if (!currentProfile) return null

  return (
    <div className="relative">
      <button
        ref={chipRef}
        onClick={handleChipClick}
        className="px-2 py-0.5 text-[11px] font-semibold rounded border cursor-pointer transition-opacity hover:opacity-80"
        style={{
          backgroundColor: `${currentProfile.color  }20`,
          color: currentProfile.color,
          borderColor: `${currentProfile.color  }30`,
        }}
      >
        {currentProfile.name}
      </button>

      {showDropdown && (
        <ProfileDropdown
          profiles={profiles}
          currentProfileId={currentProfileId}
          currentProfile={currentProfile}
          showNewForm={showNewForm}
          showEditForm={showEditForm}
          setShowNewForm={setShowNewForm}
          setShowEditForm={setShowEditForm}
          newName={newName}
          setNewName={setNewName}
          newColor={newColor}
          setNewColor={setNewColor}
          editName={editName}
          setEditName={setEditName}
          editColor={editColor}
          setEditColor={setEditColor}
          onSwitchProfile={handleSwitchProfile}
          onCreateProfile={handleCreateProfile}
          onStartEdit={handleStartEdit}
          onSaveEdit={handleSaveEdit}
          onDelete={handleDelete}
          dropdownRef={dropdownRef}
        />
      )}
    </div>
  )
}
