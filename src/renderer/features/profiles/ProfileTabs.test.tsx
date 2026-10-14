// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../../test/react-setup'
import ProfileTabs from './ProfileTabs'
import { useProfileStore } from '../../store/profiles'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
  useProfileStore.setState({
    profiles: [{ id: 'default', name: 'Default', color: '#3b82f6' }],
    currentProfileId: 'default',
  })
})

describe('ProfileTabs', () => {
  it('renders the current profile as a tab', () => {
    render(<ProfileTabs onSwitchProfile={vi.fn()} />)
    expect(screen.getByText('Default')).toBeTruthy()
  })

  it('renders all profiles as tabs', () => {
    useProfileStore.setState({
      profiles: [
        { id: 'default', name: 'Default', color: '#3b82f6' },
        { id: 'work', name: 'Work', color: '#22c55e' },
      ],
      currentProfileId: 'default',
    })
    render(<ProfileTabs onSwitchProfile={vi.fn()} />)
    expect(screen.getByText('Default')).toBeTruthy()
    expect(screen.getByText('Work')).toBeTruthy()
  })

  it('calls onSwitchProfile when clicking a non-active tab', () => {
    const onSwitch = vi.fn()
    useProfileStore.setState({
      profiles: [
        { id: 'default', name: 'Default', color: '#3b82f6' },
        { id: 'work', name: 'Work', color: '#22c55e' },
      ],
      currentProfileId: 'default',
    })
    render(<ProfileTabs onSwitchProfile={onSwitch} />)
    fireEvent.click(screen.getByText('Work'))
    expect(onSwitch).toHaveBeenCalledWith('work')
  })

  it('does not call onSwitchProfile when clicking the active tab', () => {
    const onSwitch = vi.fn()
    render(<ProfileTabs onSwitchProfile={onSwitch} />)
    fireEvent.click(screen.getByText('Default'))
    expect(onSwitch).not.toHaveBeenCalled()
  })

  it('shows the + button to add a new profile', () => {
    render(<ProfileTabs onSwitchProfile={vi.fn()} />)
    expect(screen.getByTitle('New profile')).toBeTruthy()
  })

  it('shows new profile form when clicking +', () => {
    render(<ProfileTabs onSwitchProfile={vi.fn()} />)
    fireEvent.click(screen.getByTitle('New profile'))
    expect(screen.getByPlaceholderText('Name')).toBeTruthy()
  })

  it('creates a new profile on Enter', async () => {
    vi.mocked(window.profiles.save).mockResolvedValue({ success: true })
    render(<ProfileTabs onSwitchProfile={vi.fn()} />)
    fireEvent.click(screen.getByTitle('New profile'))
    const input = screen.getByPlaceholderText('Name')
    fireEvent.change(input, { target: { value: 'Work' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await vi.waitFor(() => {
      expect(useProfileStore.getState().profiles.length).toBeGreaterThan(1)
    })
  })

  it('cancels new profile form on Escape', () => {
    render(<ProfileTabs onSwitchProfile={vi.fn()} />)
    fireEvent.click(screen.getByTitle('New profile'))
    const input = screen.getByPlaceholderText('Name')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByPlaceholderText('Name')).toBeNull()
  })

  it('enters rename mode on double-click', () => {
    render(<ProfileTabs onSwitchProfile={vi.fn()} />)
    fireEvent.dblClick(screen.getByText('Default'))
    expect(screen.getByDisplayValue('Default')).toBeTruthy()
  })

  it('saves renamed profile on Enter', async () => {
    vi.mocked(window.profiles.save).mockResolvedValue({ success: true })
    render(<ProfileTabs onSwitchProfile={vi.fn()} />)
    fireEvent.dblClick(screen.getByText('Default'))
    const input = screen.getByDisplayValue('Default')
    fireEvent.change(input, { target: { value: 'Personal' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await vi.waitFor(() => {
      expect(useProfileStore.getState().profiles[0].name).toBe('Personal')
    })
  })

  it('cancels rename on Escape', () => {
    render(<ProfileTabs onSwitchProfile={vi.fn()} />)
    fireEvent.dblClick(screen.getByText('Default'))
    const input = screen.getByDisplayValue('Default')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.getByText('Default')).toBeTruthy()
    expect(screen.queryByDisplayValue('Default')).toBeNull()
  })

  it('renders nothing when profiles list is empty', () => {
    useProfileStore.setState({ profiles: [], currentProfileId: 'nonexistent' })
    const { container } = render(<ProfileTabs onSwitchProfile={vi.fn()} />)
    // No profile tabs, only the + button
    expect(screen.getByTitle('New profile')).toBeTruthy()
    expect(container.querySelectorAll('button').length).toBe(1)
  })
})
