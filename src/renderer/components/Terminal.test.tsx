// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../test/react-setup'
import Terminal from './Terminal'

// Mock the useTerminalSetup hook to avoid xterm.js issues in jsdom
vi.mock('../hooks/useTerminalSetup', () => ({
  useTerminalSetup: vi.fn().mockReturnValue({
    terminalRef: { current: null },
    ptyIdRef: { current: 'pty-123' },
    showScrollButton: false,
    handleScrollToBottom: vi.fn(),
  }),
}))

// Mock the xterm CSS import
vi.mock('@xterm/xterm/css/xterm.css', () => ({}))

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Terminal', () => {
  it('renders placeholder when no sessionId provided', () => {
    render(<Terminal cwd="/tmp/test" />)
    expect(screen.getByText('Select a session to view terminal')).toBeTruthy()
  })

  it('renders terminal container when sessionId is provided', () => {
    const { container } = render(
      <Terminal sessionId="session-1" cwd="/tmp/test" />
    )
    expect(container.querySelector('.h-full.w-full.p-2')).toBeTruthy()
  })

  it('does not show scroll button when showScrollButton is false', () => {
    render(<Terminal sessionId="session-1" cwd="/tmp/test" />)
    expect(screen.queryByText(/Go to End/)).toBeNull()
  })

  it('shows scroll button when showScrollButton is true', async () => {
    const { useTerminalSetup } = await import('../hooks/useTerminalSetup')
    vi.mocked(useTerminalSetup).mockReturnValue({
      terminalRef: { current: null },
      ptyIdRef: { current: 'pty-123' },
      showScrollButton: true,
      handleScrollToBottom: vi.fn(),
    })
    render(<Terminal sessionId="session-1" cwd="/tmp/test" />)
    expect(screen.getByText(/Go to End/)).toBeTruthy()
  })

  it('calls handleScrollToBottom when scroll button is clicked', async () => {
    const handleScrollToBottom = vi.fn()
    const { useTerminalSetup } = await import('../hooks/useTerminalSetup')
    vi.mocked(useTerminalSetup).mockReturnValue({
      terminalRef: { current: null },
      ptyIdRef: { current: 'pty-123' },
      showScrollButton: true,
      handleScrollToBottom,
    })
    render(<Terminal sessionId="session-1" cwd="/tmp/test" />)
    fireEvent.click(screen.getByText(/Go to End/))
    expect(handleScrollToBottom).toHaveBeenCalled()
  })

  it('shows context menu with copy and paste options', async () => {
    vi.mocked(window.menu.popup).mockResolvedValue(null)
    render(<Terminal sessionId="session-1" cwd="/tmp/test" />)
    const terminalDiv = document.querySelector('.h-full.w-full.p-2')!
    fireEvent.contextMenu(terminalDiv)
    expect(window.menu.popup).toHaveBeenCalled()
    const menuItems = vi.mocked(window.menu.popup).mock.calls[0][0]
    expect(menuItems.some((item: { id: string }) => item.id === 'copy')).toBe(true)
    expect(menuItems.some((item: { id: string }) => item.id === 'paste')).toBe(true)
  })

  it('includes restart option in context menu for agent terminals', async () => {
    vi.mocked(window.menu.popup).mockResolvedValue(null)
    render(<Terminal sessionId="session-1" cwd="/tmp/test" isAgentTerminal={true} />)
    const terminalDiv = document.querySelector('.h-full.w-full.p-2')!
    fireEvent.contextMenu(terminalDiv)
    const menuItems = vi.mocked(window.menu.popup).mock.calls[0][0]
    expect(menuItems.some((item: { id: string }) => item.id === 'restart-agent')).toBe(true)
  })

  it('does not include restart option for non-agent terminals', async () => {
    vi.mocked(window.menu.popup).mockResolvedValue(null)
    render(<Terminal sessionId="session-1" cwd="/tmp/test" isAgentTerminal={false} />)
    const terminalDiv = document.querySelector('.h-full.w-full.p-2')!
    fireEvent.contextMenu(terminalDiv)
    const menuItems = vi.mocked(window.menu.popup).mock.calls[0][0]
    expect(menuItems.some((item: { id: string }) => item.id === 'restart-agent')).toBe(false)
  })

  it('passes config to useTerminalSetup', async () => {
    const { useTerminalSetup } = await import('../hooks/useTerminalSetup')
    render(
      <Terminal
        sessionId="session-1"
        cwd="/tmp/test"
        command="echo hello"
        isAgentTerminal={true}
        isActive={true}
      />
    )
    expect(useTerminalSetup).toHaveBeenCalled()
    const config = vi.mocked(useTerminalSetup).mock.calls[0][0]
    expect(config.sessionId).toBe('session-1')
    expect(config.cwd).toBe('/tmp/test')
    expect(config.command).toBe('echo hello')
    expect(config.isAgentTerminal).toBe(true)
    expect(config.isActive).toBe(true)
  })
})
