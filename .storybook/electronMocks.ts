/**
 * Browser-compatible mocks for all Electron preload APIs.
 * Mirrors src/test/setup.ts but uses plain functions instead of vi.fn().
 */

const noop = () => {}
const resolved = <T>(v: T) => () => Promise.resolve(v)
const noopResolved = () => Promise.resolve(undefined)
const successResolved = () => Promise.resolve({ success: true })
const unsubscribe = () => () => {}

export function installElectronMocks() {
  const w = window as Record<string, unknown>

  w.config = {
    load: resolved({ agents: [], sessions: [], repos: [] }),
    save: successResolved,
  }

  w.git = {
    isInstalled: resolved(true),
    getBranch: resolved('main'),
    isGitRepo: resolved(true),
    status: resolved({ files: [], ahead: 0, behind: 0, tracking: null, current: 'main', isMerging: false }),
    diff: resolved(''),
    show: resolved(''),
    showBase64: resolved(''),
    stage: successResolved,
    stageAll: successResolved,
    unstage: successResolved,
    checkoutFile: successResolved,
    commit: successResolved,
    commitMerge: successResolved,
    push: successResolved,
    pull: successResolved,
    clone: successResolved,
    worktreeAdd: successResolved,
    worktreeList: resolved([]),
    worktreeRemove: successResolved,
    deleteBranch: successResolved,
    pushNewBranch: successResolved,
    defaultBranch: resolved('main'),
    remoteUrl: resolved(null),
    branchChanges: resolved({ files: [], baseBranch: 'main', mergeBase: 'abc1234' }),
    branchCommits: resolved({ commits: [], baseBranch: 'main' }),
    commitFiles: resolved([]),
    headCommit: resolved(null),
    listBranches: resolved([]),
    fetchBranch: successResolved,
    fetchReviewPrHead: successResolved,
    syncReviewBranch: successResolved,
    isMergedInto: resolved(false),
    hasBranchCommits: resolved(false),
    pullOriginMain: successResolved,
    isBehindMain: resolved({ behind: 0, defaultBranch: 'main' }),
    getConfig: resolved(null),
    setConfig: successResolved,
    setGlobalConfig: successResolved,
  }

  w.app = {
    isDev: resolved(false),
    homedir: resolved('/Users/test'),
    platform: resolved('darwin'),
    tmpdir: resolved('/tmp'),
    getVersion: resolved('0.9.0'),
    getCrashLog: resolved(null),
    dismissCrashLog: noopResolved,
    getCrashReportUrl: resolved(null),
  }

  w.update = {
    checkForUpdates: resolved({ updateAvailable: false }),
    downloadUpdate: noopResolved,
    installUpdate: noop,
    onDownloadProgress: unsubscribe,
    onUpdateDownloaded: unsubscribe,
    onUpdateAvailable: unsubscribe,
  }

  w.profiles = {
    list: resolved({ profiles: [], lastProfileId: 'default' }),
    save: successResolved,
    openWindow: resolved({ success: true, alreadyOpen: false }),
    getOpenProfiles: resolved([]),
  }

  w.gh = {
    isInstalled: resolved(true),
    issues: resolved([]),
    searchIssues: resolved([]),
    repoSlug: resolved(null),
    prStatus: resolved(null),
    hasWriteAccess: resolved(false),
    prChecksStatus: resolved('none'),
    getPrCreateUrl: resolved(null),
    prComments: resolved([]),
    prDescription: resolved(null),
    prIssueComments: resolved([]),
    replyToComment: successResolved,
    addReaction: successResolved,
    prsToReview: resolved([]),
    submitDraftReview: successResolved,
    myReviewStatus: resolved('pending'),
    currentUser: resolved('test-user'),
  }

  w.shell = {
    exec: resolved({ success: true, stdout: '', stderr: '', exitCode: 0 }),
    openExternal: noopResolved,
    listShells: resolved([{ path: '/bin/bash', name: 'Bash', isDefault: true }]),
  }

  w.repos = {
    getInitScript: resolved(''),
    saveInitScript: successResolved,
  }

  w.ts = {
    getProjectContext: resolved({
      projectRoot: '/tmp/test-project',
      compilerOptions: {},
      files: [],
    }),
  }

  w.agents = {
    isInstalled: resolved(true),
  }

  w.help = {
    onHelpMenu: unsubscribe,
  }

  w.menu = {
    popup: resolved(null),
    appMenuPopup: resolved(null),
  }

  w.fs = {
    readDir: resolved([]),
    readFile: resolved(''),
    writeFile: successResolved,
    appendFile: successResolved,
    readFileBase64: resolved(''),
    exists: resolved(true),
    mkdir: successResolved,
    rm: successResolved,
    rename: successResolved,
    createFile: successResolved,
    search: resolved([]),
    watch: successResolved,
    unwatch: successResolved,
    onChange: unsubscribe,
  }

  w.pty = {
    create: noopResolved,
    write: noopResolved,
    resize: noopResolved,
    kill: noopResolved,
    onData: unsubscribe,
    onExit: unsubscribe,
    onDevcontainerReady: unsubscribe,
    onDevcontainerMissing: unsubscribe,
  }

  w.dialog = {
    openFolder: resolved(null),
  }

  w.devcontainer = {
    status: resolved({ available: true, version: '0.71.0' }),
    hasConfig: resolved(false),
    generateDefaultConfig: noopResolved,
    containerInfo: resolved(null),
    resetContainer: noopResolved,
  }

  w.windowControls = {
    minimize: noopResolved,
    maximize: noopResolved,
    close: noopResolved,
  }
}
