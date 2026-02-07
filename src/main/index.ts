import { app, BrowserWindow, ipcMain, dialog, Menu, shell } from 'electron'
import { join } from 'path'
import { homedir, tmpdir } from 'os'
import { statusFromChar, buildPrCreateUrl } from './gitStatusParser'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, watch, FSWatcher, appendFileSync, copyFileSync, rmSync } from 'fs'
import * as pty from 'node-pty'
import simpleGit from 'simple-git'
import { exec, execSync } from 'child_process'
import { isWindows, isMac, getDefaultShell, getExecShell, normalizePath, makeExecutable } from './platform'

// Ensure app name is correct (in dev mode Electron defaults to "Electron")
app.name = 'Broomy'

// Check if we're in development mode
const isDev = process.env.ELECTRON_RENDERER_URL !== undefined

// Check if we're in E2E test mode
const isE2ETest = process.env.E2E_TEST === 'true'

// Check if we should hide the window (headless mode)
const isHeadless = process.env.E2E_HEADLESS !== 'false'

// Mock shell for E2E tests - predictable, non-interactive output
const E2E_MOCK_SHELL = process.env.E2E_MOCK_SHELL

// PTY instances map
const ptyProcesses = new Map<string, pty.IPty>()
// File watchers map
const fileWatchers = new Map<string, FSWatcher>()
// Track windows by profileId
const profileWindows = new Map<string, BrowserWindow>()
let mainWindow: BrowserWindow | null = null

function createWindow(profileId?: string): BrowserWindow {
  const window = new BrowserWindow({
    title: 'Broomy',
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#1a1a1a',
    ...(isMac ? {
      titleBarStyle: 'hiddenInset' as const,
      trafficLightPosition: { x: 15, y: 10 },
    } : {
      titleBarStyle: 'hidden' as const,
    }),
    // Hide window in E2E test mode for headless-like behavior (unless E2E_HEADLESS=false)
    show: !(isE2ETest && isHeadless),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    acceptFirstMouse: true,
  })

  // Track the first window as mainWindow for backwards compat
  if (!mainWindow) {
    mainWindow = window
  }

  // Track window by profileId
  if (profileId) {
    profileWindows.set(profileId, window)
  }

  // Load the renderer with profileId as query parameter
  const profileParam = profileId ? `?profile=${encodeURIComponent(profileId)}` : ''
  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(`${process.env.ELECTRON_RENDERER_URL}${profileParam}`)
    window.webContents.openDevTools()
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'), {
      search: profileId ? `profile=${encodeURIComponent(profileId)}` : undefined,
    })
  }

  // Ensure window shows once ready (but not in headless E2E mode)
  if (!(isE2ETest && isHeadless)) {
    window.once('ready-to-show', () => {
      window?.show()
    })
  }

  // Log renderer errors
  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription)
  })

  window.webContents.on('render-process-gone', (_event, details) => {
    console.error('Render process gone:', details)
  })

  // Cleanup when window is closing
  window.on('close', () => {
    // Remove from profileWindows tracking
    if (profileId) {
      profileWindows.delete(profileId)
    }
    // Kill PTY processes belonging to this window
    for (const [id, ptyProcess] of ptyProcesses) {
      ptyProcess.kill()
      ptyProcesses.delete(id)
    }
    for (const [id, watcher] of fileWatchers) {
      watcher.close()
      fileWatchers.delete(id)
    }
    if (window === mainWindow) {
      mainWindow = null
    }
  })

  return window
}

// Track which window owns each PTY
const ptyOwnerWindows = new Map<string, BrowserWindow>()

// PTY IPC handlers
ipcMain.handle('pty:create', (_event, options: { id: string; cwd: string; command?: string; sessionId?: string; env?: Record<string, string> }) => {
  // Find the sender window
  const senderWindow = BrowserWindow.fromWebContents(_event.sender)
  // In E2E test mode, use a controlled shell that won't run real commands
  let shell: string
  let shellArgs: string[] = []
  let initialCommand: string | undefined = options.command

  if (isE2ETest) {
    // In E2E mode, use controlled shells
    if (isWindows) {
      shell = process.env.ComSpec || 'cmd.exe'
      shellArgs = []

      if (options.command) {
        const fakeClaude = join(__dirname, '../../scripts/fake-claude.ps1')
        initialCommand = `powershell -ExecutionPolicy Bypass -File "${fakeClaude}"`
      } else {
        initialCommand = 'echo E2E_TEST_SHELL_READY'
      }
    } else {
      shell = '/bin/bash'
      shellArgs = []

      if (options.command) {
        // This is an agent terminal - run the fake claude script
        const fakeClaude = join(__dirname, '../../scripts/fake-claude.sh')
        initialCommand = `bash "${fakeClaude}"`
      } else {
        // Regular user terminal - just echo ready marker
        initialCommand = 'echo "E2E_TEST_SHELL_READY"; PS1="test-shell$ "'
      }
    }
  } else if (E2E_MOCK_SHELL) {
    // Run the mock shell script via bash (external script mode)
    shell = isWindows ? (process.env.ComSpec || 'cmd.exe') : '/bin/bash'
    shellArgs = isWindows ? ['/c', E2E_MOCK_SHELL] : [E2E_MOCK_SHELL]
  } else {
    shell = getDefaultShell()
    shellArgs = []
  }

  // Start with process.env, but remove env vars that should be explicitly configured
  const baseEnv = { ...process.env } as Record<string, string>
  // Don't inherit CLAUDE_CONFIG_DIR - it should be explicitly set per-agent if needed
  delete baseEnv.CLAUDE_CONFIG_DIR

  // Expand ~ to home directory in env var values
  const expandHome = (value: string) => {
    if (value.startsWith('~/')) {
      return join(homedir(), value.slice(2))
    }
    if (value === '~') {
      return homedir()
    }
    return value
  }

  // Process agent env vars, expanding ~ in values
  const agentEnv: Record<string, string> = {}
  if (options.env) {
    for (const [key, value] of Object.entries(options.env)) {
      const expanded = expandHome(value)

      // Special case: CLAUDE_CONFIG_DIR=~/.claude is the default, so don't set it
      // (Claude behaves differently when the env var is explicitly set vs not set)
      if (key === 'CLAUDE_CONFIG_DIR' && expanded === join(homedir(), '.claude')) {
        continue
      }

      agentEnv[key] = expanded
    }
  }

  const env = {
    ...baseEnv,
    ...agentEnv,  // Agent-specific env vars override base env
  } as Record<string, string>

  const ptyProcess = pty.spawn(shell, shellArgs, {
    name: 'xterm-256color',
    cols: 80,
    rows: 30,
    cwd: options.cwd,
    env,
  })

  ptyProcesses.set(options.id, ptyProcess)
  if (senderWindow) {
    ptyOwnerWindows.set(options.id, senderWindow)
  }

  // Forward data to the window that created this PTY
  ptyProcess.onData((data) => {
    const ownerWindow = ptyOwnerWindows.get(options.id) || mainWindow
    if (ownerWindow && !ownerWindow.isDestroyed()) {
      ownerWindow.webContents.send(`pty:data:${options.id}`, data)
    }
  })

  ptyProcess.onExit(({ exitCode }) => {
    const ownerWindow = ptyOwnerWindows.get(options.id) || mainWindow
    if (ownerWindow && !ownerWindow.isDestroyed()) {
      ownerWindow.webContents.send(`pty:exit:${options.id}`, exitCode)
    }
    ptyProcesses.delete(options.id)
    ptyOwnerWindows.delete(options.id)
  })

  // If a command was specified (or in E2E test mode), run it after shell starts
  if (initialCommand) {
    setTimeout(() => {
      ptyProcess.write(initialCommand + '\r')
    }, 100)
  }

  return { id: options.id }
})

