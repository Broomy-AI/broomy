/**
 * Vitest setup file that mocks all Electron preload APIs on the window object.
 *
 * Every IPC channel exposed by the preload script (config, git, gh, fs, pty, etc.)
 * is replaced with a Vitest mock that returns sensible defaults. The file detects
 * whether it's running in a DOM environment (jsdom/happy-dom) or plain Node: in DOM
 * mode it extends the existing window object, in Node mode it creates a minimal
 * window mock with location, navigator, and event listener stubs.
 *
 * Each mock is type-checked against the real API type using `satisfies`.
 * If the preload type changes (e.g. a sync property becomes an async function),
 * TypeScript will flag the mismatch here at compile time.
 */
import { vi, type Mock } from 'vitest'
import type { PtyApi } from '../preload/apis/pty'
import type { FsApi } from '../preload/apis/fs'
import type { GitApi } from '../preload/apis/git'
import type { GhApi } from '../preload/apis/gh'
import type { ConfigApi, ProfilesApi, AgentsApi, ReposApi } from '../preload/apis/config'
import type { ShellApi, DialogApi, AppApi } from '../preload/apis/shell'
import type { MenuApi, TsApi } from '../preload/apis/menu'

/** Maps every key of an API type to a Vitest Mock — catches missing/extra keys and non-function values. */
type Mocked<T> = { [K in keyof T]: Mock }

// Mock window.config
const mockConfig: Mocked<ConfigApi> = {
  load: vi.fn().mockResolvedValue({ agents: [], sessions: [], repos: [] }),
  save: vi.fn().mockResolvedValue({ success: true }),
}

// Mock window.git
const mockGit: Mocked<GitApi> = {
  isInstalled: vi.fn().mockResolvedValue(true),
  getBranch: vi.fn().mockResolvedValue('main'),
  isGitRepo: vi.fn().mockResolvedValue(true),
  status: vi.fn().mockResolvedValue({ files: [], ahead: 0, behind: 0, tracking: null, current: 'main' }),
  diff: vi.fn().mockResolvedValue(''),
  show: vi.fn().mockResolvedValue(''),
  stage: vi.fn().mockResolvedValue({ success: true }),
  stageAll: vi.fn().mockResolvedValue({ success: true }),
  unstage: vi.fn().mockResolvedValue({ success: true }),
  checkoutFile: vi.fn().mockResolvedValue({ success: true }),
  commit: vi.fn().mockResolvedValue({ success: true }),
  push: vi.fn().mockResolvedValue({ success: true }),
  pull: vi.fn().mockResolvedValue({ success: true }),
  clone: vi.fn().mockResolvedValue({ success: true }),
  worktreeAdd: vi.fn().mockResolvedValue({ success: true }),
  worktreeList: vi.fn().mockResolvedValue([]),
  worktreeRemove: vi.fn().mockResolvedValue({ success: true }),
  deleteBranch: vi.fn().mockResolvedValue({ success: true }),
  pushNewBranch: vi.fn().mockResolvedValue({ success: true }),
  defaultBranch: vi.fn().mockResolvedValue('main'),
  remoteUrl: vi.fn().mockResolvedValue(null),
  branchChanges: vi.fn().mockResolvedValue({ files: [], baseBranch: 'main', mergeBase: 'abc1234' }),
  branchCommits: vi.fn().mockResolvedValue({ commits: [], baseBranch: 'main' }),
  commitFiles: vi.fn().mockResolvedValue([]),
  headCommit: vi.fn().mockResolvedValue(null),
  listBranches: vi.fn().mockResolvedValue([]),
  fetchBranch: vi.fn().mockResolvedValue({ success: true }),
  fetchPrHead: vi.fn().mockResolvedValue({ success: true }),
  pullPrBranch: vi.fn().mockResolvedValue({ success: true }),
  isMergedInto: vi.fn().mockResolvedValue(false),
  hasBranchCommits: vi.fn().mockResolvedValue(false),
  pullOriginMain: vi.fn().mockResolvedValue({ success: true }),
  isBehindMain: vi.fn().mockResolvedValue({ behind: 0, defaultBranch: 'main' }),
  getConfig: vi.fn().mockResolvedValue(null),
  setConfig: vi.fn().mockResolvedValue({ success: true }),
}

// Mock window.app
const mockApp: Mocked<AppApi> = {
  isDev: vi.fn().mockResolvedValue(false),
  homedir: vi.fn().mockResolvedValue('/Users/test'),
  platform: vi.fn().mockResolvedValue('darwin'),
  tmpdir: vi.fn().mockResolvedValue('/tmp'),
}

// Mock window.profiles
const mockProfiles: Mocked<ProfilesApi> = {
  list: vi.fn().mockResolvedValue({ profiles: [], lastProfileId: 'default' }),
  save: vi.fn().mockResolvedValue({ success: true }),
  openWindow: vi.fn().mockResolvedValue({ success: true, alreadyOpen: false }),
  getOpenProfiles: vi.fn().mockResolvedValue([]),
}

