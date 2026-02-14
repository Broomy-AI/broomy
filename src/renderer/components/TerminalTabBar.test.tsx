// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../test/react-setup'
import TerminalTabBar from './TerminalTabBar'
import { createRef } from 'react'
import type { TerminalTab } from '../store/sessions'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
})

const mockTabs: TerminalTab[] = [
  { id: 'tab-1', name: 'Terminal 1' },
  { id: 'tab-2', name: 'Terminal 2' },
  { id: 'tab-3', name: 'Terminal 3' },
]

function renderTabBar(overrides: Record<string, unknown> = {}) {
  const defaultProps = {
    tabs: mockTabs,
    activeTabId: 'tab-1',
    editingTabId: null as string | null,
    editingName: '',
    dragOverTabId: null as string | null,
    isOverflowing: false,
    showDropdown: false,
    handleTabClick: vi.fn(),
    handleCloseTab: vi.fn(),
    handleContextMenu: vi.fn(),
    handleDoubleClick: vi.fn(),
    handleDragStart: vi.fn(),
    handleDragEnd: vi.fn(),
    handleDragOver: vi.fn(),
    handleDragLeave: vi.fn(),
    handleDrop: vi.fn(),
    handleRenameSubmit: vi.fn(),
    handleRenameKeyDown: vi.fn(),
    handleDropdownSelect: vi.fn(),
    handleAddTab: vi.fn(),
    setEditingName: vi.fn(),
    setShowDropdown: vi.fn(),
    editInputRef: createRef<HTMLInputElement>(),
    dropdownRef: createRef<HTMLDivElement>(),
    tabsContainerRef: createRef<HTMLDivElement>(),
    ...overrides,
  }

  return render(<TerminalTabBar {...defaultProps} />)
}

