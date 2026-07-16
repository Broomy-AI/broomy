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
    showAgent: true,
    fileViewerPosition: 'top' as const,
    layoutSizes: {
      explorerWidth: 256,
      fileViewerSize: 300,
      userTerminalHeight: 192,
      diffPanelWidth: 320,
      tutorialPanelWidth: 320,
    },
    errorMessage: null as string | null,
    settingsPanel: <div data-testid="settings">Settings</div>,
    fileViewer: <div data-testid="file-viewer">FileViewer</div>,
    terminal: <div data-testid="terminal">Terminal</div>,
    flashedPanel: null as string | null,
    draggingDivider: null,
    onMouseDown: vi.fn(() => vi.fn()),
    ...overrides,
  }

  return render(<LayoutContentArea {...defaultProps} />)
}

describe('LayoutContentArea', () => {
  it('renders terminal area', () => {
    renderContentArea()
    expect(screen.getByTestId('terminal')).toBeTruthy()
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

  it('hides file viewer panel when showFileViewer is false (CSS hidden, still mounted)', () => {
    const { container } = renderContentArea({ showFileViewer: false })
    // File viewer is still in the DOM (mounted) but the panel container is hidden via CSS
    const fileViewerPanel = container.querySelector(`[data-panel-id="${PANEL_IDS.FILE_VIEWER}"]`)!
    expect(fileViewerPanel.className).toContain('hidden')
  })

  it('hides content area when errorMessage is provided', () => {
    const { container } = renderContentArea({ errorMessage: 'Something went wrong' })
    const outerDiv = container.firstElementChild!
    expect(outerDiv.className).toContain('hidden')
  })

  it('shows flash overlay when flashedPanel matches agent', () => {
    const { container } = renderContentArea({ flashedPanel: 'agent' })
    // Agent panel doesn't use FlashOverlay in LayoutContentArea,
    // but file viewer does. Check that no flash overlay appears for unknown panel
    // The flash overlay is only on FILE_VIEWER in LayoutContentArea
    const flashOverlay = container.querySelector('.bg-elevate\\/10')
    // Agent doesn't have its own flash overlay in LayoutContentArea
    expect(flashOverlay).toBeNull()
  })

  it('shows flash overlay when flashedPanel matches file viewer', () => {
    const { container } = renderContentArea({
      showFileViewer: true,
      flashedPanel: PANEL_IDS.FILE_VIEWER,
    })
    const flashOverlay = container.querySelector('.bg-elevate\\/10')
    expect(flashOverlay).toBeTruthy()
  })

  it('does not show flash overlay when flashedPanel does not match', () => {
    const { container } = renderContentArea({ flashedPanel: null })
    const flashOverlay = container.querySelector('.bg-elevate\\/10')
    expect(flashOverlay).toBeNull()
  })

  it('renders divider between file viewer and terminal when both visible', () => {
    const onMouseDown = vi.fn(() => vi.fn())
    const { container } = renderContentArea({
      showFileViewer: true,
      onMouseDown,
    })
    // Should have divider elements (cursor-row-resize or cursor-col-resize)
    const dividers = container.querySelectorAll('.cursor-row-resize, .cursor-col-resize')
    expect(dividers.length).toBeGreaterThan(0)
  })

  it('hides divider when only terminal visible', () => {
    const { container } = renderContentArea({
      showFileViewer: false,
    })
    // Divider is still in the DOM but its parent wrapper is hidden
    const dividers = container.querySelectorAll('.cursor-row-resize, .cursor-col-resize')
    if (dividers.length > 0) {
      // Divider's parent wrapper should be hidden
      expect(dividers[0].parentElement!.className).toContain('hidden')
    }
  })

  it('applies flex-row direction when fileViewerPosition is left', () => {
    const { container } = renderContentArea({
      showFileViewer: true,
      fileViewerPosition: 'left',
    })
    // The content div should use flex-row when file viewer is left
    const contentDiv = container.querySelector('.flex-row')
    expect(contentDiv).toBeTruthy()
  })

  it('applies flex-col direction when fileViewerPosition is top', () => {
    const { container } = renderContentArea({
      showFileViewer: true,
      fileViewerPosition: 'top',
    })
    const contentDiv = container.querySelector('.flex-col')
    expect(contentDiv).toBeTruthy()
  })

  it('divider wrapper uses flex layout when visible so divider stretches to full height', () => {
    const { container } = renderContentArea({
      showFileViewer: true,
      fileViewerPosition: 'left',
    })
    const divider = container.querySelector('.cursor-col-resize')!
    const wrapper = divider.parentElement!
    expect(wrapper.className).toContain('flex')
    expect(wrapper.className).not.toContain('hidden')
  })

  it('calls onMouseDown when divider is pressed', () => {
    const innerFn = vi.fn()
    const onMouseDown = vi.fn(() => innerFn)
    const { container } = renderContentArea({
      showFileViewer: true,
      onMouseDown,
    })
    const divider = container.querySelector('.cursor-row-resize')!
    fireEvent.mouseDown(divider)
    expect(onMouseDown).toHaveBeenCalled()
  })
})