// Mock window.gh
const mockGh: Mocked<GhApi> = {
  isInstalled: vi.fn().mockResolvedValue(true),
  issues: vi.fn().mockResolvedValue([]),
  repoSlug: vi.fn().mockResolvedValue(null),
  prStatus: vi.fn().mockResolvedValue(null),
  hasWriteAccess: vi.fn().mockResolvedValue(false),
  mergeBranchToMain: vi.fn().mockResolvedValue({ success: true }),
  getPrCreateUrl: vi.fn().mockResolvedValue(null),
  prComments: vi.fn().mockResolvedValue([]),
  replyToComment: vi.fn().mockResolvedValue({ success: true }),
  prsToReview: vi.fn().mockResolvedValue([]),
  submitDraftReview: vi.fn().mockResolvedValue({ success: true }),
}

// Mock window.shell
const mockShell: Mocked<ShellApi> = {
  exec: vi.fn().mockResolvedValue({ success: true, stdout: '', stderr: '', exitCode: 0 }),
  openExternal: vi.fn().mockResolvedValue(undefined),
}

// Mock window.repos
const mockRepos: Mocked<ReposApi> = {
  getInitScript: vi.fn().mockResolvedValue(''),
  saveInitScript: vi.fn().mockResolvedValue({ success: true }),
}

// Mock window.ts
const mockTs: Mocked<TsApi> = {
  getProjectContext: vi.fn().mockResolvedValue({
    projectRoot: '/tmp/test-project',
    compilerOptions: {},
    files: [],
  }),
}

// Mock window.agents
const mockAgents: Mocked<AgentsApi> = {
  isInstalled: vi.fn().mockResolvedValue(true),
}

// Mock window.menu
const mockMenu: Mocked<MenuApi> = {
  popup: vi.fn().mockResolvedValue(null),
}

// Mock window.fs
const mockFs: Mocked<FsApi> = {
  readDir: vi.fn().mockResolvedValue([]),
  readFile: vi.fn().mockResolvedValue(''),
  writeFile: vi.fn().mockResolvedValue({ success: true }),
  appendFile: vi.fn().mockResolvedValue({ success: true }),
  readFileBase64: vi.fn().mockResolvedValue(''),
  exists: vi.fn().mockResolvedValue(true),
  mkdir: vi.fn().mockResolvedValue({ success: true }),
  rm: vi.fn().mockResolvedValue({ success: true }),
  createFile: vi.fn().mockResolvedValue({ success: true }),
  search: vi.fn().mockResolvedValue([]),
  watch: vi.fn().mockResolvedValue({ success: true }),
  unwatch: vi.fn().mockResolvedValue({ success: true }),
  onChange: vi.fn().mockReturnValue(() => {}),
}

// Mock window.pty
const mockPty: Mocked<PtyApi> = {
  create: vi.fn().mockResolvedValue(undefined),
  write: vi.fn().mockResolvedValue(undefined),
  resize: vi.fn().mockResolvedValue(undefined),
  kill: vi.fn().mockResolvedValue(undefined),
  onData: vi.fn().mockReturnValue(() => {}),
  onExit: vi.fn().mockReturnValue(() => {}),
}

// Mock window.dialog
const mockDialog: Mocked<DialogApi> = {
  openFolder: vi.fn().mockResolvedValue(null),
}

// All Broomy-specific mocks to attach to window
const broomyMocks = {
  config: mockConfig,
  git: mockGit,
  app: mockApp,
  profiles: mockProfiles,
  gh: mockGh,
  shell: mockShell,
  repos: mockRepos,
  agents: mockAgents,
  menu: mockMenu,
  ts: mockTs,
  fs: mockFs,
  pty: mockPty,
  dialog: mockDialog,
}

// If running in a DOM environment (jsdom/happy-dom), extend the existing window.
// If running in node environment, create a minimal window mock.
if (typeof globalThis.window !== 'undefined' && typeof globalThis.document !== 'undefined') {
  // DOM environment — add Broomy APIs to the existing window
  Object.assign(globalThis.window, broomyMocks)
  // Always mock confirm so tests get a predictable stub
  ;(globalThis.window as unknown as Record<string, unknown>).confirm = vi.fn().mockReturnValue(true)
} else {
  // Node environment — create a minimal window object
  Object.defineProperty(globalThis, 'window', {
    value: {
      ...broomyMocks,
      location: {
        search: '',
        href: 'http://localhost',
        origin: 'http://localhost',
        protocol: 'http:',
        host: 'localhost',
        hostname: 'localhost',
        port: '',
        pathname: '/',
        hash: '',
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      navigator: { platform: 'MacIntel', clipboard: { writeText: vi.fn() } },
      confirm: vi.fn().mockReturnValue(true),
    },
    writable: true,
  })
}
