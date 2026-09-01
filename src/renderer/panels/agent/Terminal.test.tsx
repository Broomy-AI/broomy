// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../../test/react-setup'
import Terminal from './Terminal'
import type { TerminalSetupResult } from './hooks/useTerminalSetup'
import { FILE_PATH_MIME } from '../../../shared/dnd'
import { useSessionStore } from '../../store/sessions'

// Mock the useTerminalSetup hook to avoid xterm.js issues in jsdom
vi.mock('./hooks/useTerminalSetup', () => ({
  useTerminalSetup: vi.fn(),
}))

// Mock the xterm CSS import
vi.mock('@xterm/xterm/css/xterm.css', () => ({}))

// Mock agentInstallUrls
vi.mock('../shared/utils/agentInstallUrls', () => ({
  getAgentInstallUrl: (cmd: string) => {
    if (cmd === 'claude') return 'https://docs.anthropic.com/en/docs/claude-code/overview'
    return null
  },
}))

/** Build a full useTerminalSetup return value with sensible defaults for the mock. */
function makeSetup(overrides: Partial<TerminalSetupResult> = {}): TerminalSetupResult {
  return {
    terminalRef: { current: null },
    ptyIdRef: { current: 'pty-123' },
    shellKindRef: { current: 'posix' },
    isActiveRef: { current: false },
    showScrollButton: false,
    handleScrollToBottom: vi.fn(),
    exitInfo: null,
    ...overrides,
  }
}

/** Minimal DataTransfer stand-in for jsdom drag/drop events. */
function dropData(init: { types: string[]; files?: { path: string }[]; mime?: Record<string, string> }): DataTransfer {
  return {
    types: init.types,
    files: init.files ?? [],
    dropEffect: 'none',
    getData: (t: string) => init.mime?.[t] ?? '',
  } as unknown as DataTransfer
}

async function setSetup(overrides: Partial<TerminalSetupResult> = {}) {
  const { useTerminalSetup } = await import('./hooks/useTerminalSetup')
  vi.mocked(useTerminalSetup).mockReturnValue(makeSetup(overrides))
}

afterEach(() => {
  cleanup()
})

