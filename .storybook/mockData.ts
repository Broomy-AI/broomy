import type { Session, TerminalTabsState, LayoutSizes, ExplorerFilter, SessionStatus, FileViewerPosition } from '../src/renderer/store/sessions'
import type { BranchStatus, PrState } from '../src/renderer/utils/branchStatus'

let counter = 0
function nextId(prefix: string) {
  return `${prefix}-${++counter}`
}

const DEFAULT_LAYOUT_SIZES: LayoutSizes = {
  explorerWidth: 260,
  fileViewerSize: 300,
  userTerminalHeight: 200,
  diffPanelWidth: 400,
  tutorialPanelWidth: 300,
}

const DEFAULT_TERMINAL_TABS: TerminalTabsState = {
  tabs: [{ id: 'agent', name: 'Agent' }],
  activeTabId: 'agent',
}

export function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: nextId('session'),
    name: 'Test Session',
    directory: '/Users/test/projects/my-app',
    branch: 'feature/test',
    status: 'idle' as SessionStatus,
    agentId: 'agent-1',
    panelVisibility: { explorer: true, fileViewer: false },
    showExplorer: true,
    showFileViewer: false,
    showDiff: false,
    selectedFilePath: null,
    planFilePath: null,
    fileViewerPosition: 'top' as FileViewerPosition,
    layoutSizes: { ...DEFAULT_LAYOUT_SIZES },
    explorerFilter: 'files' as ExplorerFilter,
    lastMessage: null,
    lastMessageTime: null,
    isUnread: false,
    workingStartTime: null,
    recentFiles: [],
    terminalTabs: { ...DEFAULT_TERMINAL_TABS },
    branchStatus: 'in-progress' as BranchStatus,
    isArchived: false,
    isRestored: false,
    ...overrides,
  }
}

export function makeAgent(overrides: Partial<{ id: string; name: string; command: string; color?: string; env?: Record<string, string> }> = {}) {
  return {
    id: nextId('agent'),
    name: 'Claude Code',
    command: 'claude',
    ...overrides,
  }
}

export function makeRepo(overrides: Partial<{ id: string; name: string; remoteUrl: string; rootDir: string; defaultBranch: string }> = {}) {
  return {
    id: nextId('repo'),
    name: 'my-app',
    remoteUrl: 'https://github.com/test/my-app.git',
    rootDir: '/Users/test/projects/my-app',
    defaultBranch: 'main',
    ...overrides,
  }
}

export function makeGitStatus(files: Array<{ path: string; index: string; working_dir: string }> = []) {
  return {
    files,
    ahead: 0,
    behind: 0,
    tracking: 'origin/main',
    current: 'feature/test',
    isMerging: false,
  }
}

export function makeBranchStatus(status: BranchStatus = 'in-progress'): BranchStatus {
  return status
}

export function makePrState(state: PrState = 'OPEN'): PrState {
  return state
}
