// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { render } from '@testing-library/react'
import { usePanelsMap, type PanelsMapConfig } from './usePanelsMap'
import { PANEL_IDS } from '../panels'
import { type Session } from '../store/sessions'

// Mock all component imports — capture props for callback testing
let lastExplorerProps: Record<string, unknown> = {}
let lastFileViewerProps: Record<string, unknown> = {}
let lastAgentSettingsProps: Record<string, unknown> = {}

vi.mock('../components/Terminal', () => ({ default: () => null }))
vi.mock('../components/TabbedTerminal', () => ({ default: () => null }))
vi.mock('../components/explorer', () => ({ default: (props: Record<string, unknown>) => { lastExplorerProps = props; return null } }))
vi.mock('../components/FileViewer', () => ({ default: (props: Record<string, unknown>) => { lastFileViewerProps = props; return null } }))
vi.mock('../components/AgentSettings', () => ({ default: (props: Record<string, unknown>) => { lastAgentSettingsProps = props; return null } }))
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
      [PANEL_IDS.EXPLORER]: true,
      [PANEL_IDS.FILE_VIEWER]: false,
    },
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
      tutorialPanelWidth: 320,
    },
    explorerFilter: 'files',
    lastMessage: null,
    lastMessageTime: null,
    isUnread: false,
    workingStartTime: null,
    recentFiles: [],
    terminalTabs: { tabs: [{ id: 'tab-1', name: 'Terminal' }], activeTabId: 'tab-1' },
    branchStatus: 'in-progress' as const,
    isArchived: false,
    isRestored: false,
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
    registerSaveFunction: vi.fn(),
    unregisterSaveFunction: vi.fn(),
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
    getRepoIsolation: vi.fn().mockReturnValue(undefined),
    globalPanelVisibility: {
      [PANEL_IDS.SIDEBAR]: true,
      [PANEL_IDS.SETTINGS]: false,
    },
    toggleGlobalPanel: vi.fn(),
    selectFile: vi.fn(),
    setExplorerFilter: vi.fn(),
    updatePrState: vi.fn(),
    setPanelVisibility: vi.fn(),
    setToolbarPanels: vi.fn(),
    closeCommandsEditor: vi.fn(),
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
    expect(result.current).toHaveProperty('terminal')
    expect(result.current).toHaveProperty(PANEL_IDS.EXPLORER)
    expect(result.current).toHaveProperty(PANEL_IDS.FILE_VIEWER)
    expect(result.current).toHaveProperty(PANEL_IDS.SETTINGS)
    expect(result.current).toHaveProperty(PANEL_IDS.TUTORIAL)
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

  it('returns fileViewer container element (always mounted for per-session state)', () => {
    const session = makeSession({ showFileViewer: false })
    const config = makeConfig({ sessions: [session], activeSession: session })
    const { result } = renderHook(() => usePanelsMap(config))

    // File viewer panel now always returns a container when sessions exist
    expect(result.current[PANEL_IDS.FILE_VIEWER]).not.toBeNull()
  })

  it('returns fileViewer element when showFileViewer is true', () => {
    const session = makeSession({ showFileViewer: true })
    const config = makeConfig({ sessions: [session], activeSession: session })
    const { result } = renderHook(() => usePanelsMap(config))

    expect(result.current[PANEL_IDS.FILE_VIEWER]).not.toBeNull()
  })

  it('returns null for fileViewer when there are no sessions', () => {
    const config = makeConfig({ sessions: [], activeSessionId: null, activeSession: undefined })
    const { result } = renderHook(() => usePanelsMap(config))

    expect(result.current[PANEL_IDS.FILE_VIEWER]).toBeNull()
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

  it('memoizes panels map and returns stable reference when inputs are unchanged', () => {
    const config = makeConfig()
    const { result, rerender } = renderHook(() => usePanelsMap(config))

    const firstResult = result.current
    rerender()
    expect(result.current).toBe(firstResult)
  })

  it('shows WelcomeScreen in terminal panel when there are no sessions', () => {
    const config = makeConfig({ sessions: [], activeSessionId: null, activeSession: undefined })
    const { result } = renderHook(() => usePanelsMap(config))

    // The terminal panel should still be defined (not null)
    expect(result.current.terminal).not.toBeNull()
  })

  it('returns terminal panel element', () => {
    const config = makeConfig()
    const { result } = renderHook(() => usePanelsMap(config))

    expect(result.current.terminal).not.toBeNull()
  })

  it('renders file viewer with review context for review sessions', () => {
    const session = makeSession({
      showFileViewer: true,
      sessionType: 'review',
      selectedFilePath: '/test/file.ts',
    })
    const config = makeConfig({
      sessions: [session],
      activeSession: session,
      activeSessionId: 'session-1',
    })
    const { result } = renderHook(() => usePanelsMap(config))

    expect(result.current[PANEL_IDS.FILE_VIEWER]).not.toBeNull()
  })

  it('renders terminal panel for each session', () => {
    const session1 = makeSession({ id: 'session-1', name: 'S1' })
    const session2 = makeSession({ id: 'session-2', name: 'S2' })
    const config = makeConfig({
      sessions: [session1, session2],
      activeSessionId: 'session-1',
      activeSession: session1,
    })
    const { result } = renderHook(() => usePanelsMap(config))

    expect(result.current.terminal).not.toBeNull()
  })

  describe('explorer callbacks', () => {
    function renderExplorer(configOverrides: Partial<PanelsMapConfig> = {}) {
      const session = makeSession({ showExplorer: true })
      const config = makeConfig({ sessions: [session], activeSession: session, ...configOverrides })
      const { result } = renderHook(() => usePanelsMap(config))
      // Render the explorer element to trigger mock and capture props
      const explorerElement = result.current[PANEL_IDS.EXPLORER]
      if (explorerElement) render(explorerElement as React.ReactElement)
      return { config, lastExplorerProps }
    }

    it('onFilterChange calls setExplorerFilter with active session id', () => {
      const setExplorerFilter = vi.fn()
      const { lastExplorerProps: props } = renderExplorer({ setExplorerFilter })
      const onFilterChange = props.onFilterChange as (filter: string) => void
      onFilterChange('source-control')
      expect(setExplorerFilter).toHaveBeenCalledWith('session-1', 'source-control')
    })

    it('onUpdatePrState calls updatePrState with active session id', () => {
      const updatePrState = vi.fn()
      const { lastExplorerProps: props } = renderExplorer({ updatePrState })
      const onUpdatePrState = props.onUpdatePrState as (state: string, num?: number, url?: string) => void
      onUpdatePrState('open', 42, 'https://github.com/org/repo/pull/42')
      expect(updatePrState).toHaveBeenCalledWith('session-1', 'open', 42, 'https://github.com/org/repo/pull/42')
    })

    it('passes session and repo props for review tab', () => {
      const repo = { id: 'repo-1', name: 'test-repo', path: '/test/repo', branches: [] }
      const session = makeSession({ showExplorer: true, repoId: 'repo-1' })
      const { lastExplorerProps: props } = renderExplorer({ repos: [repo as never], sessions: [session], activeSession: session })
      expect(props.session).toBe(session)
      expect(props.repo).toEqual(repo)
    })

    it('passes session with review explorerFilter for review sessions', () => {
      const session = makeSession({
        showExplorer: true,
        sessionType: 'review',
        explorerFilter: 'review',
      })
      const { lastExplorerProps: props } = renderExplorer({ sessions: [session], activeSession: session })
      expect(props.filter).toBe('review')
      expect(props.session).toBe(session)
    })
  })

  describe('fileViewer callbacks', () => {
    it('onOpenFile calls navigateToFile with correct args', () => {
      const navigateToFile = vi.fn()
      const session = makeSession({ showFileViewer: true })
      const config = makeConfig({ sessions: [session], activeSession: session, navigateToFile })
      const { result } = renderHook(() => usePanelsMap(config))
      const fvElement = result.current[PANEL_IDS.FILE_VIEWER]
      if (fvElement) render(fvElement as React.ReactElement)
      const onOpenFile = lastFileViewerProps.onOpenFile as (path: string, line?: number) => void
      onOpenFile('/test/other.ts', 42)
      expect(navigateToFile).toHaveBeenCalledWith({ filePath: '/test/other.ts', openInDiffMode: false, scrollToLine: 42 })
    })
  })

  describe('settings panel callbacks', () => {
    it('onClose calls toggleGlobalPanel', () => {
      const toggleGlobalPanel = vi.fn()
      const config = makeConfig({
        globalPanelVisibility: { [PANEL_IDS.SIDEBAR]: true, [PANEL_IDS.SETTINGS]: true },
        toggleGlobalPanel,
      })
      const { result } = renderHook(() => usePanelsMap(config))
      const settingsElement = result.current[PANEL_IDS.SETTINGS]
      if (settingsElement) render(settingsElement as React.ReactElement)
      const onClose = lastAgentSettingsProps.onClose as () => void
      onClose()
      expect(toggleGlobalPanel).toHaveBeenCalledWith(PANEL_IDS.SETTINGS)
    })
  })
})
