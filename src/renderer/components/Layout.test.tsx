// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '../../test/react-setup'
import Layout from './Layout'
import { PanelProvider, PANEL_IDS, DEFAULT_TOOLBAR_PANELS } from '../panels'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(window.app.isDev).mockResolvedValue(false)
})

function renderLayout(overrides: Record<string, unknown> = {}) {
  const defaultProps = {
    panels: {
      [PANEL_IDS.SIDEBAR]: <div data-testid="sidebar-content">Sidebar</div>,
      [PANEL_IDS.EXPLORER]: <div data-testid="explorer-content">Explorer</div>,
      [PANEL_IDS.FILE_VIEWER]: <div data-testid="fileviewer-content">FileViewer</div>,
      [PANEL_IDS.AGENT_TERMINAL]: <div data-testid="agent-content">Agent Terminal</div>,
      [PANEL_IDS.USER_TERMINAL]: <div data-testid="user-content">User Terminal</div>,
      [PANEL_IDS.SETTINGS]: <div data-testid="settings-content">Settings</div>,
    },
    panelVisibility: {
      [PANEL_IDS.AGENT_TERMINAL]: true,
      [PANEL_IDS.USER_TERMINAL]: true,
      [PANEL_IDS.EXPLORER]: true,
      [PANEL_IDS.FILE_VIEWER]: false,
    },
    globalPanelVisibility: {
      [PANEL_IDS.SIDEBAR]: true,
      [PANEL_IDS.SETTINGS]: false,
    },
    fileViewerPosition: 'top' as const,
    sidebarWidth: 224,
    layoutSizes: {
      explorerWidth: 256,
      fileViewerSize: 300,
      userTerminalHeight: 192,
      diffPanelWidth: 320,
      reviewPanelWidth: 320,
      tutorialPanelWidth: 320,
    },
    errorMessage: null,
    title: 'Test Session',
    onSidebarWidthChange: vi.fn(),
    onLayoutSizeChange: vi.fn(),
    onTogglePanel: vi.fn(),
    onToggleGlobalPanel: vi.fn(),
    onOpenPanelPicker: vi.fn(),
    ...overrides,
  }

  return render(
    <PanelProvider toolbarPanels={[...DEFAULT_TOOLBAR_PANELS]} onToolbarPanelsChange={vi.fn()}>
      <Layout {...defaultProps} />
    </PanelProvider>
  )
}

describe('Layout', () => {
  it('renders visible panels', () => {
    renderLayout()
    expect(screen.getByTestId('sidebar-content')).toBeTruthy()
    expect(screen.getByTestId('explorer-content')).toBeTruthy()
    expect(screen.getByTestId('agent-content')).toBeTruthy()
    expect(screen.getByTestId('user-content')).toBeTruthy()
  })

  it('hides file viewer when not visible', () => {
    renderLayout()
    expect(screen.queryByTestId('fileviewer-content')).toBeNull()
  })

  it('shows file viewer when visible', () => {
    renderLayout({
      panelVisibility: {
        [PANEL_IDS.AGENT_TERMINAL]: true,
        [PANEL_IDS.USER_TERMINAL]: true,
        [PANEL_IDS.EXPLORER]: true,
        [PANEL_IDS.FILE_VIEWER]: true,
      },
    })
    expect(screen.getByTestId('fileviewer-content')).toBeTruthy()
  })

  it('hides sidebar when not visible', () => {
    renderLayout({
      globalPanelVisibility: {
        [PANEL_IDS.SIDEBAR]: false,
        [PANEL_IDS.SETTINGS]: false,
      },
    })
    expect(screen.queryByTestId('sidebar-content')).toBeNull()
  })

  it('shows title in toolbar', () => {
    renderLayout({ title: 'My Project' })
    expect(screen.getByText('My Project')).toBeTruthy()
  })

  it('shows error message when provided', () => {
    renderLayout({ errorMessage: 'Folder not found: /missing/path' })
    expect(screen.getByText('Folder not found: /missing/path')).toBeTruthy()
  })

  it('renders toolbar buttons for each panel', () => {
    renderLayout()
    expect(screen.getByTitle(/Sessions/)).toBeTruthy()
    expect(screen.getByTitle(/Explorer/)).toBeTruthy()
    expect(screen.getByTitle(/File/)).toBeTruthy()
    expect(screen.getByTitle(/Agent/)).toBeTruthy()
    expect(screen.getByTitle(/Terminal/)).toBeTruthy()
  })

  it('renders profile chip when provided', () => {
    renderLayout({ profileChip: <span data-testid="profile">Test Profile</span> })
    expect(screen.getByTestId('profile')).toBeTruthy()
  })

  it('shows "No panels visible" when all panels hidden', () => {
    renderLayout({
      panelVisibility: {
        [PANEL_IDS.AGENT_TERMINAL]: false,
        [PANEL_IDS.USER_TERMINAL]: false,
        [PANEL_IDS.EXPLORER]: false,
        [PANEL_IDS.FILE_VIEWER]: false,
      },
    })
    expect(screen.getByText('No panels visible')).toBeTruthy()
  })

  it('renders panel picker button when onOpenPanelPicker provided', () => {
    renderLayout()
    expect(screen.getByTitle('Configure panels')).toBeTruthy()
  })
})