ipcMain.handle('pty:write', (_event, id: string, data: string) => {
  const ptyProcess = ptyProcesses.get(id)
  if (ptyProcess) {
    ptyProcess.write(data)
  }
})

ipcMain.handle('pty:resize', (_event, id: string, cols: number, rows: number) => {
  const ptyProcess = ptyProcesses.get(id)
  if (ptyProcess) {
    ptyProcess.resize(cols, rows)
  }
})

ipcMain.handle('pty:kill', (_event, id: string) => {
  const ptyProcess = ptyProcesses.get(id)
  if (ptyProcess) {
    ptyProcess.kill()
    ptyProcesses.delete(id)
  }
})

// Config directory and file - use different config for dev mode
const CONFIG_DIR = join(homedir(), '.broomy')
const PROFILES_DIR = join(CONFIG_DIR, 'profiles')
const PROFILES_FILE = join(CONFIG_DIR, 'profiles.json')
const CONFIG_FILE_NAME = isDev ? 'config.dev.json' : 'config.json'
// Legacy config file (pre-profiles)
const LEGACY_CONFIG_FILE = join(CONFIG_DIR, CONFIG_FILE_NAME)

// Default agents
const DEFAULT_AGENTS = [
  { id: 'claude', name: 'Claude Code', command: 'claude' },
  { id: 'aider', name: 'Aider', command: 'aider' },
]

// Default profiles
const DEFAULT_PROFILES = {
  profiles: [{ id: 'default', name: 'Default', color: '#3b82f6' }],
  lastProfileId: 'default',
}

// Resolve config file path for a profile
function getProfileConfigFile(profileId: string): string {
  return join(PROFILES_DIR, profileId, CONFIG_FILE_NAME)
}

// Resolve init-scripts dir for a profile
function getProfileInitScriptsDir(profileId: string): string {
  return join(PROFILES_DIR, profileId, 'init-scripts')
}

// Migrate legacy config to default profile (one-time migration)
function migrateToProfiles(): void {
  if (isE2ETest) return

  // Already migrated if profiles.json exists
  if (existsSync(PROFILES_FILE)) return

  // Create profiles directory
  const defaultProfileDir = join(PROFILES_DIR, 'default')
  mkdirSync(defaultProfileDir, { recursive: true })

  // Move legacy config if it exists
  if (existsSync(LEGACY_CONFIG_FILE)) {
    copyFileSync(LEGACY_CONFIG_FILE, join(defaultProfileDir, CONFIG_FILE_NAME))
  }

  // Move legacy init-scripts if they exist
  const legacyInitScriptsDir = join(CONFIG_DIR, 'init-scripts')
  if (existsSync(legacyInitScriptsDir)) {
    const profileInitScriptsDir = join(defaultProfileDir, 'init-scripts')
    mkdirSync(profileInitScriptsDir, { recursive: true })
    try {
      const scripts = readdirSync(legacyInitScriptsDir)
      for (const script of scripts) {
        copyFileSync(join(legacyInitScriptsDir, script), join(profileInitScriptsDir, script))
      }
    } catch {
      // ignore migration errors for init scripts
    }
  }

  // Write profiles.json
  writeFileSync(PROFILES_FILE, JSON.stringify(DEFAULT_PROFILES, null, 2))
}

// Run migration at startup
migrateToProfiles()

// Demo sessions for E2E tests (each needs a unique directory for branch tracking)
const E2E_DEMO_SESSIONS = [
  { id: '1', name: 'broomy', directory: normalizePath(join(tmpdir(), 'broomy-e2e-broomy')), agentId: 'claude' },
  { id: '2', name: 'backend-api', directory: normalizePath(join(tmpdir(), 'broomy-e2e-backend-api')), agentId: 'aider' },
  { id: '3', name: 'docs-site', directory: normalizePath(join(tmpdir(), 'broomy-e2e-docs-site')), agentId: null },
]

// Create E2E test directories if in E2E mode
if (isE2ETest) {
  for (const session of E2E_DEMO_SESSIONS) {
    if (!existsSync(session.directory)) {
      mkdirSync(session.directory, { recursive: true })
    }
  }
}

// Demo repos for E2E tests
const E2E_DEMO_REPOS = [
  { id: 'repo-1', name: 'demo-project', remoteUrl: 'git@github.com:user/demo-project.git', rootDir: normalizePath(join(tmpdir(), 'broomy-e2e-repos/demo-project')), defaultBranch: 'main' },
]

// Profiles IPC handlers
ipcMain.handle('profiles:list', async () => {
  if (isE2ETest) {
    return DEFAULT_PROFILES
  }

  try {
    if (!existsSync(PROFILES_FILE)) {
      return DEFAULT_PROFILES
    }
    const data = readFileSync(PROFILES_FILE, 'utf-8')
    return JSON.parse(data)
  } catch {
    return DEFAULT_PROFILES
  }
})