beforeEach(async () => {
  vi.clearAllMocks()
  await setSetup()
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
    expect(container.querySelector('.h-full.w-full.flex.flex-col')).toBeTruthy()
  })

  it('does not show scroll button when showScrollButton is false', () => {
    render(<Terminal sessionId="session-1" cwd="/tmp/test" />)
    expect(screen.queryByText(/Go to End/)).toBeNull()
  })

  it('shows scroll button when showScrollButton is true', async () => {
    await setSetup({ showScrollButton: true })
    render(<Terminal sessionId="session-1" cwd="/tmp/test" />)
    expect(screen.getByText(/Go to End/)).toBeTruthy()
  })

  it('calls handleScrollToBottom when scroll button is clicked', async () => {
    const handleScrollToBottom = vi.fn()
    await setSetup({ showScrollButton: true, handleScrollToBottom })
    render(<Terminal sessionId="session-1" cwd="/tmp/test" />)
    fireEvent.click(screen.getByText(/Go to End/))
    expect(handleScrollToBottom).toHaveBeenCalled()
  })

  it('shows context menu with copy and paste options', async () => {
    vi.mocked(window.menu.popup).mockResolvedValue(null)
    render(<Terminal sessionId="session-1" cwd="/tmp/test" />)
    const terminalDiv = document.querySelector('.h-full.w-full.flex.flex-col')!
    fireEvent.contextMenu(terminalDiv)
    expect(window.menu.popup).toHaveBeenCalled()
    const menuItems = vi.mocked(window.menu.popup).mock.calls[0][0]
    expect(menuItems.some((item: { id: string }) => item.id === 'copy')).toBe(true)
    expect(menuItems.some((item: { id: string }) => item.id === 'paste')).toBe(true)
  })

  it('includes restart option in context menu for agent terminals', async () => {
    vi.mocked(window.menu.popup).mockResolvedValue(null)
    render(<Terminal sessionId="session-1" cwd="/tmp/test" isAgentTerminal={true} />)
    const terminalDiv = document.querySelector('.h-full.w-full.flex.flex-col')!
    fireEvent.contextMenu(terminalDiv)
    const menuItems = vi.mocked(window.menu.popup).mock.calls[0][0]
    expect(menuItems.some((item: { id: string }) => item.id === 'restart-agent')).toBe(true)
  })

  it('does not include restart option for non-agent terminals', async () => {
    vi.mocked(window.menu.popup).mockResolvedValue(null)
    render(<Terminal sessionId="session-1" cwd="/tmp/test" isAgentTerminal={false} />)
    const terminalDiv = document.querySelector('.h-full.w-full.flex.flex-col')!
    fireEvent.contextMenu(terminalDiv)
    const menuItems = vi.mocked(window.menu.popup).mock.calls[0][0]
    expect(menuItems.some((item: { id: string }) => item.id === 'restart-agent')).toBe(false)
  })

  it('passes config to useTerminalSetup', async () => {
    const { useTerminalSetup } = await import('./hooks/useTerminalSetup')
    render(
      <Terminal
        sessionId="session-1"
        cwd="/tmp/test"
        command="echo hello"
        isAgentTerminal={true}
      />
    )
    expect(useTerminalSetup).toHaveBeenCalled()
    const config = vi.mocked(useTerminalSetup).mock.calls[0][0]
    expect(config.sessionId).toBe('session-1')
    expect(config.cwd).toBe('/tmp/test')
    expect(config.command).toBe('echo hello')
    expect(config.isAgentTerminal).toBe(true)
  })

  it('does not show not-installed banner when agent is installed', () => {
    render(<Terminal sessionId="session-1" cwd="/tmp/test" command="claude" agentNotInstalled={false} />)
    expect(screen.queryByText(/is not installed/)).toBeNull()
  })

  it('shows not-installed banner when agentNotInstalled is true', () => {
    render(<Terminal sessionId="session-1" cwd="/tmp/test" command="claude" agentNotInstalled={true} />)
    expect(screen.getByText(/is not installed/)).toBeTruthy()
  })

  it('shows install link for known agent commands', () => {
    render(<Terminal sessionId="session-1" cwd="/tmp/test" command="claude" agentNotInstalled={true} />)
    const installButton = screen.getByText(/Install/)
    expect(installButton.tagName).toBe('BUTTON')
  })

  it('opens external URL when install link is clicked', () => {
    render(<Terminal sessionId="session-1" cwd="/tmp/test" command="claude" agentNotInstalled={true} />)
    fireEvent.click(screen.getByText(/Install/))
    expect(window.shell.openExternal).toHaveBeenCalledWith('https://docs.anthropic.com/en/docs/claude-code/overview')
  })

  it('shows fallback text for unknown agent commands', () => {
    render(<Terminal sessionId="session-1" cwd="/tmp/test" command="unknown-agent" agentNotInstalled={true} />)
    expect(screen.getByText(/Install it to use this agent/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Install/ })).toBeNull()
  })

  describe('context menu actions', () => {
    it('handles paste action from context menu', async () => {
      vi.mocked(window.menu.popup).mockResolvedValue('paste')
      Object.assign(navigator, { clipboard: { readText: vi.fn().mockResolvedValue('pasted text') } })
      render(<Terminal sessionId="session-1" cwd="/tmp/test" />)
      const terminalDiv = document.querySelector('.h-full.w-full.flex.flex-col')!
      fireEvent.contextMenu(terminalDiv)
      await vi.waitFor(() => {
        expect(window.pty.write).toHaveBeenCalledWith('pty-123', 'pasted text')
      })
    })

    it('handles restart-agent action from context menu', async () => {
      const { useTerminalSetup } = await import('./hooks/useTerminalSetup')
      vi.mocked(window.menu.popup).mockResolvedValue('restart-agent')
      render(<Terminal sessionId="session-1" cwd="/tmp/test" isAgentTerminal />)
      const terminalDiv = document.querySelector('.h-full.w-full.flex.flex-col')!
      fireEvent.contextMenu(terminalDiv)
      await vi.waitFor(() => {
        // restart increments restartKey, which triggers useTerminalSetup again
        expect(vi.mocked(useTerminalSetup).mock.calls.length).toBeGreaterThanOrEqual(2)
      })
    })

    it('pauses the session from the context menu', async () => {
      const pauseSession = vi.spyOn(useSessionStore.getState(), 'pauseSession')
      vi.mocked(window.menu.popup).mockResolvedValue('pause-session')
      render(<Terminal sessionId="session-1" cwd="/tmp/test" isAgentTerminal storeSessionId="sess-1" />)
      const terminalDiv = document.querySelector('.h-full.w-full.flex.flex-col')!
      fireEvent.contextMenu(terminalDiv)
      await vi.waitFor(() => {
        expect(pauseSession).toHaveBeenCalledWith('sess-1')
      })
    })

    it('handles copy action with selection', async () => {
      const mockGetSelection = vi.fn().mockReturnValue('selected text')
      const mockHasSelection = vi.fn().mockReturnValue(true)
      await setSetup({
        terminalRef: { current: { hasSelection: mockHasSelection, getSelection: mockGetSelection, selectAll: vi.fn() } as never },
      })
      vi.mocked(window.menu.popup).mockResolvedValue('copy')
      Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined), readText: vi.fn() } })
      render(<Terminal sessionId="session-1" cwd="/tmp/test" />)
      const terminalDiv = document.querySelector('.h-full.w-full.flex.flex-col')!
      fireEvent.contextMenu(terminalDiv)
      await vi.waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('selected text')
      })
    })

    it('handles context menu error gracefully', async () => {
      vi.mocked(window.menu.popup).mockRejectedValue(new Error('menu failed'))
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      render(<Terminal sessionId="session-1" cwd="/tmp/test" />)
      const terminalDiv = document.querySelector('.h-full.w-full.flex.flex-col')!
      fireEvent.contextMenu(terminalDiv)
      await vi.waitFor(() => {
        expect(warnSpy).toHaveBeenCalledWith('[Terminal] Context menu failed:', expect.any(Error))
      })
      warnSpy.mockRestore()
    })
  })

  describe('drag and drop', () => {
    const container = () => document.querySelector('.h-full.w-full.flex.flex-col')!

    it('writes the shell-quoted path when a Finder file is dropped', () => {
      render(<Terminal sessionId="session-1" cwd="/tmp/test" />)
      fireEvent.drop(container(), { dataTransfer: dropData({ types: ['Files'], files: [{ path: '/a/b c.txt' }] }) })
      expect(window.pty.write).toHaveBeenCalledWith('pty-123', "'/a/b c.txt' ")
    })

    it('writes the path from an explorer (FILE_PATH_MIME) drop', () => {
      render(<Terminal sessionId="session-1" cwd="/tmp/test" />)
      fireEvent.drop(container(), { dataTransfer: dropData({ types: [FILE_PATH_MIME], mime: { [FILE_PATH_MIME]: '/x/y.ts' } }) })
      expect(window.pty.write).toHaveBeenCalledWith('pty-123', '/x/y.ts ')
    })

    it('accepts a file dragover and sets a copy drop effect', () => {
      render(<Terminal sessionId="session-1" cwd="/tmp/test" />)
      const dt = dropData({ types: ['Files'] })
      const notPrevented = fireEvent.dragOver(container(), { dataTransfer: dt })
      expect(dt.dropEffect).toBe('copy')
      expect(notPrevented).toBe(false) // preventDefault was called → drop is allowed
    })

    it('ignores a tab-reorder (text/plain) drag — no accept, no write', () => {
      render(<Terminal sessionId="session-1" cwd="/tmp/test" />)
      const dt = dropData({ types: ['text/plain'], mime: { 'text/plain': 'tab-id' } })
      const notPrevented = fireEvent.dragOver(container(), { dataTransfer: dt })
      expect(dt.dropEffect).toBe('none') // untouched
      expect(notPrevented).toBe(true) // not prevented → browser handles it
      fireEvent.drop(container(), { dataTransfer: dt })
      expect(window.pty.write).not.toHaveBeenCalled()
    })

    it('prevents default but does not write when nothing extractable was dropped', () => {
      render(<Terminal sessionId="session-1" cwd="/tmp/test" />)
      // Accepted (types includes Files) but no files and no MIME → empty extraction.
      const notPrevented = fireEvent.drop(container(), { dataTransfer: dropData({ types: ['Files'], files: [] }) })
      expect(notPrevented).toBe(false) // still preventDefault (data-loss guard)
      expect(window.pty.write).not.toHaveBeenCalled()
    })

    it('does not write when the PTY id is not set', async () => {
      await setSetup({ ptyIdRef: { current: null } })
      render(<Terminal sessionId="session-1" cwd="/tmp/test" />)
      fireEvent.drop(container(), { dataTransfer: dropData({ types: ['Files'], files: [{ path: '/a.txt' }] }) })
      expect(window.pty.write).not.toHaveBeenCalled()
    })

    it('does not write while the shell kind is unknown (create in flight / restart)', async () => {
      await setSetup({ shellKindRef: { current: null } })
      render(<Terminal sessionId="session-1" cwd="/tmp/test" />)
      fireEvent.drop(container(), { dataTransfer: dropData({ types: ['Files'], files: [{ path: '/a.txt' }] }) })
      expect(window.pty.write).not.toHaveBeenCalled()
    })
  })

  describe('resume banner', () => {
    it('shows resume banner for restored agent with resume command', async () => {
      await setSetup()
      render(<Terminal sessionId="session-1" cwd="/tmp/test" isAgentTerminal isRestored />)
      expect(screen.getByText(/Resume your previous conversation/)).toBeTruthy()
    })

    it('focuses the terminal after clicking resume', async () => {
      const mockFocus = vi.fn()
      await setSetup({
        terminalRef: { current: { focus: mockFocus } as unknown as import('@xterm/xterm').Terminal },
        isActiveRef: { current: true },
      })

      const rAFs: FrameRequestCallback[] = []
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { rAFs.push(cb); return rAFs.length })

      render(<Terminal sessionId="session-1" cwd="/tmp/test" isAgentTerminal isRestored />)
      fireEvent.click(screen.getByText(/Run \/resume/))

      // Banner should be dismissed
      expect(screen.queryByText(/Resume your previous conversation/)).toBeNull()

      // Trigger the double-rAF chain to flush focus
      while (rAFs.length) rAFs.shift()!(0)

      expect(mockFocus).toHaveBeenCalled()
      vi.restoreAllMocks()
    })

    it('dismisses resume banner when close button is clicked', async () => {
      await setSetup()
      render(<Terminal sessionId="session-1" cwd="/tmp/test" isAgentTerminal isRestored />)
      fireEvent.click(screen.getByLabelText('Dismiss'))
      expect(screen.queryByText(/Resume your previous conversation/)).toBeNull()
    })
  })

  describe('exit error banner', () => {
    it('shows exit error banner when exitInfo is set', async () => {
      await setSetup({ exitInfo: { code: 137, message: 'Agent killed by Docker out-of-memory killer (SIGKILL)', detail: 'Some detail' } })
      render(<Terminal sessionId="session-1" cwd="/tmp/test" />)
      expect(screen.getByText(/out-of-memory killer/)).toBeTruthy()
    })

    it('does not show exit error banner when exitInfo is null', async () => {
      await setSetup({ exitInfo: null })
      render(<Terminal sessionId="session-1" cwd="/tmp/test" />)
      expect(screen.queryByText(/out-of-memory/)).toBeNull()
    })

    it('dismisses exit error banner when close button is clicked', async () => {
      await setSetup({ exitInfo: { code: 137, message: 'Process killed (SIGKILL)', detail: 'Some detail' } })
      render(<Terminal sessionId="session-1" cwd="/tmp/test" />)
      expect(screen.getByText(/SIGKILL/)).toBeTruthy()
      fireEvent.click(screen.getByLabelText('Dismiss'))
      expect(screen.queryByText(/SIGKILL/)).toBeNull()
    })

    it('does not open error detail modal when exitInfo has no detail', async () => {
      const { useErrorStore } = await import('../../store/errors')
      useErrorStore.setState({ detailError: null })
      await setSetup({ exitInfo: { code: 137, message: 'Process killed (SIGKILL)' } })
      render(<Terminal sessionId="session-1" cwd="/tmp/test" />)
      // Without detail, ExitErrorBanner is not shown — AgentExitBanner shows instead (no detail button)
      expect(screen.queryByLabelText('Dismiss')).toBeNull()
      const state = useErrorStore.getState()
      expect(state.detailError).toBeNull()
    })

    it('opens error detail modal when banner with detail is clicked', async () => {
      const { useErrorStore } = await import('../../store/errors')
      await setSetup({ exitInfo: { code: 137, message: 'Agent killed by OOM', detail: 'Docker Desktop runs all containers...' } })
      render(<Terminal sessionId="session-1" cwd="/tmp/test" />)
      fireEvent.click(screen.getByText(/Agent killed by OOM/))
      const state = useErrorStore.getState()
      expect(state.detailError).not.toBeNull()
      expect(state.detailError?.detail).toBe('Docker Desktop runs all containers...')
    })
  })
})
