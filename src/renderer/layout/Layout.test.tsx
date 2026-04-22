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
      [PANEL_IDS.AGENT]: <div data-testid="terminal-content">Terminal</div>,
      [PANEL_IDS.SETTINGS]: <div data-testid="settings-content">Settings</div>,
    },
    panelVisibility: {
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
    expect(screen.getByTestId('terminal-content')).toBeTruthy()
  })

  it('hides file viewer when not visible', () => {
    const { container } = renderLayout()
    // File viewer is now always mounted but hidden via CSS
    const fileViewerPanel = container.querySelector(`[data-panel-id="${PANEL_IDS.FILE_VIEWER}"]`)!
    expect(fileViewerPanel.className).toContain('hidden')
  })

  it('shows file viewer when visible', () => {
    renderLayout({
      panelVisibility: {
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
  })

  it('renders profile chip when provided', () => {
    renderLayout({ profileChip: <span data-testid="profile">Test Profile</span> })
    expect(screen.getByTestId('profile')).toBeTruthy()
  })

  it('always renders terminal area even when other panels hidden', () => {
    renderLayout({
      panelVisibility: {
        [PANEL_IDS.EXPLORER]: false,
        [PANEL_IDS.FILE_VIEWER]: false,
      },
    })
    expect(screen.getByTestId('terminal-content')).toBeTruthy()
  })

  it('renders panel picker button when onOpenPanelPicker provided', () => {
    renderLayout()
    expect(screen.getByTitle('Configure panels')).toBeTruthy()
  })

  it('renders hamburger menu button when onMenuButtonClick provided', () => {
    renderLayout({ onOpenPanelPicker: undefined, onMenuButtonClick: vi.fn() })
    expect(screen.getByTitle('Menu')).toBeTruthy()
    expect(screen.queryByTitle('Configure panels')).toBeNull()
  })

  it('renders tutorial panel when visible', () => {
    renderLayout({
      panels: {
        [PANEL_IDS.SIDEBAR]: <div data-testid="sidebar-content">Sidebar</div>,
        [PANEL_IDS.EXPLORER]: <div data-testid="explorer-content">Explorer</div>,
        [PANEL_IDS.FILE_VIEWER]: <div data-testid="fileviewer-content">FileViewer</div>,
        [PANEL_IDS.AGENT]: <div data-testid="terminal-content">Terminal</div>,
        [PANEL_IDS.SETTINGS]: <div data-testid="settings-content">Settings</div>,
        [PANEL_IDS.TUTORIAL]: <div data-testid="tutorial-content">Tutorial</div>,
      },
      globalPanelVisibility: {
        [PANEL_IDS.SIDEBAR]: true,
        [PANEL_IDS.SETTINGS]: false,
        [PANEL_IDS.TUTORIAL]: true,
      },
    })
    expect(screen.getByTestId('tutorial-content')).toBeTruthy()
  })

  it('hides explorer and tutorial when error message is present', () => {
    renderLayout({
      panels: {
        [PANEL_IDS.SIDEBAR]: <div data-testid="sidebar-content">Sidebar</div>,
        [PANEL_IDS.EXPLORER]: <div data-testid="explorer-content">Explorer</div>,
        [PANEL_IDS.FILE_VIEWER]: <div data-testid="fileviewer-content">FileViewer</div>,
        [PANEL_IDS.AGENT]: <div data-testid="terminal-content">Terminal</div>,
        [PANEL_IDS.TUTORIAL]: <div data-testid="tutorial-content">Tutorial</div>,
      },
      panelVisibility: {
        [PANEL_IDS.EXPLORER]: true,
      },
      globalPanelVisibility: {
        [PANEL_IDS.SIDEBAR]: true,
        [PANEL_IDS.SETTINGS]: false,
        [PANEL_IDS.TUTORIAL]: true,
      },
      errorMessage: 'Something went wrong',
    })
    expect(screen.getByText('Something went wrong')).toBeTruthy()
    expect(screen.queryByTestId('explorer-content')).toBeNull()
    expect(screen.queryByTestId('tutorial-content')).toBeNull()
  })
})
