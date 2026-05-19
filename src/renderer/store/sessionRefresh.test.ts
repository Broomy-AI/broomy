// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useSessionStore, type StatusChip } from './sessions'
import { useRepoStore } from './repos'
import { PANEL_IDS, DEFAULT_TOOLBAR_PANELS } from '../panels/system/types'
import { setLoadedCounts } from './configPersistence'
import type { GitStatusResult } from '../../preload/index'

function makeGitStatus(overrides: Partial<GitStatusResult> = {}): GitStatusResult {
  return {
    files: [],
    ahead: 0,
    behind: 0,
    tracking: null,
    current: 'feature/test',
    isMerging: false,
    hasConflicts: false,
    ...overrides,
  }
}

function baseSession(id = 's1') {
  return {
    id,
    name: 'test',
    directory: '/test',
    branch: 'feature/test',
    status: 'idle' as const,
    agentId: null,
    repoId: 'repo-1',
    panelVisibility: {},
    showExplorer: false,
    showFileViewer: false,
    showDiff: false,
    selectedFilePath: null,
    planFilePath: null,
    fileViewerPosition: 'top' as const,
    layoutSizes: { explorerWidth: 256, fileViewerSize: 300, userTerminalHeight: 192, diffPanelWidth: 320, tutorialPanelWidth: 320 },
    explorerFilter: 'files' as const,
    lastMessage: null,
    lastMessageTime: null,
    isUnread: false,
    workingStartTime: null,
    recentFiles: [],
    searchHistory: [],
    terminalTabs: { tabs: [{ id: 'tab-1', name: 'Terminal' }], activeTabId: 'tab-1' },
    branchStatus: 'in-progress' as const,
    hasFeedback: false,
    checksStatus: 'none' as const,
    statusChip: 'in-progress' as StatusChip,
    isArchived: false,
    isRestored: false,
  }
}

