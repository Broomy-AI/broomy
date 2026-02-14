// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../test/react-setup'
import PanelPicker from './PanelPicker'
import { PanelProvider, DEFAULT_TOOLBAR_PANELS, PANEL_IDS } from '../panels'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
})

function renderPanelPicker(overrides: Record<string, unknown> = {}) {
  const defaultProps = {
    toolbarPanels: [PANEL_IDS.SIDEBAR, PANEL_IDS.AGENT_TERMINAL, PANEL_IDS.USER_TERMINAL],
    onToolbarPanelsChange: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  }

  return render(
    <PanelProvider toolbarPanels={[...DEFAULT_TOOLBAR_PANELS]} onToolbarPanelsChange={vi.fn()}>
      <PanelPicker {...defaultProps} />
    </PanelProvider>
  )
}

describe('PanelPicker', () => {
  it('renders the configure toolbar header', () => {
    renderPanelPicker()
    expect(screen.getByText('Configure Toolbar')).toBeTruthy()
  })

  it('renders "In Toolbar" section with current panels', () => {
    renderPanelPicker()
    expect(screen.getByText('In Toolbar')).toBeTruthy()
    // Should show the names of panels in toolbar
    expect(screen.getByText('Sessions')).toBeTruthy()
    expect(screen.getByText('Agent')).toBeTruthy()
    expect(screen.getByText('Terminal')).toBeTruthy()
  })

  it('renders "Available" section with panels not in toolbar', () => {
    renderPanelPicker({
      toolbarPanels: [PANEL_IDS.SIDEBAR],
    })
    expect(screen.getByText('Available')).toBeTruthy()
  })

  it('calls onClose when Done button is clicked', () => {
    const onClose = vi.fn()
    renderPanelPicker({ onClose })
    fireEvent.click(screen.getByText('Done'))
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn()
    renderPanelPicker({ onClose })
    // Click the backdrop (the semi-transparent overlay)
    const backdrop = screen.getByText('Done').closest('.fixed')!.querySelector('.bg-black\\/30')!
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn()
    renderPanelPicker({ onClose })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('removes a panel from toolbar when remove button clicked', () => {
    const onToolbarPanelsChange = vi.fn()
    renderPanelPicker({
      toolbarPanels: [PANEL_IDS.SIDEBAR, PANEL_IDS.AGENT_TERMINAL],
      onToolbarPanelsChange,
    })
    // Click the remove button (x icon) for the first panel
    const removeButtons = screen.getAllByTitle('Remove from toolbar')
    fireEvent.click(removeButtons[0])
    expect(onToolbarPanelsChange).toHaveBeenCalledWith([PANEL_IDS.AGENT_TERMINAL])
  })

  it('adds a panel to toolbar when available panel is clicked', () => {
    const onToolbarPanelsChange = vi.fn()
    renderPanelPicker({
      toolbarPanels: [PANEL_IDS.SIDEBAR],
      onToolbarPanelsChange,
    })
    // Click on an available panel to add it
    const addButtons = screen.getAllByTitle('Add to toolbar')
    // Click the row containing the add button
    fireEvent.click(addButtons[0].closest('.cursor-pointer')!)
    expect(onToolbarPanelsChange).toHaveBeenCalled()
    const newPanels = onToolbarPanelsChange.mock.calls[0][0]
    expect(newPanels.length).toBe(2) // was 1, now 2
    expect(newPanels[0]).toBe(PANEL_IDS.SIDEBAR)
  })

  it('moves a panel up when move up button is clicked', () => {
    const onToolbarPanelsChange = vi.fn()
    renderPanelPicker({
      toolbarPanels: [PANEL_IDS.SIDEBAR, PANEL_IDS.AGENT_TERMINAL],
      onToolbarPanelsChange,
    })
    const moveUpButtons = screen.getAllByTitle('Move up')
    // Click move up on the second panel
    fireEvent.click(moveUpButtons[1])
    expect(onToolbarPanelsChange).toHaveBeenCalledWith([PANEL_IDS.AGENT_TERMINAL, PANEL_IDS.SIDEBAR])
  })

  it('moves a panel down when move down button is clicked', () => {
    const onToolbarPanelsChange = vi.fn()
    renderPanelPicker({
      toolbarPanels: [PANEL_IDS.SIDEBAR, PANEL_IDS.AGENT_TERMINAL],
      onToolbarPanelsChange,
    })
    const moveDownButtons = screen.getAllByTitle('Move down')
    // Click move down on the first panel
    fireEvent.click(moveDownButtons[0])
    expect(onToolbarPanelsChange).toHaveBeenCalledWith([PANEL_IDS.AGENT_TERMINAL, PANEL_IDS.SIDEBAR])
  })

  it('shows shortcut badges for panels within MAX_SHORTCUT_PANELS limit', () => {
    renderPanelPicker({
      toolbarPanels: [PANEL_IDS.SIDEBAR, PANEL_IDS.AGENT_TERMINAL],
    })
    // First panel should show shortcut 1, second should show shortcut 2
    const isMac = navigator.userAgent.includes('Mac')
    const modifier = isMac ? '\u2318' : 'Ctrl+'
    expect(screen.getByText(`${modifier}1`)).toBeTruthy()
    expect(screen.getByText(`${modifier}2`)).toBeTruthy()
  })

  it('shows empty state when no panels in toolbar', () => {
    renderPanelPicker({ toolbarPanels: [] })
    expect(screen.getByText('No panels in toolbar')).toBeTruthy()
  })

  it('disables move up on first panel', () => {
    renderPanelPicker({
      toolbarPanels: [PANEL_IDS.SIDEBAR, PANEL_IDS.AGENT_TERMINAL],
    })
    const moveUpButtons = screen.getAllByTitle('Move up')
    expect(moveUpButtons[0]).toBeDisabled()
  })

  it('disables move down on last panel', () => {
    renderPanelPicker({
      toolbarPanels: [PANEL_IDS.SIDEBAR, PANEL_IDS.AGENT_TERMINAL],
    })
    const moveDownButtons = screen.getAllByTitle('Move down')
    expect(moveDownButtons[moveDownButtons.length - 1]).toBeDisabled()
  })
})