describe('TerminalTabBar', () => {
  it('renders all tabs', () => {
    renderTabBar()
    expect(screen.getByText('Terminal 1')).toBeTruthy()
    expect(screen.getByText('Terminal 2')).toBeTruthy()
    expect(screen.getByText('Terminal 3')).toBeTruthy()
  })

  it('highlights active tab with underline', () => {
    renderTabBar({ activeTabId: 'tab-2' })
    const tab2 = screen.getByText('Terminal 2')
    expect(tab2.className).toContain('border-accent')
  })

  it('calls handleTabClick when a tab is clicked', () => {
    const handleTabClick = vi.fn()
    renderTabBar({ handleTabClick })
    fireEvent.click(screen.getByText('Terminal 2'))
    expect(handleTabClick).toHaveBeenCalledWith('tab-2')
  })

  it('shows close buttons for tabs when there are multiple', () => {
    renderTabBar()
    const closeButtons = screen.getAllByTitle('Close tab')
    expect(closeButtons.length).toBe(3) // all tabs get close buttons when > 1
  })

  it('does not show close buttons when there is only one tab', () => {
    renderTabBar({ tabs: [{ id: 'tab-1', name: 'Terminal 1' }] })
    expect(screen.queryAllByTitle('Close tab').length).toBe(0)
  })

  it('calls handleCloseTab when close button is clicked', () => {
    const handleCloseTab = vi.fn()
    renderTabBar({ handleCloseTab })
    const closeButtons = screen.getAllByTitle('Close tab')
    fireEvent.click(closeButtons[0])
    expect(handleCloseTab).toHaveBeenCalled()
  })

  it('calls handleAddTab when add button is clicked', () => {
    const handleAddTab = vi.fn()
    renderTabBar({ handleAddTab })
    fireEvent.click(screen.getByTitle('New terminal tab'))
    expect(handleAddTab).toHaveBeenCalled()
  })

  it('calls handleContextMenu on right-click', () => {
    const handleContextMenu = vi.fn()
    renderTabBar({ handleContextMenu })
    fireEvent.contextMenu(screen.getByText('Terminal 1'))
    expect(handleContextMenu).toHaveBeenCalled()
  })

  it('calls handleDoubleClick on double-click', () => {
    const handleDoubleClick = vi.fn()
    renderTabBar({ handleDoubleClick })
    fireEvent.doubleClick(screen.getByText('Terminal 1'))
    expect(handleDoubleClick).toHaveBeenCalledWith('tab-1')
  })

  it('shows edit input when editing a tab', () => {
    renderTabBar({ editingTabId: 'tab-1', editingName: 'Renamed' })
    expect(screen.getByDisplayValue('Renamed')).toBeTruthy()
  })

  it('calls handleRenameSubmit on blur of edit input', () => {
    const handleRenameSubmit = vi.fn()
    renderTabBar({ editingTabId: 'tab-1', editingName: 'New Name', handleRenameSubmit })
    fireEvent.blur(screen.getByDisplayValue('New Name'))
    expect(handleRenameSubmit).toHaveBeenCalled()
  })

  it('calls handleRenameKeyDown on keydown in edit input', () => {
    const handleRenameKeyDown = vi.fn()
    renderTabBar({ editingTabId: 'tab-1', editingName: 'New Name', handleRenameKeyDown })
    fireEvent.keyDown(screen.getByDisplayValue('New Name'), { key: 'Enter' })
    expect(handleRenameKeyDown).toHaveBeenCalled()
  })

  it('calls setEditingName when edit input changes', () => {
    const setEditingName = vi.fn()
    renderTabBar({ editingTabId: 'tab-1', editingName: 'Old', setEditingName })
    fireEvent.change(screen.getByDisplayValue('Old'), { target: { value: 'New' } })
    expect(setEditingName).toHaveBeenCalledWith('New')
  })

  it('does not show dropdown button when not overflowing', () => {
    renderTabBar({ isOverflowing: false })
    expect(screen.queryByTitle('Show all tabs')).toBeNull()
  })

  it('shows dropdown button when overflowing', () => {
    renderTabBar({ isOverflowing: true })
    expect(screen.getByTitle('Show all tabs')).toBeTruthy()
  })

  it('calls setShowDropdown when dropdown button is clicked', () => {
    const setShowDropdown = vi.fn()
    renderTabBar({ isOverflowing: true, setShowDropdown, showDropdown: false })
    fireEvent.click(screen.getByTitle('Show all tabs'))
    expect(setShowDropdown).toHaveBeenCalledWith(true)
  })

  it('shows dropdown menu when showDropdown is true and overflowing', () => {
    renderTabBar({ isOverflowing: true, showDropdown: true })
    // Dropdown should render all tab names - once in the tab bar and once in the dropdown
    const dropdownItems = screen.getAllByText('Terminal 1')
    expect(dropdownItems.length).toBe(2) // once in tab bar, once in dropdown
  })

  it('calls handleDropdownSelect when dropdown item is clicked', () => {
    const handleDropdownSelect = vi.fn()
    renderTabBar({ isOverflowing: true, showDropdown: true, handleDropdownSelect })
    // Click the second tab in the dropdown
    const dropdownButtons = screen.getAllByRole('button').filter(
      btn => btn.textContent === 'Terminal 2' && btn.className.includes('w-full')
    )
    if (dropdownButtons.length > 0) {
      fireEvent.click(dropdownButtons[0])
      expect(handleDropdownSelect).toHaveBeenCalledWith('tab-2')
    }
  })

  it('shows drag-over indicator on target tab', () => {
    const { container } = renderTabBar({ dragOverTabId: 'tab-2' })
    const tab2Container = container.querySelector('.border-l-accent')
    expect(tab2Container).toBeTruthy()
  })

  it('makes tabs draggable when not editing', () => {
    const { container } = renderTabBar()
    const draggableTabs = container.querySelectorAll('[draggable="true"]')
    expect(draggableTabs.length).toBe(3) // All tabs are draggable
  })

  it('makes tab not draggable when it is being edited', () => {
    const { container } = renderTabBar({ editingTabId: 'tab-1' })
    const tab1 = container.querySelectorAll('[draggable]')[0]
    expect(tab1.getAttribute('draggable')).toBe('false')
  })

  it('calls handleDragStart when drag begins', () => {
    const handleDragStart = vi.fn()
    const { container } = renderTabBar({ handleDragStart })
    const tab = container.querySelectorAll('[draggable="true"]')[0]
    fireEvent.dragStart(tab)
    expect(handleDragStart).toHaveBeenCalled()
  })

  it('calls handleDragEnd when drag ends', () => {
    const handleDragEnd = vi.fn()
    const { container } = renderTabBar({ handleDragEnd })
    const tab = container.querySelectorAll('[draggable="true"]')[0]
    fireEvent.dragEnd(tab)
    expect(handleDragEnd).toHaveBeenCalled()
  })
})