describe('refreshSession', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setLoadedCounts({ sessions: 0, agents: 0, repos: 0 })
    useSessionStore.setState({
      sessions: [],
      activeSessionId: null,
      isLoading: false,
      showSidebar: true,
      showSettings: false,
      sidebarWidth: 224,
      toolbarPanels: [...DEFAULT_TOOLBAR_PANELS],
      globalPanelVisibility: {
        [PANEL_IDS.SIDEBAR]: true,
        [PANEL_IDS.SETTINGS]: false,
      },
    })
    useRepoStore.setState({
      repos: [{ id: 'repo-1', name: 'test', rootDir: '/test', remoteUrl: '', defaultBranch: 'main' }],
    } as never)
    vi.clearAllMocks()
    vi.mocked(window.git.status).mockResolvedValue(makeGitStatus())
    vi.mocked(window.git.isMergedInto).mockResolvedValue(false)
    vi.mocked(window.git.hasBranchCommits).mockResolvedValue(false)
    vi.mocked(window.gh.prStatus).mockResolvedValue(null)
    vi.mocked(window.gh.prChecksStatus).mockResolvedValue('none')
    vi.mocked(window.gh.prFeedbackStatus).mockResolvedValue(false)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does nothing for initializing sessions', async () => {
    useSessionStore.setState({ sessions: [{ ...baseSession(), status: 'initializing' }] })
    await useSessionStore.getState().refreshSession('s1')
    expect(window.git.status).not.toHaveBeenCalled()
  })

  it('does nothing for non-existent sessions', async () => {
    await useSessionStore.getState().refreshSession('nonexistent')
    expect(window.git.status).not.toHaveBeenCalled()
  })

  it('writes gitStatus, branchStatus, and statusChip atomically', async () => {
    useSessionStore.setState({ sessions: [baseSession()] })
    const gitStatus = makeGitStatus({
      files: [{ path: 'a.ts', status: 'modified', staged: false, indexStatus: ' ', workingDirStatus: 'M' }],
      ahead: 1,
      tracking: 'origin/feature/test',
      current: 'feature/test',
    })
    vi.mocked(window.git.status).mockResolvedValue(gitStatus)

    await useSessionStore.getState().refreshSession('s1')

    const session = useSessionStore.getState().sessions[0]
    expect(session.gitStatus).toEqual(gitStatus)
    expect(session.branchStatus).toBe('in-progress')
    expect(session.statusChip).toBe('in-progress')
    expect(session.hasHadCommits).toBe(true)
  })

  it('does not fetch PR data when includePr is false', async () => {
    useSessionStore.setState({ sessions: [baseSession()] })
    await useSessionStore.getState().refreshSession('s1')
    expect(window.gh.prStatus).not.toHaveBeenCalled()
  })

  it('fetches and persists PR state when includePr is true', async () => {
    useSessionStore.setState({ sessions: [baseSession()] })
    vi.mocked(window.gh.prStatus).mockResolvedValue({
      number: 42,
      title: 'Test PR',
      state: 'OPEN',
      url: 'https://github.com/pr/42',
      headRefName: 'feature/test',
      baseRefName: 'main',
    })
    vi.mocked(window.gh.prChecksStatus).mockResolvedValue('failed')
    vi.mocked(window.gh.prFeedbackStatus).mockResolvedValue(true)

    await useSessionStore.getState().refreshSession('s1', { includePr: true })

    const session = useSessionStore.getState().sessions[0]
    expect(session.lastKnownPrState).toBe('OPEN')
    expect(session.lastKnownPrNumber).toBe(42)
    expect(session.lastKnownPrUrl).toBe('https://github.com/pr/42')
    expect(session.hasFeedback).toBe(true)
    expect(session.checksStatus).toBe('failed')
    expect(session.statusChip).toBe('feedback')
  })

  it('resets PR lifecycle when branch has new work after a merged PR', async () => {
    useSessionStore.setState({
      sessions: [{
        ...baseSession(),
        lastKnownPrState: 'MERGED',
        lastKnownPrNumber: 10,
        lastKnownPrUrl: 'https://github.com/pr/10',
        hasHadCommits: true,
      }],
    })
    vi.mocked(window.git.status).mockResolvedValue(makeGitStatus({
      ahead: 2,
      tracking: 'origin/feature/test',
      current: 'feature/test',
    }))

    await useSessionStore.getState().refreshSession('s1')

    const session = useSessionStore.getState().sessions[0]
    expect(session.lastKnownPrState).toBeUndefined()
    expect(session.lastKnownPrNumber).toBeUndefined()
    expect(session.lastKnownPrUrl).toBeUndefined()
  })

  it('detects branch switch and clears PR state', async () => {
    useSessionStore.setState({
      sessions: [{
        ...baseSession(),
        lastKnownPrState: 'OPEN',
        lastKnownPrNumber: 42,
        hasHadCommits: true,
      }],
    })
    vi.mocked(window.git.status).mockResolvedValue(makeGitStatus({ current: 'feature/other' }))

    await useSessionStore.getState().refreshSession('s1')

    const session = useSessionStore.getState().sessions[0]
    expect(session.branch).toBe('feature/other')
    expect(session.lastKnownPrState).toBeUndefined()
    expect(session.hasHadCommits).toBe(false)
  })

  it('does not re-check merge for main branch', async () => {
    useSessionStore.setState({ sessions: [{ ...baseSession(), branch: 'main' }] })
    vi.mocked(window.git.status).mockResolvedValue(makeGitStatus({ current: 'main' }))

    await useSessionStore.getState().refreshSession('s1')

    expect(window.git.isMergedInto).not.toHaveBeenCalled()
    expect(useSessionStore.getState().sessions[0].branchStatus).toBe('in-progress')
  })

  it('swallows git errors without writing', async () => {
    useSessionStore.setState({ sessions: [baseSession()] })
    vi.mocked(window.git.status).mockRejectedValue(new Error('git fail'))

    await useSessionStore.getState().refreshSession('s1')

    const session = useSessionStore.getState().sessions[0]
    expect(session.branchStatus).toBe('in-progress')  // unchanged
    expect(session.gitStatus).toBeUndefined()
  })

  it('leaves PR state untouched on gh failure (retains previous value)', async () => {
    useSessionStore.setState({
      sessions: [{ ...baseSession(), lastKnownPrState: 'OPEN', lastKnownPrNumber: 99 }],
    })
    vi.mocked(window.gh.prStatus).mockRejectedValue(new Error('gh fail'))

    await useSessionStore.getState().refreshSession('s1', { includePr: true })

    const session = useSessionStore.getState().sessions[0]
    expect(session.lastKnownPrState).toBe('OPEN')
    expect(session.lastKnownPrNumber).toBe(99)
  })
})