ipcMain.handle('profiles:save', async (_event, data: { profiles: { id: string; name: string; color: string }[]; lastProfileId: string }) => {
  if (isE2ETest) {
    return { success: true }
  }

  try {
    mkdirSync(CONFIG_DIR, { recursive: true })
    writeFileSync(PROFILES_FILE, JSON.stringify(data, null, 2))
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('profiles:openWindow', async (_event, profileId: string) => {
  // Check if a window is already open for this profile
  const existing = profileWindows.get(profileId)
  if (existing && !existing.isDestroyed()) {
    existing.focus()
    return { success: true, alreadyOpen: true }
  }

  createWindow(profileId)
  return { success: true, alreadyOpen: false }
})

ipcMain.handle('profiles:getOpenProfiles', async () => {
  const openProfiles: string[] = []
  for (const [profileId, window] of profileWindows) {
    if (!window.isDestroyed()) {
      openProfiles.push(profileId)
    }
  }
  return openProfiles
})

// Config IPC handlers - now profile-aware
ipcMain.handle('config:load', async (_event, profileId?: string) => {
  // In E2E test mode, return demo sessions for consistent testing
  if (isE2ETest) {
    return { agents: DEFAULT_AGENTS, sessions: E2E_DEMO_SESSIONS, repos: E2E_DEMO_REPOS, defaultCloneDir: normalizePath(join(tmpdir(), 'broomy-e2e-repos')) }
  }

  const configFile = profileId ? getProfileConfigFile(profileId) : LEGACY_CONFIG_FILE
  try {
    if (!existsSync(configFile)) {
      return { agents: DEFAULT_AGENTS, sessions: [] }
    }
    const data = readFileSync(configFile, 'utf-8')
    const config = JSON.parse(data)
    // Ensure agents array exists with defaults
    if (!config.agents || config.agents.length === 0) {
      config.agents = DEFAULT_AGENTS
    }
    return config
  } catch {
    return { agents: DEFAULT_AGENTS, sessions: [] }
  }
})

ipcMain.handle('config:save', async (_event, config: { profileId?: string; agents?: unknown[]; sessions: unknown[]; repos?: unknown[]; defaultCloneDir?: string; showSidebar?: boolean; sidebarWidth?: number; toolbarPanels?: string[] }) => {
  // Don't save config during E2E tests to avoid polluting real config
  if (isE2ETest) {
    return { success: true }
  }

  const configFile = config.profileId ? getProfileConfigFile(config.profileId) : LEGACY_CONFIG_FILE
  const configDir = config.profileId ? join(PROFILES_DIR, config.profileId) : CONFIG_DIR

  try {
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true })
    }
    // Read existing config to preserve fields we don't explicitly set
    let existingConfig: Record<string, unknown> = {}
    if (existsSync(configFile)) {
      try {
        existingConfig = JSON.parse(readFileSync(configFile, 'utf-8'))
      } catch {
        // ignore
      }
    }
    const configToSave: Record<string, unknown> = {
      ...existingConfig,
      agents: config.agents || DEFAULT_AGENTS,
      sessions: config.sessions,
    }
    // Only overwrite these if provided
    if (config.repos !== undefined) configToSave.repos = config.repos
    if (config.defaultCloneDir !== undefined) configToSave.defaultCloneDir = config.defaultCloneDir
    if (config.showSidebar !== undefined) configToSave.showSidebar = config.showSidebar
    if (config.sidebarWidth !== undefined) configToSave.sidebarWidth = config.sidebarWidth
    if (config.toolbarPanels !== undefined) configToSave.toolbarPanels = config.toolbarPanels
    writeFileSync(configFile, JSON.stringify(configToSave, null, 2))
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// Mock branch data for E2E tests (keyed by directory)
const E2E_MOCK_BRANCHES: Record<string, string> = {
  [normalizePath(join(tmpdir(), 'broomy-e2e-broomy'))]: 'main',
  [normalizePath(join(tmpdir(), 'broomy-e2e-backend-api'))]: 'feature/auth',
  [normalizePath(join(tmpdir(), 'broomy-e2e-docs-site'))]: 'main',
}

// Git IPC handlers
ipcMain.handle('git:getBranch', async (_event, repoPath: string) => {
  // In E2E test mode, return mock branch data
  if (isE2ETest) {
    return E2E_MOCK_BRANCHES[repoPath] || 'main'
  }

  try {
    const git = simpleGit(repoPath)
    const status = await git.status()
    return status.current || 'unknown'
  } catch {
    return 'unknown'
  }
})

ipcMain.handle('git:isGitRepo', async (_event, dirPath: string) => {
  // In E2E test mode, always return true for demo directories
  if (isE2ETest) {
    return true
  }

  try {
    const git = simpleGit(dirPath)
    return await git.checkIsRepo()
  } catch {
    return false
  }
})

ipcMain.handle('git:status', async (_event, repoPath: string) => {
  // In E2E test mode, return mock status
  if (isE2ETest) {
    return {
      files: [
        { path: 'src/index.ts', status: 'modified', staged: false, indexStatus: ' ', workingDirStatus: 'M' },
        { path: 'README.md', status: 'modified', staged: false, indexStatus: ' ', workingDirStatus: 'M' },
      ],
      ahead: 0,
      behind: 0,
      tracking: null,
      current: E2E_MOCK_BRANCHES[repoPath] || 'main',
    }
  }

  try {
    const git = simpleGit(repoPath)
    // Use -uall to list individual files inside untracked directories
    const status = await git.status(['-uall'])
    const files: { path: string; status: string; staged: boolean; indexStatus: string; workingDirStatus: string }[] = []

    for (const file of status.files) {
      const indexStatus = file.index || ' '
      const workingDirStatus = file.working_dir || ' '
      const hasIndexChange = indexStatus !== ' ' && indexStatus !== '?'
      const hasWorkingDirChange = workingDirStatus !== ' ' && workingDirStatus !== '?'

      // statusFromChar imported from ./gitStatusParser

      if (hasIndexChange) {
        files.push({ path: file.path, status: statusFromChar(indexStatus), staged: true, indexStatus, workingDirStatus })
      }

      if (hasWorkingDirChange || (!hasIndexChange && workingDirStatus === '?')) {
        files.push({ path: file.path, status: statusFromChar(workingDirStatus), staged: false, indexStatus, workingDirStatus })
      } else if (!hasIndexChange && !hasWorkingDirChange) {
        // Shouldn't happen, but handle gracefully
        files.push({ path: file.path, status: 'modified', staged: false, indexStatus, workingDirStatus })
      }
    }

    return {
      files,
      ahead: status.ahead,
      behind: status.behind,
      tracking: status.tracking,
      current: status.current,
    }
  } catch {
    return { files: [], ahead: 0, behind: 0, tracking: null, current: null }
  }
})

ipcMain.handle('git:stage', async (_event, repoPath: string, filePath: string) => {
  if (isE2ETest) {
    return { success: true }
  }

  try {
    const git = simpleGit(repoPath)
    await git.add([filePath])
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('git:stageAll', async (_event, repoPath: string) => {
  if (isE2ETest) {
    return { success: true }
  }

  try {
    const git = simpleGit(repoPath)
    await git.add('.')
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('git:unstage', async (_event, repoPath: string, filePath: string) => {
  if (isE2ETest) {
    return { success: true }
  }

  try {
    const git = simpleGit(repoPath)
    await git.reset(['HEAD', '--', filePath])
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('git:commit', async (_event, repoPath: string, message: string) => {
  if (isE2ETest) {
    return { success: true }
  }

  if (!message || message.trim() === '') {
    return { success: false, error: 'Commit message cannot be empty' }
  }

  try {
    const git = simpleGit(repoPath)
    await git.commit(message)
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('git:push', async (_event, repoPath: string) => {
  if (isE2ETest) {
    return { success: true }
  }

  try {
    const git = simpleGit(repoPath)
    await git.push()
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('git:pull', async (_event, repoPath: string) => {
  if (isE2ETest) {
    return { success: true }
  }

  try {
    const git = simpleGit(repoPath)
    await git.pull()
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('git:diff', async (_event, repoPath: string, filePath?: string) => {
  // In E2E test mode, return mock diff
  if (isE2ETest) {
    return `diff --git a/src/index.ts b/src/index.ts
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,4 @@
+// New comment
 export function main() {
   console.log('Hello')
 }`
  }

  try {
    const git = simpleGit(repoPath)
    if (filePath) {
      return await git.diff([filePath])
    }
    return await git.diff()
  } catch {
    return ''
  }
})

ipcMain.handle('git:show', async (_event, repoPath: string, filePath: string, ref = 'HEAD') => {
  // In E2E test mode, return mock original content
  if (isE2ETest) {
    return `export function main() {
  console.log('Hello')
}`
  }

  try {
    const git = simpleGit(repoPath)
    // Use raw command to get file content at the specified ref
    const result = await git.raw(['show', `${ref}:${filePath}`])
    return result
  } catch (error) {
    // File might not exist in the ref (new file), return empty
    console.error('git show error:', error)
    return ''
  }
})

// Filesystem IPC handlers
ipcMain.handle('fs:readDir', async (_event, dirPath: string) => {
  // In E2E test mode, return mock directory listing
  if (isE2ETest) {
    return [
      { name: 'src', path: join(dirPath, 'src'), isDirectory: true },
      { name: 'package.json', path: join(dirPath, 'package.json'), isDirectory: false },
      { name: 'README.md', path: join(dirPath, 'README.md'), isDirectory: false },
    ]
  }

  try {
    const entries = readdirSync(dirPath, { withFileTypes: true })
    return entries
      .filter((entry) => entry.name !== '.git') // Only hide .git directory
      .map((entry) => ({
        name: entry.name,
        path: normalizePath(join(dirPath, entry.name)),
        isDirectory: entry.isDirectory(),
      }))
      .sort((a, b) => {
        // Directories first, then alphabetically
        if (a.isDirectory && !b.isDirectory) return -1
        if (!a.isDirectory && b.isDirectory) return 1
        return a.name.localeCompare(b.name)
      })
  } catch {
    return []
  }
})

ipcMain.handle('fs:readFile', async (_event, filePath: string) => {
  // In E2E test mode, return mock file content
  if (isE2ETest) {
    return '// Mock file content for E2E tests\nexport const test = true;\n'
  }

  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`)
  }
  const stats = statSync(filePath)
  if (stats.isDirectory()) {
    throw new Error('Cannot read directory as file')
  }
  // Check if file is too large (over 5MB)
  if (stats.size > 5 * 1024 * 1024) {
    throw new Error('File is too large to display')
  }
  return readFileSync(filePath, 'utf-8')
})

ipcMain.handle('fs:writeFile', async (_event, filePath: string, content: string) => {
  if (isE2ETest) {
    return { success: true }
  }

  try {
    writeFileSync(filePath, content, 'utf-8')
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('fs:appendFile', async (_event, filePath: string, content: string) => {
  if (isE2ETest) {
    return { success: true }
  }

  try {
    appendFileSync(filePath, content, 'utf-8')
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('fs:exists', async (_event, filePath: string) => {
  return existsSync(filePath)
})

ipcMain.handle('fs:mkdir', async (_event, dirPath: string) => {
  if (isE2ETest) {
    return { success: true }
  }

  try {
    if (existsSync(dirPath)) {
      return { success: false, error: 'Directory already exists' }
    }
    mkdirSync(dirPath, { recursive: true })
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('fs:rm', async (_event, targetPath: string) => {
  if (isE2ETest) {
    return { success: true }
  }

  try {
    if (!existsSync(targetPath)) {
      return { success: true }
    }
    rmSync(targetPath, { recursive: true, force: true })
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('fs:createFile', async (_event, filePath: string) => {
  if (isE2ETest) {
    return { success: true }
  }

  try {
    if (existsSync(filePath)) {
      return { success: false, error: 'File already exists' }
    }
    writeFileSync(filePath, '')
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('fs:search', async (_event, dirPath: string, query: string) => {
  if (isE2ETest) {
    return []
  }

  const SKIP_DIRS = new Set(['.git', 'node_modules', '.next', '.cache', 'dist', 'build', '__pycache__', '.venv', 'venv'])
  const BINARY_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg', '.woff', '.woff2', '.ttf', '.eot', '.mp3', '.mp4', '.avi', '.mov', '.zip', '.tar', '.gz', '.rar', '.7z', '.pdf', '.exe', '.dll', '.so', '.dylib', '.o', '.a', '.bin', '.dat', '.db', '.sqlite'])
  const MAX_RESULTS = 500
  const MAX_CONTENT_MATCHES_PER_FILE = 5
  const MAX_FILE_SIZE = 1024 * 1024 // 1MB

  const results: { path: string; name: string; relativePath: string; matchType: 'filename' | 'content'; contentMatches: { line: number; text: string }[] }[] = []
  const lowerQuery = query.toLowerCase()

  const walkDir = (dir: string) => {
    if (results.length >= MAX_RESULTS) return

    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (results.length >= MAX_RESULTS) return

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue
        walkDir(join(dir, entry.name))
        continue
      }

      const filePath = join(dir, entry.name)
      const normalizedFilePath = normalizePath(filePath)
      const normalizedDirPath = normalizePath(dirPath)
      const relativePath = normalizedFilePath.replace(normalizedDirPath + '/', '')
      const ext = entry.name.substring(entry.name.lastIndexOf('.')).toLowerCase()

      // Check filename match
      const filenameMatch = entry.name.toLowerCase().includes(lowerQuery)

      // Check content match (skip binary files and large files)
      const contentMatches: { line: number; text: string }[] = []
      if (!BINARY_EXTENSIONS.has(ext)) {
        try {
          const stats = statSync(filePath)
          if (stats.size <= MAX_FILE_SIZE) {
            const content = readFileSync(filePath, 'utf-8')
            const lines = content.split('\n')
            for (let i = 0; i < lines.length && contentMatches.length < MAX_CONTENT_MATCHES_PER_FILE; i++) {
              if (lines[i].toLowerCase().includes(lowerQuery)) {
                contentMatches.push({ line: i + 1, text: lines[i].trim().substring(0, 200) })
              }
            }
          }
        } catch {
          // Skip files that can't be read
        }
      }

      if (filenameMatch || contentMatches.length > 0) {
        results.push({
          path: normalizedFilePath,
          name: entry.name,
          relativePath,
          matchType: filenameMatch ? 'filename' : 'content',
          contentMatches,
        })
      }
    }
  }

  walkDir(dirPath)
  return results
})

ipcMain.handle('fs:readFileBase64', async (_event, filePath: string) => {
  // In E2E test mode, return a tiny 1x1 transparent PNG as base64
  if (isE2ETest) {
    return 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  }

  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`)
  }
  const stats = statSync(filePath)
  if (stats.isDirectory()) {
    throw new Error('Cannot read directory as file')
  }
  // Check if file is too large (over 10MB for images)
  if (stats.size > 10 * 1024 * 1024) {
    throw new Error('File is too large to display')
  }
  return readFileSync(filePath).toString('base64')
})

// App info IPC handlers
ipcMain.handle('app:isDev', () => isDev)
ipcMain.handle('app:homedir', () => homedir())
ipcMain.handle('app:platform', () => process.platform)

// Expand ~ to home directory
const expandHomePath = (path: string) => {
  if (path.startsWith('~/')) {
    return join(homedir(), path.slice(2))
  }
  if (path === '~') {
    return homedir()
  }
  return path
}

// Git extended handlers
ipcMain.handle('git:clone', async (_event, url: string, targetDir: string) => {
  if (isE2ETest) {
    return { success: true }
  }

  try {
    await simpleGit().clone(url, expandHomePath(targetDir))
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('git:worktreeAdd', async (_event, repoPath: string, worktreePath: string, branchName: string, baseBranch: string) => {
  if (isE2ETest) {
    return { success: true }
  }

  try {
    const git = simpleGit(expandHomePath(repoPath))
    await git.raw(['worktree', 'add', '-b', branchName, expandHomePath(worktreePath), baseBranch])
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('git:worktreeList', async (_event, repoPath: string) => {
  if (isE2ETest) {
    return [
      { path: repoPath, branch: 'main', head: 'abc1234' },
    ]
  }

  try {
    const git = simpleGit(expandHomePath(repoPath))
    const raw = await git.raw(['worktree', 'list', '--porcelain'])
    const worktrees: { path: string; branch: string; head: string }[] = []
    let current: { path: string; branch: string; head: string } = { path: '', branch: '', head: '' }

    for (const line of raw.split('\n')) {
      if (line.startsWith('worktree ')) {
        if (current.path) worktrees.push(current)
        current = { path: normalizePath(line.slice(9)), branch: '', head: '' }
      } else if (line.startsWith('HEAD ')) {
        current.head = line.slice(5)
      } else if (line.startsWith('branch ')) {
        // branch refs/heads/main -> main
        current.branch = line.slice(7).replace('refs/heads/', '')
      } else if (line === '' && current.path) {
        worktrees.push(current)
        current = { path: '', branch: '', head: '' }
      }
    }
    if (current.path) worktrees.push(current)

    return worktrees
  } catch {
    return []
  }
})

ipcMain.handle('git:pushNewBranch', async (_event, repoPath: string, branchName: string) => {
  if (isE2ETest) {
    return { success: true }
  }

  try {
    const git = simpleGit(expandHomePath(repoPath))
    await git.push(['--set-upstream', 'origin', branchName])
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('git:defaultBranch', async (_event, repoPath: string) => {
  if (isE2ETest) {
    return 'main'
  }

  try {
    const git = simpleGit(expandHomePath(repoPath))
    // Try symbolic-ref first
    try {
      const ref = await git.raw(['symbolic-ref', 'refs/remotes/origin/HEAD'])
      return ref.trim().replace('refs/remotes/origin/', '')
    } catch {
      // Fallback: check if main or master exists
      try {
        await git.raw(['rev-parse', '--verify', 'main'])
        return 'main'
      } catch {
        try {
          await git.raw(['rev-parse', '--verify', 'master'])
          return 'master'
        } catch {
          return 'main'
        }
      }
    }
  } catch {
    return 'main'
  }
})

ipcMain.handle('git:remoteUrl', async (_event, repoPath: string) => {
  if (isE2ETest) {
    return 'git@github.com:user/demo-project.git'
  }

  try {
    const git = simpleGit(expandHomePath(repoPath))
    const remotes = await git.getRemotes(true)
    const origin = remotes.find(r => r.name === 'origin')
    return origin?.refs?.fetch || null
  } catch {
    return null
  }
})

ipcMain.handle('git:headCommit', async (_event, repoPath: string) => {
  if (isE2ETest) {
    return 'abc1234567890'
  }

  try {
    const git = simpleGit(expandHomePath(repoPath))
    const log = await git.log({ maxCount: 1 })
    return log.latest?.hash || null
  } catch {
    return null
  }
})

ipcMain.handle('git:listBranches', async (_event, repoPath: string) => {
  if (isE2ETest) {
    return [
      { name: 'main', isRemote: false, current: true },
      { name: 'feature/auth', isRemote: false, current: false },
      { name: 'origin/main', isRemote: true, current: false },
      { name: 'origin/feature/old-branch', isRemote: true, current: false },
    ]
  }

  try {
    const git = simpleGit(expandHomePath(repoPath))
    const branchSummary = await git.branch(['-a', '--sort=-committerdate'])

    const branches: { name: string; isRemote: boolean; current: boolean }[] = []

    for (const [name, data] of Object.entries(branchSummary.branches)) {
      // Skip HEAD references
      if (name.includes('HEAD')) continue

      const isRemote = name.startsWith('remotes/')
      const cleanName = isRemote ? name.replace('remotes/', '') : name

      branches.push({
        name: cleanName,
        isRemote,
        current: data.current,
      })
    }

    return branches
  } catch {
    return []
  }
})

ipcMain.handle('git:fetchBranch', async (_event, repoPath: string, branchName: string) => {
  if (isE2ETest) {
    return { success: true }
  }

  try {
    const git = simpleGit(expandHomePath(repoPath))
    await git.fetch('origin', branchName)
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('git:fetchPrHead', async (_event, repoPath: string, prNumber: number) => {
  if (isE2ETest) {
    return { success: true }
  }

  try {
    const git = simpleGit(expandHomePath(repoPath))
    await git.fetch('origin', `pull/${prNumber}/head`)
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('git:isMergedInto', async (_event, repoPath: string, ref: string) => {
  if (isE2ETest) {
    return false
  }

  try {
    const git = simpleGit(expandHomePath(repoPath))
    // Use rev-list --count instead of merge-base --is-ancestor
    // because --is-ancestor communicates via exit codes which simple-git may not handle reliably
    const output = await git.raw(['rev-list', '--count', 'HEAD', `^origin/${ref}`])
    return parseInt(output.trim(), 10) === 0
  } catch {
    return false
  }
})

ipcMain.handle('git:branchChanges', async (_event, repoPath: string, baseBranch?: string) => {
  if (isE2ETest) {
    return {
      files: [
        { path: 'src/index.ts', status: 'modified' },
        { path: 'src/new-feature.ts', status: 'added' },
      ],
      baseBranch: 'main',
    }
  }

  try {
    const git = simpleGit(expandHomePath(repoPath))

    // Auto-detect base branch if not provided
    if (!baseBranch) {
      try {
        const ref = await git.raw(['symbolic-ref', 'refs/remotes/origin/HEAD'])
        baseBranch = ref.trim().replace('refs/remotes/origin/', '')
      } catch {
        try {
          await git.raw(['rev-parse', '--verify', 'origin/main'])
          baseBranch = 'main'
        } catch {
          try {
            await git.raw(['rev-parse', '--verify', 'origin/master'])
            baseBranch = 'master'
          } catch {
            baseBranch = 'main'
          }
        }
      }
    }

    // Get all changed files on this branch vs base
    const diffOutput = await git.raw(['diff', '--name-status', `origin/${baseBranch}...HEAD`])

    const files: { path: string; status: string }[] = []
    for (const line of diffOutput.trim().split('\n')) {
      if (!line.trim()) continue
      const parts = line.split('\t')
      const statusChar = parts[0]
      const filePath = parts.length > 2 ? parts[2] : parts[1] // Handle renames (R100\told\tnew)

      let status = 'modified'
      switch (statusChar.charAt(0)) {
        case 'M': status = 'modified'; break
        case 'A': status = 'added'; break
        case 'D': status = 'deleted'; break
        case 'R': status = 'renamed'; break
        case 'C': status = 'added'; break
      }

      if (filePath) {
        files.push({ path: filePath, status })
      }
    }

    return { files, baseBranch }
  } catch {
    return { files: [], baseBranch: baseBranch || 'main' }
  }
})

ipcMain.handle('git:branchCommits', async (_event, repoPath: string, baseBranch?: string) => {
  if (isE2ETest) {
    return {
      commits: [
        { hash: 'abc1234567890', shortHash: 'abc1234', message: 'Add new feature', author: 'Test User', date: '2025-01-15T10:00:00Z' },
        { hash: 'def5678901234', shortHash: 'def5678', message: 'Fix styling bug', author: 'Test User', date: '2025-01-14T09:00:00Z' },
      ],
      baseBranch: 'main',
    }
  }

  try {
    const git = simpleGit(expandHomePath(repoPath))

    // Auto-detect base branch if not provided
    if (!baseBranch) {
      try {
        const ref = await git.raw(['symbolic-ref', 'refs/remotes/origin/HEAD'])
        baseBranch = ref.trim().replace('refs/remotes/origin/', '')
      } catch {
        try {
          await git.raw(['rev-parse', '--verify', 'origin/main'])
          baseBranch = 'main'
        } catch {
          try {
            await git.raw(['rev-parse', '--verify', 'origin/master'])
            baseBranch = 'master'
          } catch {
            baseBranch = 'main'
          }
        }
      }
    }

    const SEP = '<<SEP>>'
    const logOutput = await git.raw([
      'log',
      `origin/${baseBranch}..HEAD`,
      `--pretty=format:%H${SEP}%h${SEP}%s${SEP}%an${SEP}%aI`,
    ])

    const commits: { hash: string; shortHash: string; message: string; author: string; date: string }[] = []
    for (const line of logOutput.trim().split('\n')) {
      if (!line.trim()) continue
      const parts = line.split(SEP)
      if (parts.length >= 5) {
        commits.push({
          hash: parts[0],
          shortHash: parts[1],
          message: parts[2],
          author: parts[3],
          date: parts[4],
        })
      }
    }

    return { commits, baseBranch }
  } catch {
    return { commits: [], baseBranch: baseBranch || 'main' }
  }
})

ipcMain.handle('git:commitFiles', async (_event, repoPath: string, commitHash: string) => {
  if (isE2ETest) {
    return [
      { path: 'src/index.ts', status: 'modified' },
      { path: 'src/utils.ts', status: 'added' },
    ]
  }

  try {
    const git = simpleGit(expandHomePath(repoPath))
    const output = await git.raw(['diff-tree', '--no-commit-id', '--name-status', '-r', commitHash])

    const files: { path: string; status: string }[] = []
    for (const line of output.trim().split('\n')) {
      if (!line.trim()) continue
      const parts = line.split('\t')
      const statusChar = parts[0]
      const filePath = parts.length > 2 ? parts[2] : parts[1]

      let status = 'modified'
      switch (statusChar.charAt(0)) {
        case 'M': status = 'modified'; break
        case 'A': status = 'added'; break
        case 'D': status = 'deleted'; break
        case 'R': status = 'renamed'; break
        case 'C': status = 'added'; break
      }

      if (filePath) {
        files.push({ path: filePath, status })
      }
    }

    return files
  } catch {
    return []
  }
})

// GitHub CLI handlers
ipcMain.handle('gh:isInstalled', async () => {
  if (isE2ETest) {
    return true
  }

  try {
    execSync('gh --version', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})

ipcMain.handle('gh:issues', async (_event, repoDir: string) => {
  if (isE2ETest) {
    return [
      { number: 42, title: 'Add user authentication', labels: ['feature', 'priority'], url: 'https://github.com/user/demo-project/issues/42' },
      { number: 17, title: 'Fix login page crash', labels: ['bug'], url: 'https://github.com/user/demo-project/issues/17' },
    ]
  }

  try {
    const result = execSync('gh issue list --assignee @me --state open --json number,title,labels,url --limit 50', {
      cwd: expandHomePath(repoDir),
      encoding: 'utf-8',
      timeout: 30000,
    })
    const issues = JSON.parse(result)
    return issues.map((issue: { number: number; title: string; labels: { name: string }[]; url: string }) => ({
      number: issue.number,
      title: issue.title,
      labels: (issue.labels || []).map((l: { name: string }) => l.name),
      url: issue.url,
    }))
  } catch {
    return []
  }
})

ipcMain.handle('gh:repoSlug', async (_event, repoDir: string) => {
  if (isE2ETest) {
    return 'user/demo-project'
  }

  try {
    const result = execSync('gh repo view --json nameWithOwner --jq .nameWithOwner', {
      cwd: expandHomePath(repoDir),
      encoding: 'utf-8',
      timeout: 15000,
    })
    return result.trim() || null
  } catch {
    return null
  }
})

ipcMain.handle('gh:prStatus', async (_event, repoDir: string) => {
  if (isE2ETest) {
    // Return mock PR for feature branches, null for main
    const branch = E2E_MOCK_BRANCHES[repoDir]
    if (branch && branch !== 'main') {
      return {
        number: 123,
        title: 'Test PR',
        state: 'OPEN',
        url: 'https://github.com/user/demo-project/pull/123',
        headRefName: branch,
        baseRefName: 'main',
      }
    }
    return null
  }

  try {
    const result = execSync('gh pr view --json number,title,state,url,headRefName,baseRefName', {
      cwd: expandHomePath(repoDir),
      encoding: 'utf-8',
      timeout: 15000,
      stdio: ['pipe', 'pipe', 'ignore'],
    })
    const pr = JSON.parse(result)
    return {
      number: pr.number,
      title: pr.title,
      state: pr.state,
      url: pr.url,
      headRefName: pr.headRefName,
      baseRefName: pr.baseRefName,
    }
  } catch {
    // No PR exists for this branch
    return null
  }
})

ipcMain.handle('gh:hasWriteAccess', async (_event, repoDir: string) => {
  if (isE2ETest) {
    return true
  }

  try {
    // Get repo info including viewer permissions
    const result = execSync('gh repo view --json viewerPermission --jq .viewerPermission', {
      cwd: expandHomePath(repoDir),
      encoding: 'utf-8',
      timeout: 15000,
    })
    const permission = result.trim()
    // ADMIN, MAINTAIN, and WRITE permissions allow pushing to main
    return ['ADMIN', 'MAINTAIN', 'WRITE'].includes(permission)
  } catch {
    return false
  }
})

ipcMain.handle('gh:mergeBranchToMain', async (_event, repoDir: string) => {
  if (isE2ETest) {
    return { success: true }
  }

  try {
    const git = simpleGit(expandHomePath(repoDir))

    // Get current branch name
    const status = await git.status()
    const currentBranch = status.current
    if (!currentBranch) {
      return { success: false, error: 'Could not determine current branch' }
    }

    // Get the default branch
    let defaultBranch = 'main'
    try {
      const ref = await git.raw(['symbolic-ref', 'refs/remotes/origin/HEAD'])
      defaultBranch = ref.trim().replace('refs/remotes/origin/', '')
    } catch {
      // Try to detect main vs master
      try {
        await git.raw(['rev-parse', '--verify', 'origin/main'])
        defaultBranch = 'main'
      } catch {
        defaultBranch = 'master'
      }
    }

    // Push current branch changes to remote first (if there are any)
    await git.push()

    // Checkout main, pull latest, fast-forward merge the branch, and push
    await git.checkout(defaultBranch)
    await git.pull()
    await git.merge([currentBranch, '--ff-only'])
    await git.push()

    // Switch back to the original branch
    await git.checkout(currentBranch)

    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('gh:getPrCreateUrl', async (_event, repoDir: string) => {
  if (isE2ETest) {
    return 'https://github.com/user/demo-project/compare/main...feature/auth?expand=1'
  }

  try {
    const git = simpleGit(expandHomePath(repoDir))

    // Get current branch
    const status = await git.status()
    const currentBranch = status.current
    if (!currentBranch) return null

    // Get repo slug
    const repoSlug = execSync('gh repo view --json nameWithOwner --jq .nameWithOwner', {
      cwd: expandHomePath(repoDir),
      encoding: 'utf-8',
      timeout: 15000,
    }).trim()

    if (!repoSlug) return null

    // Get default branch
    let defaultBranch = 'main'
    try {
      const ref = await git.raw(['symbolic-ref', 'refs/remotes/origin/HEAD'])
      defaultBranch = ref.trim().replace('refs/remotes/origin/', '')
    } catch {
      try {
        await git.raw(['rev-parse', '--verify', 'origin/main'])
        defaultBranch = 'main'
      } catch {
        defaultBranch = 'master'
      }
    }

    return buildPrCreateUrl(repoSlug, defaultBranch, currentBranch)
  } catch {
    return null
  }
})

ipcMain.handle('gh:prComments', async (_event, repoDir: string, prNumber: number) => {
  if (isE2ETest) {
    return [
      {
        id: 1,
        body: 'This looks good, but could you add a comment explaining this logic?',
        path: 'src/index.ts',
        line: 10,
        side: 'RIGHT',
        author: 'reviewer',
        createdAt: '2024-01-15T10:30:00Z',
        url: 'https://github.com/user/demo-project/pull/123#discussion_r1',
      },
      {
        id: 2,
        body: 'Consider using a more descriptive variable name here.',
        path: 'src/utils.ts',
        line: 25,
        side: 'RIGHT',
        author: 'reviewer',
        createdAt: '2024-01-15T11:00:00Z',
        url: 'https://github.com/user/demo-project/pull/123#discussion_r2',
      },
    ]
  }

  try {
    // Fetch review comments (comments on specific lines of code)
    const result = execSync(
      `gh api repos/{owner}/{repo}/pulls/${prNumber}/comments --jq '.[] | {id: .id, body: .body, path: .path, line: .line, side: .side, author: .user.login, createdAt: .created_at, url: .html_url, inReplyToId: .in_reply_to_id}'`,
      {
        cwd: expandHomePath(repoDir),
        encoding: 'utf-8',
        timeout: 30000,
      }
    )

    // Parse the JSON lines output
    const comments = result
      .trim()
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        try {
          return JSON.parse(line)
        } catch {
          return null
        }
      })
      .filter(c => c !== null)

    return comments
  } catch {
    return []
  }
})

ipcMain.handle('gh:replyToComment', async (_event, repoDir: string, prNumber: number, commentId: number, body: string) => {
  if (isE2ETest) {
    return { success: true }
  }

  try {
    // Reply to a review comment
    execSync(
      `gh api repos/{owner}/{repo}/pulls/${prNumber}/comments -f body='${body.replace(/'/g, "'\\''")}' -f in_reply_to=${commentId}`,
      {
        cwd: expandHomePath(repoDir),
        encoding: 'utf-8',
        timeout: 30000,
      }
    )
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('gh:prsToReview', async (_event, repoDir: string) => {
  if (isE2ETest) {
    return [
      { number: 55, title: 'Add dark mode support', author: 'alice', url: 'https://github.com/user/demo-project/pull/55', headRefName: 'feature/dark-mode', baseRefName: 'main', labels: ['feature'] },
      { number: 48, title: 'Fix memory leak in worker pool', author: 'bob', url: 'https://github.com/user/demo-project/pull/48', headRefName: 'fix/memory-leak', baseRefName: 'main', labels: ['bug', 'performance'] },
    ]
  }

  try {
    const result = execSync('gh pr list --search "review-requested:@me" --json number,title,author,url,headRefName,baseRefName,labels --limit 30', {
      cwd: expandHomePath(repoDir),
      encoding: 'utf-8',
      timeout: 30000,
    })
    const prs = JSON.parse(result)
    return prs.map((pr: { number: number; title: string; author: { login: string }; url: string; headRefName: string; baseRefName: string; labels: { name: string }[] }) => ({
      number: pr.number,
      title: pr.title,
      author: pr.author?.login || 'unknown',
      url: pr.url,
      headRefName: pr.headRefName,
      baseRefName: pr.baseRefName,
      labels: (pr.labels || []).map((l: { name: string }) => l.name),
    }))
  } catch (error) {
    console.error('Failed to fetch PRs for review:', error)
    return []
  }
})

ipcMain.handle('gh:submitDraftReview', async (_event, repoDir: string, prNumber: number, comments: { path: string; line: number; body: string }[]) => {
  if (isE2ETest) {
    return { success: true, reviewId: 999 }
  }

  try {
    const result = execSync(
      `gh api repos/{owner}/{repo}/pulls/${prNumber}/reviews -X POST -f event=PENDING -f body="" --input -`,
      {
        cwd: expandHomePath(repoDir),
        encoding: 'utf-8',
        timeout: 30000,
        input: JSON.stringify({ event: 'PENDING', body: '', comments }),
      }
    )
    const parsed = JSON.parse(result)
    return { success: true, reviewId: parsed.id }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// Init script handlers - profile-aware
ipcMain.handle('repos:getInitScript', async (_event, repoId: string, profileId?: string) => {
  if (isE2ETest) {
    return isWindows
      ? '@echo off\r\necho init script for E2E'
      : '#!/bin/bash\necho "init script for E2E"'
  }

  try {
    const initScriptsDir = profileId ? getProfileInitScriptsDir(profileId) : join(CONFIG_DIR, 'init-scripts')
    const scriptPath = join(initScriptsDir, `${repoId}.sh`)
    if (!existsSync(scriptPath)) return null
    return readFileSync(scriptPath, 'utf-8')
  } catch {
    return null
  }
})

ipcMain.handle('repos:saveInitScript', async (_event, repoId: string, script: string, profileId?: string) => {
  if (isE2ETest) {
    return { success: true }
  }

  try {
    const initScriptsDir = profileId ? getProfileInitScriptsDir(profileId) : join(CONFIG_DIR, 'init-scripts')
    if (!existsSync(initScriptsDir)) {
      mkdirSync(initScriptsDir, { recursive: true })
    }
    const scriptPath = join(initScriptsDir, `${repoId}.sh`)
    writeFileSync(scriptPath, script, 'utf-8')
    makeExecutable(scriptPath)
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// Shell handler
ipcMain.handle('shell:exec', async (_event, command: string, cwd: string) => {
  if (isE2ETest) {
    return { success: true, stdout: '', stderr: '', exitCode: 0 }
  }

  return new Promise<{ success: boolean; stdout: string; stderr: string; exitCode: number }>((resolve) => {
    exec(command, { cwd: expandHomePath(cwd), shell: getExecShell(), timeout: 300000 }, (error, stdout, stderr) => {
      const exitCode = error ? (error as NodeJS.ErrnoException & { code?: number }).code || 1 : 0
      resolve({
        success: !error,
        stdout: stdout || '',
        stderr: stderr || '',
        exitCode: typeof exitCode === 'number' ? exitCode : 1,
      })
    })
  })
})

// Open external URL in system browser
ipcMain.handle('shell:openExternal', async (_event, url: string) => {
  await shell.openExternal(url)
})

// Dialog IPC handlers
ipcMain.handle('dialog:openFolder', async (_event) => {
  const senderWindow = BrowserWindow.fromWebContents(_event.sender) || mainWindow
  const result = await dialog.showOpenDialog(senderWindow!, {
    properties: ['openDirectory'],
    title: 'Select a Git Repository',
  })
  if (result.canceled || result.filePaths.length === 0) {
    return null
  }
  return normalizePath(result.filePaths[0])
})

// Track which window owns each file watcher
const watcherOwnerWindows = new Map<string, BrowserWindow>()

// File watching IPC handlers
ipcMain.handle('fs:watch', async (_event, id: string, dirPath: string) => {
  // Don't watch in E2E test mode
  if (isE2ETest) {
    return { success: true }
  }

  const senderWindow = BrowserWindow.fromWebContents(_event.sender)

  // Stop existing watcher for this id if any
  const existingWatcher = fileWatchers.get(id)
  if (existingWatcher) {
    existingWatcher.close()
  }

  if (senderWindow) {
    watcherOwnerWindows.set(id, senderWindow)
  }

  try {
    // Use recursive watching to catch changes in subdirectories
    const watcher = watch(dirPath, { recursive: true }, (eventType, filename) => {
      // Skip .git directory changes
      if (filename && filename.startsWith('.git')) return

      const ownerWindow = watcherOwnerWindows.get(id) || mainWindow
      if (ownerWindow && !ownerWindow.isDestroyed()) {
        ownerWindow.webContents.send(`fs:change:${id}`, { eventType, filename })
      }
    })

    fileWatchers.set(id, watcher)

    watcher.on('error', (error) => {
      console.error('File watcher error:', error)
      fileWatchers.delete(id)
    })

    return { success: true }
  } catch (error) {
    console.error('Failed to start file watcher:', error)
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('fs:unwatch', async (_event, id: string) => {
  const watcher = fileWatchers.get(id)
  if (watcher) {
    watcher.close()
    fileWatchers.delete(id)
  }
  return { success: true }
})

// Native context menu IPC handler
ipcMain.handle('menu:popup', async (_event, items: { id: string; label: string; enabled?: boolean; type?: 'separator' }[]) => {
  const senderWindow = BrowserWindow.fromWebContents(_event.sender) || mainWindow
  return new Promise<string | null>((resolve) => {
    const template = items.map((item) => {
      if (item.type === 'separator') {
        return { type: 'separator' as const }
      }
      return {
        label: item.label,
        enabled: item.enabled !== false,
        click: () => resolve(item.id),
      }
    })

    const menu = Menu.buildFromTemplate(template)
    menu.popup({
      window: senderWindow!,
      callback: () => {
        // Menu closed without selection
        resolve(null)
      },
    })
  })
})

// TypeScript project context handler
ipcMain.handle('ts:getProjectContext', async (_event, projectRoot: string) => {
  if (isE2ETest) {
    return {
      projectRoot,
      compilerOptions: { target: 'es2020', module: 'esnext', jsx: 'react-jsx', strict: true, esModuleInterop: true },
      files: [
        { path: 'src/index.ts', content: 'export const test = true;\n' },
        { path: 'src/utils.ts', content: 'export function add(a: number, b: number) { return a + b; }\n' },
      ],
    }
  }

  const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.next', '.cache', '__pycache__', '.venv'])
  const TS_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx'])
  const MAX_FILES = 2000
  const MAX_FILE_SIZE = 1024 * 1024 // 1MB

  // Read and parse tsconfig.json (with extends chain)
  const parseTsConfig = (configPath: string, depth = 0): Record<string, unknown> => {
    if (depth > 5) return {}
    try {
      if (!existsSync(configPath)) return {}
      const raw = readFileSync(configPath, 'utf-8')
      // Strip comments (// and /* */) for JSON parsing
      const stripped = raw.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
      const parsed = JSON.parse(stripped)

      let result: Record<string, unknown> = {}
      if (parsed.extends) {
        const extendsPath = parsed.extends.startsWith('.')
          ? join(configPath, '..', parsed.extends)
          : join(projectRoot, 'node_modules', parsed.extends)
        // Add .json if not present
        const resolvedExtends = existsSync(extendsPath) ? extendsPath :
          existsSync(extendsPath + '.json') ? extendsPath + '.json' : extendsPath
        result = parseTsConfig(resolvedExtends, depth + 1)
      }

      if (parsed.compilerOptions) {
        result = { ...result, ...parsed.compilerOptions }
      }
      return result
    } catch {
      return {}
    }
  }

  // Try root tsconfig first
  let compilerOptions: Record<string, unknown> = parseTsConfig(join(projectRoot, 'tsconfig.json'))

  // For monorepos: if no root tsconfig, find tsconfigs in immediate subdirectories.
  // Set baseUrl to projectRoot and add paths entries so non-relative imports resolve
  // across all sub-projects (e.g. 'util/util' finds client/util/util.ts or server/util/util.ts).
  if (Object.keys(compilerOptions).length === 0) {
    const subProjectDirs: string[] = []
    try {
      const entries = readdirSync(projectRoot, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue
        const subTsconfigPath = join(projectRoot, entry.name, 'tsconfig.json')
        if (existsSync(subTsconfigPath)) {
          const subOpts = parseTsConfig(subTsconfigPath)
          // Use the first sub-project's options as the base (merge others on top)
          if (Object.keys(compilerOptions).length === 0) {
            compilerOptions = { ...subOpts }
          }
          // Track sub-project dirs that have baseUrl: '.' (common monorepo pattern)
          if (!subOpts.baseUrl || subOpts.baseUrl === '.' || subOpts.baseUrl === './') {
            subProjectDirs.push(entry.name)
          }
        }
      }
    } catch {
      // Ignore read errors
    }

    if (subProjectDirs.length > 0) {
      // Override baseUrl to project root and add paths so imports resolve in each sub-project
      compilerOptions.baseUrl = '.'
      compilerOptions.paths = { '*': subProjectDirs.map(d => `${d}/*`) }
    }
  }

  // Collect project files
  const files: { path: string; content: string }[] = []
  const walkDir = (dir: string) => {
    if (files.length >= MAX_FILES) return
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (files.length >= MAX_FILES) return
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue
        walkDir(fullPath)
      } else {
        const ext = entry.name.substring(entry.name.lastIndexOf('.'))
        if (!TS_EXTENSIONS.has(ext)) continue
        try {
          const stats = statSync(fullPath)
          if (stats.size > MAX_FILE_SIZE) continue
          const content = readFileSync(fullPath, 'utf-8')
          const relativePath = fullPath.replace(projectRoot + '/', '')
          files.push({ path: relativePath, content })
        } catch {
          // Skip unreadable files
        }
      }
    }
  }

  walkDir(projectRoot)

  return { projectRoot, compilerOptions, files }
})

// App lifecycle
app.whenReady().then(() => {
  // Determine the initial profile to open
  let initialProfileId = 'default'
  if (!isE2ETest) {
    try {
      if (existsSync(PROFILES_FILE)) {
        const profilesData = JSON.parse(readFileSync(PROFILES_FILE, 'utf-8'))
        if (profilesData.lastProfileId) {
          initialProfileId = profilesData.lastProfileId
        }
      }
    } catch {
      // ignore, use default
    }
  }

  createWindow(initialProfileId)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(initialProfileId)
    }
  })
})

app.on('window-all-closed', () => {
  // Kill all PTY processes
  for (const [id, ptyProcess] of ptyProcesses) {
    ptyProcess.kill()
    ptyProcesses.delete(id)
  }
  // Close all file watchers
  for (const [id, watcher] of fileWatchers) {
    watcher.close()
    fileWatchers.delete(id)
  }
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
