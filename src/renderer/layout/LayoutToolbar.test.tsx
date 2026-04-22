// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../test/react-setup'
import LayoutToolbar from './LayoutToolbar'
import { PANEL_IDS } from '../panels'

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
      id: PANEL_IDS.EXPLORER,
      name: 'Explorer',
      icon: <span>E</span>,
      position: 'left' as const,
      defaultVisible: false,
      defaultInToolbar: true,
      shortcutKey: '2',
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
    platform: 'darwin',
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

  it('shows DEV badge with commit hash when isDev is true', () => {
    renderToolbar({ isDev: true })
    expect(screen.getByText(/^DEV /)).toBeTruthy()
  })

  it('hides DEV badge when isDev is false', () => {
    renderToolbar({ isDev: false })
    expect(screen.queryByText(/^DEV /)).toBeNull()
  })

  it('renders profile chip when provided', () => {
    renderToolbar({ profileChip: <span data-testid="chip">Profile</span> })
    expect(screen.getByTestId('chip')).toBeTruthy()
  })

  it('renders toolbar buttons for each panel', () => {
    renderToolbar()
    // Non-icon-only panels show their name
    expect(screen.getByText('Sessions')).toBeTruthy()
    expect(screen.getByText('Explorer')).toBeTruthy()
  })

  it('calls onToggle when a panel button is clicked', () => {
    const onToggle = vi.fn()
    renderToolbar({ onToggle })
    fireEvent.click(screen.getByText('Explorer'))
    expect(onToggle).toHaveBeenCalledWith(PANEL_IDS.EXPLORER)
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

  it('shows hamburger menu button when onMenuButtonClick is provided', () => {
    renderToolbar({ onMenuButtonClick: vi.fn() })
    expect(screen.getByTitle('Menu')).toBeTruthy()
  })

  it('does not show hamburger menu button when onMenuButtonClick is undefined', () => {
    renderToolbar({ onMenuButtonClick: undefined })
    expect(screen.queryByTitle('Menu')).toBeNull()
  })

  it('calls onMenuButtonClick when hamburger button is clicked', () => {
    const onMenuButtonClick = vi.fn()
    renderToolbar({ onMenuButtonClick })
    fireEvent.click(screen.getByTitle('Menu'))
    expect(onMenuButtonClick).toHaveBeenCalled()
  })

  it('applies active style to visible panels', () => {
    renderToolbar()
    // Sessions is visible, so its button should have bg-accent
    const sessionsBtn = screen.getByText('Sessions')
    expect(sessionsBtn.className).toContain('bg-accent')
  })

  it('applies inactive style to hidden panels', () => {
    renderToolbar()
    // Explorer is not visible
    const explorerBtn = screen.getByText('Explorer')
    expect(explorerBtn.className).toContain('bg-bg-tertiary')
  })

  it('renders Linux window controls when platform is linux', () => {
    renderToolbar({ platform: 'linux' })
    expect(screen.getByTestId('linux-window-controls')).toBeTruthy()
    expect(screen.getByTitle('Minimize')).toBeTruthy()
    expect(screen.getByTitle('Maximize')).toBeTruthy()
    expect(screen.getByTitle('Close')).toBeTruthy()
  })

  it('does not render Linux window controls on macOS', () => {
    renderToolbar({ platform: 'darwin' })
    expect(screen.queryByTestId('linux-window-controls')).toBeNull()
  })

  it('does not render Linux window controls on Windows', () => {
    renderToolbar({ platform: 'win32' })
    expect(screen.queryByTestId('linux-window-controls')).toBeNull()
  })

  it('calls windowControls.minimize when minimize button clicked', () => {
    renderToolbar({ platform: 'linux' })
    fireEvent.click(screen.getByTitle('Minimize'))
    expect(window.windowControls.minimize).toHaveBeenCalled()
  })

  it('calls windowControls.maximize when maximize button clicked', () => {
    renderToolbar({ platform: 'linux' })
    fireEvent.click(screen.getByTitle('Maximize'))
    expect(window.windowControls.maximize).toHaveBeenCalled()
  })

  it('calls windowControls.close when close button clicked', () => {
    renderToolbar({ platform: 'linux' })
    fireEvent.click(screen.getByTitle('Close'))
    expect(window.windowControls.close).toHaveBeenCalled()
  })
})
