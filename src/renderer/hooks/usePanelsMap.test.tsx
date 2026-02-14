// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { usePanelsMap, type PanelsMapConfig } from './usePanelsMap'
import { PANEL_IDS } from '../panels'
import type { Session } from '../store/sessions'

// Mock all component imports to avoid rendering real components
vi.mock('../components/Terminal', () => ({ default: () => null }))
vi.mock('../components/TabbedTerminal', () => ({ default: () => null }))
vi.mock('../components/explorer', () => ({ default: () => null }))
vi.mock('../components/FileViewer', () => ({ default: () => null }))
vi.mock('../components/review', () => ({ default: () => null }))
vi.mock('../components/AgentSettings', () => ({ default: () => null }))
vi.mock('../components/SessionList', () => ({ default: () => null }))
vi.mock('../components/WelcomeScreen', () => ({ default: () => null }))
vi.mock('../components/TutorialPanel', () => ({ default: () => null }))

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    name: 'Test Session',
    directory: '/test/dir',
    branch: 'main',
    status: 'idle',
    agentId: null,
    panelVisibility: {
      [PANEL_IDS.AGENT_TERMINAL]: true,
      [PANEL_IDS.USER_TERMINAL]: true,
      [PANEL_IDS.EXPLORER]: true,
      [PANEL_IDS.FILE_VIEWER]: false,
    },
    showAgentTerminal: true,
    showUserTerminal: true,
    showExplorer: true,
    showFileViewer: false,
    showDiff: false,
    selectedFilePath: null,
    planFilePath: null,
    fileViewerPosition: 'top',
    layoutSizes: {
      explorerWidth: 256,
      fileViewerSize: 300,
      userTerminalHeight: 192,
      diffPanelWidth: 320,
      reviewPanelWidth: 320,
      tutorialPanelWidth: 320,
    },
    explorerFilter: 'files',
    lastMessage: null,
    lastMessageTime: null,
    isUnread: false,
    workingStartTime: null,
    recentFiles: [],
    terminalTabs: { tabs: [{ id: 'tab-1', name: 'Terminal' }], activeTabId: 'tab-1' },
    branchStatus: { status: 'unknown' },
    isArchived: false,
    ...overrides,
  }
}

function makeConfig(overrides: Partial<PanelsMapConfig> = {}): PanelsMapConfig {
  const session = makeSession()
  return {
    sessions: [session],
    activeSessionId: 'session-1',
    activeSession: session,
    activeSessionGitStatus: [],
    activeSessionGitStatusResult: null,
    selectedFileStatus: undefined,
    navigateToFile: vi.fn(),
    openFileInDiffMode: false,
    scrollToLine: undefined,
    searchHighlight: undefined,
    diffBaseRef: undefined,
    diffCurrentRef: undefined,
    diffLabel: undefined,
    setIsFileViewerDirty: vi.fn(),
    saveCurrentFileRef: { current: null },
    handleSelectSession: vi.fn(),
    handleNewSession: vi.fn(),
    removeSession: vi.fn(),
    refreshPrStatus: vi.fn().mockResolvedValue(undefined),
    archiveSession: vi.fn(),
    unarchiveSession: vi.fn(),
    handleToggleFileViewer: vi.fn(),
    handleFileViewerPositionChange: vi.fn(),
    fetchGitStatus: vi.fn(),
    getAgentCommand: vi.fn().mockReturnValue(undefined),
    getAgentEnv: vi.fn().mockReturnValue(undefined),
    globalPanelVisibility: {
      [PANEL_IDS.SIDEBAR]: true,
      [PANEL_IDS.SETTINGS]: false,
    },
    toggleGlobalPanel: vi.fn(),
    selectFile: vi.fn(),
    setExplorerFilter: vi.fn(),
    recordPushToMain: vi.fn(),
    clearPushToMain: vi.fn(),
    updatePrState: vi.fn(),
    setPanelVisibility: vi.fn(),
    setToolbarPanels: vi.fn(),
    repos: [],
    ...overrides,
  }
}

