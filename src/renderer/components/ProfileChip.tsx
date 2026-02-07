import { useState, useRef, useEffect, useCallback } from 'react'
import { useProfileStore } from '../store/profiles'

const PROFILE_COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#22c55e', // green
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
]

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

  const handleSwitchProfile = useCallback(async (profileId: string) => {
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
          backgroundColor: currentProfile.color + '20',
          color: currentProfile.color,
          borderColor: currentProfile.color + '30',
        }}
      >
        {currentProfile.name}
      </button>

      {showDropdown && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 mt-1 w-56 bg-bg-secondary border border-border rounded-lg shadow-lg overflow-hidden z-50"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {/* Other profiles */}
          {profiles.filter((p) => p.id !== currentProfileId).map((profile) => (
            <div
              key={profile.id}
              className="flex items-center justify-between px-3 py-2 hover:bg-bg-tertiary cursor-pointer group"
            >
              <button
                className="flex items-center gap-2 flex-1 text-left"
                onClick={() => handleSwitchProfile(profile.id)}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: profile.color }}
                />
                <span className="text-sm text-text-primary truncate">{profile.name}</span>
              </button>
              {profiles.length > 1 && (
                <button
                  className="text-text-tertiary hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDelete(profile.id)
                  }}
                  title="Delete profile"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
          ))}

          {/* Current profile section */}
          {profiles.filter((p) => p.id !== currentProfileId).length > 0 && (
            <div className="border-t border-border" />
          )}

          {/* Edit current profile */}
          {!showEditForm && !showNewForm && (
            <button
              className="w-full px-3 py-2 text-sm text-text-secondary hover:bg-bg-tertiary text-left"
              onClick={handleStartEdit}
            >
              Edit "{currentProfile.name}"...
            </button>
          )}

          {/* Edit form */}
          {showEditForm && (
            <div className="p-3 border-t border-border">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Profile name"
                className="w-full px-2 py-1 text-sm bg-bg-primary border border-border rounded text-text-primary mb-2"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveEdit()
                  if (e.key === 'Escape') setShowEditForm(false)
                }}
              />
              <div className="flex gap-1 mb-2">
                {PROFILE_COLORS.map((color) => (
                  <button
                    key={color}
                    className="w-5 h-5 rounded-full border-2 transition-transform"
                    style={{
                      backgroundColor: color,
                      borderColor: color === editColor ? 'white' : 'transparent',
                      transform: color === editColor ? 'scale(1.15)' : undefined,
                    }}
                    onClick={() => setEditColor(color)}
                  />
                ))}
              </div>
              <div className="flex gap-1">
                <button
                  className="flex-1 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-500"
                  onClick={handleSaveEdit}
                >
                  Save
                </button>
                <button
                  className="flex-1 px-2 py-1 text-xs bg-bg-tertiary text-text-secondary rounded hover:bg-bg-primary"
                  onClick={() => setShowEditForm(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* New profile */}
          {!showNewForm && !showEditForm && (
            <>
              <div className="border-t border-border" />
              <button
                className="w-full px-3 py-2 text-sm text-text-secondary hover:bg-bg-tertiary text-left"
                onClick={() => {
                  setShowNewForm(true)
                  setShowEditForm(false)
                }}
              >
                New Profile...
              </button>
            </>
          )}

          {/* New profile form */}
          {showNewForm && (
            <div className="p-3 border-t border-border">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Profile name"
                className="w-full px-2 py-1 text-sm bg-bg-primary border border-border rounded text-text-primary mb-2"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateProfile()
                  if (e.key === 'Escape') setShowNewForm(false)
                }}
              />
              <div className="flex gap-1 mb-2">
                {PROFILE_COLORS.map((color) => (
                  <button
                    key={color}
                    className="w-5 h-5 rounded-full border-2 transition-transform"
                    style={{
                      backgroundColor: color,
                      borderColor: color === newColor ? 'white' : 'transparent',
                      transform: color === newColor ? 'scale(1.15)' : undefined,
                    }}
                    onClick={() => setNewColor(color)}
                  />
                ))}
              </div>
              <div className="flex gap-1">
                <button
                  className="flex-1 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-500"
                  onClick={handleCreateProfile}
                >
                  Create
                </button>
                <button
                  className="flex-1 px-2 py-1 text-xs bg-bg-tertiary text-text-secondary rounded hover:bg-bg-primary"
                  onClick={() => setShowNewForm(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
