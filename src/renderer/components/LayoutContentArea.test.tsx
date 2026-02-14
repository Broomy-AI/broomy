// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../test/react-setup'
import LayoutContentArea from './LayoutContentArea'
import { PANEL_IDS } from '../panels'
import { createRef } from 'react'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
})

function renderContentArea(overrides: Record<string, unknown> = {}) {
  const defaultProps = {
    containerRef: createRef<HTMLDivElement>(),
    showSettings: false,
    showFileViewer: false,
    showAgentTerminal: true,
    showUserTerminal: true,
    fileViewerPosition: 'top' as const,
    layoutSizes: {
      explorerWidth: 256,
      fileViewerSize: 300,
      userTerminalHeight: 192,
      diffPanelWidth: 320,
      reviewPanelWidth: 320,
      tutorialPanelWidth: 320,
    },
    errorMessage: null as string | null,
    settingsPanel: <div data-testid="settings">Settings</div>,
    fileViewer: <div data-testid="file-viewer">FileViewer</div>,
    agentTerminal: <div data-testid="agent-terminal">Agent</div>,
    userTerminal: <div data-testid="user-terminal">User</div>,
    flashedPanel: null as string | null,
    draggingDivider: null,
    handleMouseDown: vi.fn(() => vi.fn()),
    ...overrides,
  }

  return render(<LayoutContentArea {...defaultProps} />)
}

describe('LayoutContentArea', () => {
  it('renders agent and user terminals when both visible', () => {
    renderContentArea()
    expect(screen.getByTestId('agent-terminal')).toBeTruthy()
    expect(screen.getByTestId('user-terminal')).toBeTruthy()
  })

  it('hides agent terminal when showAgentTerminal is false', () => {
    renderContentArea({ showAgentTerminal: false })
    // Agent terminal panel is hidden via CSS class
    const agentPanel = screen.getByTestId('agent-terminal').parentElement!
    expect(agentPanel.className).toContain('hidden')
  })

  it('hides user terminal when showUserTerminal is false', () => {
    renderContentArea({ showUserTerminal: false })
    const userPanel = screen.getByTestId('user-terminal').parentElement!
    expect(userPanel.className).toContain('hidden')
  })

  it('shows settings panel when showSettings is true', () => {
    renderContentArea({ showSettings: true })
    const settingsEl = screen.getByTestId('settings')
    const settingsPanel = settingsEl.parentElement!
    expect(settingsPanel.className).not.toContain('hidden')
  })

  it('hides settings panel when showSettings is false', () => {
    renderContentArea({ showSettings: false })
    const settingsEl = screen.getByTestId('settings')
    const settingsPanel = settingsEl.parentElement!
    expect(settingsPanel.className).toContain('hidden')
  })

  it('shows file viewer when showFileViewer is true', () => {
    renderContentArea({ showFileViewer: true })
    expect(screen.getByTestId('file-viewer')).toBeTruthy()
  })

  it('does not render file viewer when showFileViewer is false', () => {
    renderContentArea({ showFileViewer: false })
    expect(screen.queryByTestId('file-viewer')).toBeNull()
  })

  it('shows "No panels visible" placeholder when nothing is visible', () => {
    renderContentArea({
      showAgentTerminal: false,
      showUserTerminal: false,
      showFileViewer: false,
      showSettings: false,
    })
    expect(screen.getByText('No panels visible')).toBeTruthy()
  })

  it('hides content area when errorMessage is provided', () => {
    const { container } = renderContentArea({ errorMessage: 'Something went wrong' })
    const outerDiv = container.firstElementChild!
    expect(outerDiv.className).toContain('hidden')
  })

  it('shows flash overlay when flashedPanel matches a panel', () => {
    const { container } = renderContentArea({ flashedPanel: PANEL_IDS.AGENT_TERMINAL })
    const flashOverlay = container.querySelector('.bg-white\\/10')
    expect(flashOverlay).toBeTruthy()
  })

  it('does not show flash overlay when flashedPanel does not match', () => {
    const { container } = renderContentArea({ flashedPanel: null })
    const flashOverlay = container.querySelector('.bg-white\\/10')
    expect(flashOverlay).toBeNull()
  })

  it('renders divider between file viewer and terminals when both visible', () => {
    const handleMouseDown = vi.fn(() => vi.fn())
    const { container } = renderContentArea({
      showFileViewer: true,
      showAgentTerminal: true,
      handleMouseDown,
    })
    // Should have divider elements (cursor-row-resize or cursor-col-resize)
    const dividers = container.querySelectorAll('.cursor-row-resize, .cursor-col-resize')
    expect(dividers.length).toBeGreaterThan(0)
  })

  it('renders divider between agent and user terminal when both visible', () => {
    const { container } = renderContentArea({
      showAgentTerminal: true,
      showUserTerminal: true,
    })
    const horizontalDividers = container.querySelectorAll('.cursor-row-resize')
    expect(horizontalDividers.length).toBeGreaterThan(0)
  })

  it('does not render divider when only agent terminal visible', () => {
    const { container } = renderContentArea({
      showAgentTerminal: true,
      showUserTerminal: false,
      showFileViewer: false,
    })
    const dividers = container.querySelectorAll('.cursor-row-resize, .cursor-col-resize')
    expect(dividers.length).toBe(0)
  })

  it('applies flex-row direction when fileViewerPosition is left', () => {
    const { container } = renderContentArea({
      showFileViewer: true,
      showAgentTerminal: true,
      fileViewerPosition: 'left',
    })
    // The content div should use flex-row when file viewer is left
    const contentDiv = container.querySelector('.flex-row')
    expect(contentDiv).toBeTruthy()
  })

  it('applies flex-col direction when fileViewerPosition is top', () => {
    const { container } = renderContentArea({
      showFileViewer: true,
      showAgentTerminal: true,
      fileViewerPosition: 'top',
    })
    const contentDiv = container.querySelector('.flex-col')
    expect(contentDiv).toBeTruthy()
  })

  it('calls handleMouseDown when divider is pressed', () => {
    const innerFn = vi.fn()
    const handleMouseDown = vi.fn(() => innerFn)
    const { container } = renderContentArea({
      showAgentTerminal: true,
      showUserTerminal: true,
      handleMouseDown,
    })
    const divider = container.querySelector('.cursor-row-resize')!
    fireEvent.mouseDown(divider)
    expect(handleMouseDown).toHaveBeenCalled()
  })
})
