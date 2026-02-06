import { vi } from 'vitest'

// Mock window.config
const mockConfig = {
  load: vi.fn().mockResolvedValue({ agents: [], sessions: [], repos: [] }),
  save: vi.fn().mockResolvedValue({ success: true }),
}

// Mock window.git
const mockGit = {
  getBranch: vi.fn().mockResolvedValue('main'),
  isGitRepo: vi.fn().mockResolvedValue(true),
  status: vi.fn().mockResolvedValue({ files: [], ahead: 0, behind: 0, tracking: null, current: 'main' }),
  diff: vi.fn().mockResolvedValue(''),
  show: vi.fn().mockResolvedValue(''),
  stage: vi.fn().mockResolvedValue({ success: true }),
  stageAll: vi.fn().mockResolvedValue({ success: true }),
  unstage: vi.fn().mockResolvedValue({ success: true }),
  commit: vi.fn().mockResolvedValue({ success: true }),
  push: vi.fn().mockResolvedValue({ success: true }),
  pull: vi.fn().mockResolvedValue({ success: true }),
  clone: vi.fn().mockResolvedValue({ success: true }),
  worktreeAdd: vi.fn().mockResolvedValue({ success: true }),
  worktreeList: vi.fn().mockResolvedValue([]),
  pushNewBranch: vi.fn().mockResolvedValue({ success: true }),
  defaultBranch: vi.fn().mockResolvedValue('main'),
  remoteUrl: vi.fn().mockResolvedValue(null),
  branchChanges: vi.fn().mockResolvedValue({ files: [], baseBranch: 'main' }),
  headCommit: vi.fn().mockResolvedValue(null),
  listBranches: vi.fn().mockResolvedValue([]),
}

// Mock window.app
const mockApp = {
  isDev: vi.fn().mockResolvedValue(false),
  homedir: vi.fn().mockResolvedValue('/Users/test'),
}

// Mock window.profiles
const mockProfiles = {
  list: vi.fn().mockResolvedValue({ profiles: [], lastProfileId: 'default' }),
  save: vi.fn().mockResolvedValue({ success: true }),
  openWindow: vi.fn().mockResolvedValue({ success: true, alreadyOpen: false }),
  getOpenProfiles: vi.fn().mockResolvedValue([]),
}

// Mock window.gh
const mockGh = {
  isInstalled: vi.fn().mockResolvedValue(true),
  issues: vi.fn().mockResolvedValue([]),
  repoSlug: vi.fn().mockResolvedValue(null),
  prStatus: vi.fn().mockResolvedValue(null),
  hasWriteAccess: vi.fn().mockResolvedValue(false),
  mergeBranchToMain: vi.fn().mockResolvedValue({ success: true }),
  getPrCreateUrl: vi.fn().mockResolvedValue(null),
  prComments: vi.fn().mockResolvedValue([]),
  replyToComment: vi.fn().mockResolvedValue({ success: true }),
}

// Mock window.shell
const mockShell = {
  openExternal: vi.fn().mockResolvedValue(undefined),
}

// Mock window.repos
const mockRepos = {
  getInitScript: vi.fn().mockResolvedValue(''),
  saveInitScript: vi.fn().mockResolvedValue({ success: true }),
}

// Mock window.menu
const mockMenu = {
  popup: vi.fn().mockResolvedValue(null),
}

// Mock window.fs
const mockFs = {
  readDir: vi.fn().mockResolvedValue([]),
  readFile: vi.fn().mockResolvedValue(''),
  writeFile: vi.fn().mockResolvedValue({ success: true }),
  appendFile: vi.fn().mockResolvedValue({ success: true }),
  readFileBase64: vi.fn().mockResolvedValue(''),
  exists: vi.fn().mockResolvedValue(true),
  mkdir: vi.fn().mockResolvedValue({ success: true }),
  createFile: vi.fn().mockResolvedValue({ success: true }),
  search: vi.fn().mockResolvedValue([]),
  watch: vi.fn().mockResolvedValue({ success: true }),
  unwatch: vi.fn().mockResolvedValue({ success: true }),
  onChange: vi.fn().mockReturnValue(() => {}),
}

// Mock window.location
const mockLocation = {
  search: '',
  href: 'http://localhost',
  origin: 'http://localhost',
  protocol: 'http:',
  host: 'localhost',
  hostname: 'localhost',
  port: '',
  pathname: '/',
  hash: '',
} as Location

// Apply mocks to globalThis
Object.defineProperty(globalThis, 'window', {
  value: {
    config: mockConfig,
    git: mockGit,
    app: mockApp,
    profiles: mockProfiles,
    gh: mockGh,
    shell: mockShell,
    repos: mockRepos,
    menu: mockMenu,
    fs: mockFs,
    location: mockLocation,
  },
  writable: true,
})
