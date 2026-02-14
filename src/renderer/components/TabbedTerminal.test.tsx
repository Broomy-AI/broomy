// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../test/react-setup'
import TabbedTerminal from './TabbedTerminal'
import { useSessionStore } from '../store/sessions'

// Mock Terminal component to avoid xterm.js issues in jsdom
vi.mock('./Terminal', () => ({
  default: (props: { sessionId: string; cwd: string }) => (
    <div data-testid={`terminal-${props.sessionId}`}>Terminal: {props.cwd}</div>
  ),
}))

// Mock TerminalTabBar with simplified rendering
vi.mock('./TerminalTabBar', () => ({
  default: (props: {
    tabs: Array<{ id: string; name: string }>
    activeTabId: string | null
    handleTabClick: (tabId: string) => void
    handleCloseTab: (e: React.MouseEvent, tabId: string) => void
    handleAddTab: () => void
    handleDoubleClick: (tabId: string) => void
  }) => (
    <div data-testid="tab-bar">
      {props.tabs.map((tab) => (
        <button
          key={tab.id}
          data-testid={`tab-${tab.id}`}
          onClick={() => props.handleTabClick(tab.id)}
          className={tab.id === props.activeTabId ? 'active' : ''}
        >
          {tab.name}
          <span
            data-testid={`close-${tab.id}`}
            onClick={(e) => props.handleCloseTab(e as unknown as React.MouseEvent, tab.id)}
          />
        </button>
      ))}
      <button data-testid="add-tab" onClick={props.handleAddTab}>+</button>
      <button data-testid="dblclick-first" onClick={() => props.tabs.length && props.handleDoubleClick(props.tabs[0].id)} />
    </div>
  ),
}))

afterEach(() => {
  cleanup()
})

const tab1Id = 'tab-1'
const tab2Id = 'tab-2'

beforeEach(() => {
  vi.clearAllMocks()
  // Set up a session with terminal tabs
  useSessionStore.setState({
    sessions: [
      {
        id: 'session-1',
        name: 'Test Session',
        directory: '/tmp/test',
        branch: 'main',
        status: 'idle' as const,
        agentId: null,
        panelVisibility: {},
        showAgentTerminal: true,
        showUserTerminal: true,
        showExplorer: true,
        showFileViewer: false,
        showDiff: false,
        selectedFilePath: null,
        planFilePath: null,
        fileViewerPosition: 'top' as const,
        layoutSizes: {
          explorerWidth: 256,
          fileViewerSize: 300,
          userTerminalHeight: 192,
          diffPanelWidth: 320,
          reviewPanelWidth: 320,
          tutorialPanelWidth: 320,
        },
        explorerFilter: 'files' as const,
        lastMessage: null,
        lastMessageTime: null,
        isUnread: false,
        workingStartTime: null,
        recentFiles: [],
        terminalTabs: {
          tabs: [
            { id: tab1Id, name: 'Terminal 1' },
            { id: tab2Id, name: 'Terminal 2' },
          ],
          activeTabId: tab1Id,
        },
        branchStatus: { type: 'unknown' },
        isArchived: false,
      },
    ],
  })
})

describe('TabbedTerminal', () => {
  it('renders tab bar and terminal for active tab', () => {
    render(
      <TabbedTerminal sessionId="session-1" cwd="/tmp/test" isActive={true} />
    )
    expect(screen.getByTestId('tab-bar')).toBeTruthy()
    expect(screen.getByText('Terminal 1')).toBeTruthy()
    expect(screen.getByText('Terminal 2')).toBeTruthy()
  })

  it('renders a Terminal for each tab', () => {
    render(
      <TabbedTerminal sessionId="session-1" cwd="/tmp/test" isActive={true} />
    )
    expect(screen.getByTestId(`terminal-user-session-1-${tab1Id}`)).toBeTruthy()
    expect(screen.getByTestId(`terminal-user-session-1-${tab2Id}`)).toBeTruthy()
  })

  it('calls setActiveTerminalTab when a tab is clicked', () => {
    const setActiveTerminalTab = vi.fn()
    useSessionStore.setState({ setActiveTerminalTab } as unknown as Record<string, unknown>)
    render(
      <TabbedTerminal sessionId="session-1" cwd="/tmp/test" isActive={true} />
    )
    fireEvent.click(screen.getByTestId(`tab-${tab2Id}`))
    expect(setActiveTerminalTab).toHaveBeenCalledWith('session-1', tab2Id)
  })

  it('calls addTerminalTab when add button is clicked', () => {
    const addTerminalTab = vi.fn()
    useSessionStore.setState({ addTerminalTab } as unknown as Record<string, unknown>)
    render(
      <TabbedTerminal sessionId="session-1" cwd="/tmp/test" isActive={true} />
    )
    fireEvent.click(screen.getByTestId('add-tab'))
    expect(addTerminalTab).toHaveBeenCalledWith('session-1')
  })

  it('calls removeTerminalTab when close button is clicked', () => {
    const removeTerminalTab = vi.fn()
    useSessionStore.setState({ removeTerminalTab } as unknown as Record<string, unknown>)
    render(
      <TabbedTerminal sessionId="session-1" cwd="/tmp/test" isActive={true} />
    )
    fireEvent.click(screen.getByTestId(`close-${tab1Id}`))
    expect(removeTerminalTab).toHaveBeenCalledWith('session-1', tab1Id)
  })

  it('handles missing session gracefully', () => {
    useSessionStore.setState({ sessions: [] })
    const { container } = render(
      <TabbedTerminal sessionId="nonexistent" cwd="/tmp/test" isActive={true} />
    )
    expect(container.querySelector('[data-testid="tab-bar"]')).toBeTruthy()
  })
})
