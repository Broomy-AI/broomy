// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../test/react-setup'
import LayoutToolbar from './LayoutToolbar'
import { PANEL_IDS } from '../panels'

// Mock ErrorIndicator to avoid pulling in ErrorStore rendering complexity
vi.mock('./ErrorIndicator', () => ({
  default: () => <div data-testid="error-indicator" />,
}))

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
})

function makeToolbarPanelInfo(overrides: Partial<{ isVisible: boolean }> = {}) {
  return [
    {
      id: PANEL_IDS.SIDEBAR,
      name: 'Sessions',
      icon: <span>S</span>,
      position: 'sidebar' as const,
      defaultVisible: true,
      defaultInToolbar: true,
      shortcutKey: '1',
      isVisible: true,
      ...overrides,
    },
    {
      id: PANEL_IDS.AGENT_TERMINAL,
      name: 'Agent',
      icon: <span>A</span>,
      position: 'center-main' as const,
      defaultVisible: true,
      defaultInToolbar: true,
      shortcutKey: '4',
      isVisible: false,
      ...overrides,
    },
    {
      id: PANEL_IDS.SETTINGS,
      name: 'Settings',
      icon: <span>G</span>,
      position: 'overlay' as const,
      defaultVisible: false,
      defaultInToolbar: true,
      shortcutKey: null,
      isVisible: false,
    },
  ]
}

function renderToolbar(overrides: Record<string, unknown> = {}) {
  const defaultProps = {
    title: 'Test Session',
    isDev: false,
    profileChip: undefined as React.ReactNode,
    toolbarPanelInfo: makeToolbarPanelInfo(),
    onToggle: vi.fn(),
    onOpenPanelPicker: vi.fn(),
    settingsPanelId: PANEL_IDS.SETTINGS,
    ...overrides,
  }

  return render(<LayoutToolbar {...defaultProps} />)
}

describe('LayoutToolbar', () => {
  it('renders title text', () => {
    renderToolbar({ title: 'My Project' })
    expect(screen.getByText('My Project')).toBeTruthy()
  })

  it('renders default title "Broomy" when no title provided', () => {
    renderToolbar({ title: undefined })
    expect(screen.getByText('Broomy')).toBeTruthy()
  })

  it('shows DEV badge when isDev is true', () => {
    renderToolbar({ isDev: true })
    expect(screen.getByText('DEV')).toBeTruthy()
  })

  it('hides DEV badge when isDev is false', () => {
    renderToolbar({ isDev: false })
    expect(screen.queryByText('DEV')).toBeNull()
  })

  it('renders profile chip when provided', () => {
    renderToolbar({ profileChip: <span data-testid="chip">Profile</span> })
    expect(screen.getByTestId('chip')).toBeTruthy()
  })

  it('renders toolbar buttons for each panel', () => {
    renderToolbar()
    // Non-icon-only panels show their name
    expect(screen.getByText('Sessions')).toBeTruthy()
    expect(screen.getByText('Agent')).toBeTruthy()
  })

  it('calls onToggle when a panel button is clicked', () => {
    const onToggle = vi.fn()
    renderToolbar({ onToggle })
    fireEvent.click(screen.getByText('Agent'))
    expect(onToggle).toHaveBeenCalledWith(PANEL_IDS.AGENT_TERMINAL)
  })

  it('displays shortcut key in button title', () => {
    renderToolbar()
    // Sessions has shortcutKey '1', so title should include modifier+1
    const sessionsBtn = screen.getByText('Sessions')
    expect(sessionsBtn.getAttribute('title')).toContain('1')
  })

  it('renders icon-only for settings panel', () => {
    renderToolbar()
    // Settings panel (isIconOnly) should render icon content, not name text
    const settingsBtn = screen.getByTitle(/Settings/)
    expect(settingsBtn.textContent).toBe('G') // icon content
  })

  it('shows configure panels button when onOpenPanelPicker is provided', () => {
    renderToolbar({ onOpenPanelPicker: vi.fn() })
    expect(screen.getByTitle('Configure panels')).toBeTruthy()
  })

  it('does not show configure panels button when onOpenPanelPicker is undefined', () => {
    renderToolbar({ onOpenPanelPicker: undefined })
    expect(screen.queryByTitle('Configure panels')).toBeNull()
  })

  it('calls onOpenPanelPicker when configure button is clicked', () => {
    const onOpenPanelPicker = vi.fn()
    renderToolbar({ onOpenPanelPicker })
    fireEvent.click(screen.getByTitle('Configure panels'))
    expect(onOpenPanelPicker).toHaveBeenCalled()
  })

  it('applies active style to visible panels', () => {
    renderToolbar()
    // Sessions is visible, so its button should have bg-accent
    const sessionsBtn = screen.getByText('Sessions')
    expect(sessionsBtn.className).toContain('bg-accent')
  })

  it('applies inactive style to hidden panels', () => {
    renderToolbar()
    // Agent is not visible
    const agentBtn = screen.getByText('Agent')
    expect(agentBtn.className).toContain('bg-bg-tertiary')
  })

  it('renders error indicator', () => {
    renderToolbar()
    expect(screen.getByTestId('error-indicator')).toBeTruthy()
  })
})
