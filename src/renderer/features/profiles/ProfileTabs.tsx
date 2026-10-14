/**
 * Profile tab bar displayed in the title bar.
 *
 * Renders all profiles as compact colored tabs. Clicking a tab switches to that
 * profile within the same window. A "+" button creates a new profile inline.
 * Each tab has a delete button (shown on hover) and supports double-click rename.
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import { useProfileStore } from '../../store/profiles'

export const PROFILE_COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#22c55e', // green
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
]

interface ProfileTabsProps {
  onSwitchProfile: (profileId: string) => void
}

export default function ProfileTabs({ onSwitchProfile }: ProfileTabsProps) {
  const profiles = useProfileStore(s => s.profiles)
  const currentProfileId = useProfileStore(s => s.currentProfileId)
  const addProfile = useProfileStore(s => s.addProfile)
  const deleteProfile = useProfileStore(s => s.deleteProfile)
  const updateProfile = useProfileStore(s => s.updateProfile)

  const [showNewForm, setShowNewForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(PROFILE_COLORS[0])
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState(PROFILE_COLORS[0])
  const newInputRef = useRef<HTMLInputElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (showNewForm) newInputRef.current?.focus()
  }, [showNewForm])

  useEffect(() => {
    if (editingProfileId) editInputRef.current?.focus()
  }, [editingProfileId])

  const handleStartNew = useCallback(() => {
    setShowNewForm(true)
    setNewName('')
    setNewColor(PROFILE_COLORS[0])
  }, [])

  const handleCreateProfile = useCallback(async () => {
    if (!newName.trim()) {
      setShowNewForm(false)
      return
    }
    await addProfile(newName.trim(), newColor)
    setShowNewForm(false)
    setNewName('')
    setNewColor(PROFILE_COLORS[0])
  }, [newName, newColor, addProfile])

  const handleStartEdit = useCallback((profileId: string, name: string, color: string) => {
    setEditingProfileId(profileId)
    setEditName(name)
    setEditColor(color)
  }, [])

  const handleSaveEdit = useCallback(async () => {
    if (!editingProfileId) return
    if (editName.trim()) {
      await updateProfile(editingProfileId, { name: editName.trim(), color: editColor })
    }
    setEditingProfileId(null)
  }, [editingProfileId, editName, editColor, updateProfile])

  const handleDelete = useCallback(async (e: React.MouseEvent, profileId: string) => {
    e.stopPropagation()
    await deleteProfile(profileId)
  }, [deleteProfile])

  return (
    <div
      className="flex items-center gap-0.5"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      {profiles.map((profile) => {
        const isActive = profile.id === currentProfileId
        const isEditing = editingProfileId === profile.id
        return (
          <div
            key={profile.id}
            className="group relative flex items-center"
          >
            {isEditing ? (
              <div className="flex items-center gap-1">
                <input
                  ref={editInputRef}
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="px-2 py-0.5 text-2xs font-semibold rounded border bg-bg-primary text-text-primary w-20"
                  style={{ borderColor: editColor }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') void handleSaveEdit()
                    if (e.key === 'Escape') setEditingProfileId(null)
                  }}
                  onBlur={() => void handleSaveEdit()}
                />
                <div className="flex gap-0.5">
                  {PROFILE_COLORS.map(color => (
                    <button
                      key={color}
                      className="w-3 h-3 rounded-full border transition-transform"
                      style={{
                        backgroundColor: color,
                        borderColor: color === editColor ? 'white' : 'transparent',
                        transform: color === editColor ? 'scale(1.25)' : undefined,
                      }}
                      onMouseDown={e => {
                        e.preventDefault()
                        setEditColor(color)
                      }}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <button
                onClick={() => { if (!isActive) onSwitchProfile(profile.id) }}
                onDoubleClick={() => handleStartEdit(profile.id, profile.name, profile.color)}
                className="px-2 py-0.5 text-2xs font-semibold rounded border cursor-pointer transition-opacity hover:opacity-80 pr-5"
                style={isActive ? {
                  backgroundColor: `${profile.color}20`,
                  color: profile.color,
                  borderColor: `${profile.color}30`,
                } : {
                  backgroundColor: 'transparent',
                  color: 'var(--color-text-secondary)',
                  borderColor: 'transparent',
                }}
                title="Double-click to rename"
              >
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full mr-1 flex-shrink-0 align-middle"
                  style={{ backgroundColor: profile.color }}
                />
                {profile.name}
              </button>
            )}

            {/* Delete button (only shown for non-active or when there are multiple profiles) */}
            {!isEditing && profiles.length > 1 && (
              <button
                className="absolute right-0.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-text-tertiary hover:text-danger-fg p-0.5"
                onClick={e => void handleDelete(e, profile.id)}
                title="Delete profile"
              >
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        )
      })}

      {/* New profile form */}
      {showNewForm ? (
        <div className="flex items-center gap-1 ml-0.5">
          <input
            ref={newInputRef}
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Name"
            className="px-2 py-0.5 text-2xs font-semibold rounded border bg-bg-primary text-text-primary border-border w-20"
            onKeyDown={e => {
              if (e.key === 'Enter') void handleCreateProfile()
              if (e.key === 'Escape') setShowNewForm(false)
            }}
            onBlur={() => void handleCreateProfile()}
          />
          <div className="flex gap-0.5">
            {PROFILE_COLORS.map(color => (
              <button
                key={color}
                className="w-3 h-3 rounded-full border transition-transform"
                style={{
                  backgroundColor: color,
                  borderColor: color === newColor ? 'white' : 'transparent',
                  transform: color === newColor ? 'scale(1.25)' : undefined,
                }}
                onMouseDown={e => {
                  e.preventDefault()
                  setNewColor(color)
                }}
              />
            ))}
          </div>
        </div>
      ) : (
        <button
          onClick={handleStartNew}
          className="ml-0.5 w-5 h-5 flex items-center justify-center rounded text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-colors text-xs"
          title="New profile"
        >
          +
        </button>
      )}
    </div>
  )
}
