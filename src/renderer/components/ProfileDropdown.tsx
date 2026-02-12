import type { ProfileData } from '../../preload/index'

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

interface ProfileDropdownProps {
  profiles: ProfileData[]
  currentProfileId: string
  currentProfile: ProfileData
  showNewForm: boolean
  showEditForm: boolean
  setShowNewForm: (show: boolean) => void
  setShowEditForm: (show: boolean) => void
  newName: string
  setNewName: (name: string) => void
  newColor: string
  setNewColor: (color: string) => void
  editName: string
  setEditName: (name: string) => void
  editColor: string
  setEditColor: (color: string) => void
  onSwitchProfile: (profileId: string) => void
  onCreateProfile: () => void
  onStartEdit: () => void
  onSaveEdit: () => void
  onDelete: (profileId: string) => void
  dropdownRef: React.RefObject<HTMLDivElement>
}

export default function ProfileDropdown({
  profiles,
  currentProfileId,
  showNewForm,
  showEditForm,
  setShowNewForm,
  setShowEditForm,
  newName,
  setNewName,
  newColor,
  setNewColor,
  editName,
  setEditName,
  editColor,
  setEditColor,
  onSwitchProfile,
  onCreateProfile,
  onStartEdit,
  onSaveEdit,
  onDelete,
  dropdownRef,
  currentProfile,
}: ProfileDropdownProps) {
  return (
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
            onClick={() => onSwitchProfile(profile.id)}
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
                onDelete(profile.id)
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
          onClick={onStartEdit}
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
              if (e.key === 'Enter') onSaveEdit()
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
              onClick={onSaveEdit}
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
              if (e.key === 'Enter') onCreateProfile()
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
              onClick={onCreateProfile}
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
  )
}
