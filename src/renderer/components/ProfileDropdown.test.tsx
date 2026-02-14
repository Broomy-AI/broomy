// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../test/react-setup'
import ProfileDropdown, { PROFILE_COLORS } from './ProfileDropdown'
import { createRef } from 'react'
import type { ProfileData } from '../../preload/index'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
})

function makeProfile(overrides: Partial<ProfileData> = {}): ProfileData {
  return {
    id: 'default',
    name: 'Default',
    color: '#3b82f6',
    ...overrides,
  }
}

function renderDropdown(overrides: Record<string, unknown> = {}) {
  const currentProfile = makeProfile({ id: 'current', name: 'Current' })
  const defaultProps = {
    profiles: [
      currentProfile,
      makeProfile({ id: 'other', name: 'Other Profile', color: '#ef4444' }),
    ],
    currentProfileId: 'current',
    currentProfile,
    showNewForm: false,
    showEditForm: false,
    setShowNewForm: vi.fn(),
    setShowEditForm: vi.fn(),
    newName: '',
    setNewName: vi.fn(),
    newColor: PROFILE_COLORS[0],
    setNewColor: vi.fn(),
    editName: '',
    setEditName: vi.fn(),
    editColor: PROFILE_COLORS[0],
    setEditColor: vi.fn(),
    onSwitchProfile: vi.fn(),
    onCreateProfile: vi.fn(),
    onStartEdit: vi.fn(),
    onSaveEdit: vi.fn(),
    onDelete: vi.fn(),
    dropdownRef: createRef<HTMLDivElement>(),
    ...overrides,
  }

  return render(<ProfileDropdown {...defaultProps} />)
}

describe('ProfileDropdown', () => {
  it('renders other profiles (not current)', () => {
    renderDropdown()
    expect(screen.getByText('Other Profile')).toBeTruthy()
    // Current profile name appears in the edit button text
    expect(screen.getByText('Edit "Current"...')).toBeTruthy()
  })

  it('shows "Edit" button for current profile', () => {
    renderDropdown()
    expect(screen.getByText('Edit "Current"...')).toBeTruthy()
  })

  it('shows "New Profile..." button', () => {
    renderDropdown()
    expect(screen.getByText('New Profile...')).toBeTruthy()
  })

  it('calls onSwitchProfile when clicking another profile', () => {
    const onSwitchProfile = vi.fn()
    renderDropdown({ onSwitchProfile })
    fireEvent.click(screen.getByText('Other Profile'))
    expect(onSwitchProfile).toHaveBeenCalledWith('other')
  })

  it('calls onDelete when clicking the delete button on a profile', () => {
    const onDelete = vi.fn()
    renderDropdown({ onDelete })
    fireEvent.click(screen.getByTitle('Delete profile'))
    expect(onDelete).toHaveBeenCalledWith('other')
  })

  it('calls onStartEdit when edit button is clicked', () => {
    const onStartEdit = vi.fn()
    renderDropdown({ onStartEdit })
    fireEvent.click(screen.getByText('Edit "Current"...'))
    expect(onStartEdit).toHaveBeenCalled()
  })

  it('shows edit form when showEditForm is true', () => {
    renderDropdown({ showEditForm: true, editName: 'Current' })
    expect(screen.getByDisplayValue('Current')).toBeTruthy()
    expect(screen.getByText('Save')).toBeTruthy()
    expect(screen.getByText('Cancel')).toBeTruthy()
  })

  it('calls onSaveEdit when Save button is clicked in edit form', () => {
    const onSaveEdit = vi.fn()
    renderDropdown({ showEditForm: true, editName: 'Updated', onSaveEdit })
    fireEvent.click(screen.getByText('Save'))
    expect(onSaveEdit).toHaveBeenCalled()
  })

  it('calls setShowEditForm(false) when Cancel is clicked in edit form', () => {
    const setShowEditForm = vi.fn()
    renderDropdown({ showEditForm: true, editName: 'Updated', setShowEditForm })
    fireEvent.click(screen.getByText('Cancel'))
    expect(setShowEditForm).toHaveBeenCalledWith(false)
  })

  it('calls onSaveEdit on Enter in edit form input', () => {
    const onSaveEdit = vi.fn()
    renderDropdown({ showEditForm: true, editName: 'Updated', onSaveEdit })
    fireEvent.keyDown(screen.getByDisplayValue('Updated'), { key: 'Enter' })
    expect(onSaveEdit).toHaveBeenCalled()
  })

  it('calls setShowEditForm(false) on Escape in edit form input', () => {
    const setShowEditForm = vi.fn()
    renderDropdown({ showEditForm: true, editName: 'Updated', setShowEditForm })
    fireEvent.keyDown(screen.getByDisplayValue('Updated'), { key: 'Escape' })
    expect(setShowEditForm).toHaveBeenCalledWith(false)
  })

  it('shows new profile form when showNewForm is true', () => {
    renderDropdown({ showNewForm: true, newName: '' })
    expect(screen.getByPlaceholderText('Profile name')).toBeTruthy()
    expect(screen.getByText('Create')).toBeTruthy()
  })

  it('calls onCreateProfile when Create button clicked', () => {
    const onCreateProfile = vi.fn()
    renderDropdown({ showNewForm: true, onCreateProfile })
    fireEvent.click(screen.getByText('Create'))
    expect(onCreateProfile).toHaveBeenCalled()
  })

  it('calls setShowNewForm(true) when "New Profile..." is clicked', () => {
    const setShowNewForm = vi.fn()
    renderDropdown({ setShowNewForm })
    fireEvent.click(screen.getByText('New Profile...'))
    expect(setShowNewForm).toHaveBeenCalledWith(true)
  })

  it('renders color swatches in edit form', () => {
    const { container } = renderDropdown({ showEditForm: true, editName: 'Test' })
    const colorButtons = container.querySelectorAll('.rounded-full')
    // Each PROFILE_COLORS entry gets a button, plus the colored dot on the other profile
    expect(colorButtons.length).toBeGreaterThanOrEqual(PROFILE_COLORS.length)
  })

  it('calls setEditColor when a color swatch is clicked in edit form', () => {
    const setEditColor = vi.fn()
    renderDropdown({ showEditForm: true, editName: 'Test', setEditColor })
    // Find a color swatch button in the edit form (they are .rounded-full with border-2)
    const colorSwatches = screen.getAllByRole('button').filter(
      btn => btn.className.includes('rounded-full') && btn.className.includes('border-2')
    )
    fireEvent.click(colorSwatches[2]) // Click third color
    expect(setEditColor).toHaveBeenCalledWith(PROFILE_COLORS[2])
  })

  it('hides edit and new buttons when showEditForm is true', () => {
    renderDropdown({ showEditForm: true, editName: 'Test' })
    expect(screen.queryByText('Edit "Current"...')).toBeNull()
    expect(screen.queryByText('New Profile...')).toBeNull()
  })

  it('hides edit and new buttons when showNewForm is true', () => {
    renderDropdown({ showNewForm: true })
    expect(screen.queryByText('Edit "Current"...')).toBeNull()
    expect(screen.queryByText('New Profile...')).toBeNull()
  })

  it('calls setEditName when edit input changes', () => {
    const setEditName = vi.fn()
    renderDropdown({ showEditForm: true, editName: '', setEditName })
    fireEvent.change(screen.getByPlaceholderText('Profile name'), { target: { value: 'New Name' } })
    expect(setEditName).toHaveBeenCalledWith('New Name')
  })
})