describe('usePanelsMap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(window.app.tmpdir).mockResolvedValue('/tmp')
  })

  it('returns a map with all expected panel IDs', () => {
    const config = makeConfig()
    const { result } = renderHook(() => usePanelsMap(config))

    expect(result.current).toHaveProperty(PANEL_IDS.SIDEBAR)
    expect(result.current).toHaveProperty(PANEL_IDS.AGENT_TERMINAL)
    expect(result.current).toHaveProperty(PANEL_IDS.USER_TERMINAL)
    expect(result.current).toHaveProperty(PANEL_IDS.EXPLORER)
    expect(result.current).toHaveProperty(PANEL_IDS.FILE_VIEWER)
    expect(result.current).toHaveProperty(PANEL_IDS.SETTINGS)
    expect(result.current).toHaveProperty(PANEL_IDS.TUTORIAL)
    expect(result.current).toHaveProperty(PANEL_IDS.REVIEW)
  })

  it('returns null for explorer when showExplorer is false', () => {
    const session = makeSession({ showExplorer: false })
    const config = makeConfig({ sessions: [session], activeSession: session })
    const { result } = renderHook(() => usePanelsMap(config))

    expect(result.current[PANEL_IDS.EXPLORER]).toBeNull()
  })

  it('returns explorer element when showExplorer is true', () => {
    const session = makeSession({ showExplorer: true })
    const config = makeConfig({ sessions: [session], activeSession: session })
    const { result } = renderHook(() => usePanelsMap(config))

    expect(result.current[PANEL_IDS.EXPLORER]).not.toBeNull()
  })

  it('returns null for fileViewer when showFileViewer is false', () => {
    const session = makeSession({ showFileViewer: false })
    const config = makeConfig({ sessions: [session], activeSession: session })
    const { result } = renderHook(() => usePanelsMap(config))

    expect(result.current[PANEL_IDS.FILE_VIEWER]).toBeNull()
  })

  it('returns fileViewer element when showFileViewer is true', () => {
    const session = makeSession({ showFileViewer: true })
    const config = makeConfig({ sessions: [session], activeSession: session })
    const { result } = renderHook(() => usePanelsMap(config))

    expect(result.current[PANEL_IDS.FILE_VIEWER]).not.toBeNull()
  })

  it('returns null for settings when globalPanelVisibility settings is false', () => {
    const config = makeConfig({
      globalPanelVisibility: { [PANEL_IDS.SIDEBAR]: true, [PANEL_IDS.SETTINGS]: false },
    })
    const { result } = renderHook(() => usePanelsMap(config))

    expect(result.current[PANEL_IDS.SETTINGS]).toBeNull()
  })

  it('returns settings element when globalPanelVisibility settings is true', () => {
    const config = makeConfig({
      globalPanelVisibility: { [PANEL_IDS.SIDEBAR]: true, [PANEL_IDS.SETTINGS]: true },
    })
    const { result } = renderHook(() => usePanelsMap(config))

    expect(result.current[PANEL_IDS.SETTINGS]).not.toBeNull()
  })

  it('returns null for review panel when no active session', () => {
    const config = makeConfig({ activeSession: undefined, activeSessionId: null })
    const { result } = renderHook(() => usePanelsMap(config))

    expect(result.current[PANEL_IDS.REVIEW]).toBeNull()
  })

  it('returns review element when activeSession exists', () => {
    const config = makeConfig()
    const { result } = renderHook(() => usePanelsMap(config))

    expect(result.current[PANEL_IDS.REVIEW]).not.toBeNull()
  })

  it('memoizes panels map and returns stable reference when inputs are unchanged', () => {
    const config = makeConfig()
    const { result, rerender } = renderHook(() => usePanelsMap(config))

    const firstResult = result.current
    rerender()
    expect(result.current).toBe(firstResult)
  })

  it('shows WelcomeScreen in agent terminal panel when there are no sessions', () => {
    const config = makeConfig({ sessions: [], activeSessionId: null, activeSession: undefined })
    const { result } = renderHook(() => usePanelsMap(config))

    // The agent terminal panel should still be defined (not null)
    expect(result.current[PANEL_IDS.AGENT_TERMINAL]).not.toBeNull()
  })

  it('renders agent terminal for each session', () => {
    const session1 = makeSession({ id: 'session-1', name: 'S1' })
    const session2 = makeSession({ id: 'session-2', name: 'S2' })
    const config = makeConfig({
      sessions: [session1, session2],
      activeSessionId: 'session-1',
      activeSession: session1,
    })
    const { result } = renderHook(() => usePanelsMap(config))

    expect(result.current[PANEL_IDS.AGENT_TERMINAL]).not.toBeNull()
    expect(result.current[PANEL_IDS.USER_TERMINAL]).not.toBeNull()
  })
})
