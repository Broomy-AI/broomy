import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron'
import { join } from 'path'
import { homedir } from 'os'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, watch, FSWatcher, appendFileSync, openSync, closeSync, chmodSync } from 'fs'
import * as pty from 'node-pty'
import simpleGit from 'simple-git'
import { exec, execSync } from 'child_process'

// Hooks events directory
const HOOKS_EVENT_DIR = join(homedir(), '.agent-manager', 'hooks-events')

// Ensure hooks event directory exists
if (!existsSync(HOOKS_EVENT_DIR)) {
  mkdirSync(HOOKS_EVENT_DIR, { recursive: true })
}

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
// Hook event watchers map (tracks file position for each session)
const hookEventWatchers = new Map<string, { watcher: FSWatcher; position: number }>()
let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#1a1a1a',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 10 },
    // Hide window in E2E test mode for headless-like behavior (unless E2E_HEADLESS=false)
    show: !(isE2ETest && isHeadless),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Load the renderer
  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Ensure window shows once ready (but not in headless E2E mode)
  if (!(isE2ETest && isHeadless)) {
    mainWindow.once('ready-to-show', () => {
      mainWindow?.show()
    })
  }

  // Log renderer errors
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription)
  })

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('Render process gone:', details)
  })

  // Kill all PTY processes and file watchers when window is closing
  mainWindow.on('close', () => {
    for (const [id, ptyProcess] of ptyProcesses) {
      ptyProcess.kill()
      ptyProcesses.delete(id)
    }
    for (const [id, watcher] of fileWatchers) {
      watcher.close()
      fileWatchers.delete(id)
    }
    for (const [id, { watcher }] of hookEventWatchers) {
      watcher.close()
      hookEventWatchers.delete(id)
    }
  })
}

// PTY IPC handlers
ipcMain.handle('pty:create', (_event, options: { id: string; cwd: string; command?: string; sessionId?: string; env?: Record<string, string> }) => {
  // In E2E test mode, use a controlled shell that won't run real commands
  let shell: string
  let shellArgs: string[] = []
  let initialCommand: string | undefined = options.command

  if (isE2ETest) {
    // In E2E mode, use controlled shells
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
  } else if (E2E_MOCK_SHELL) {
    // Run the mock shell script via bash (external script mode)
    shell = '/bin/bash'
    shellArgs = [E2E_MOCK_SHELL]
  } else {
    shell = process.env.SHELL || '/bin/zsh'
    shellArgs = []
  }

  // Create environment with session ID for Claude hooks
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
    AGENT_MANAGER_SESSION_ID: options.sessionId || options.id,
  } as Record<string, string>

  const ptyProcess = pty.spawn(shell, shellArgs, {
    name: 'xterm-256color',
    cols: 80,
    rows: 30,
    cwd: options.cwd,
    env,
  })

  ptyProcesses.set(options.id, ptyProcess)

  // Forward data to renderer (check window is not destroyed)
  ptyProcess.onData((data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(`pty:data:${options.id}`, data)
    }
  })

  ptyProcess.onExit(({ exitCode }) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(`pty:exit:${options.id}`, exitCode)
    }
    ptyProcesses.delete(options.id)
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

// Hook events IPC handlers
ipcMain.handle('hooks:watch', async (_event, sessionId: string) => {
  if (isE2ETest) {
    return { success: true }
  }

  // Stop existing watcher for this session if any
  const existing = hookEventWatchers.get(sessionId)
  if (existing) {
    existing.watcher.close()
  }

  const eventFile = join(HOOKS_EVENT_DIR, `${sessionId}.jsonl`)

  // Create the event file if it doesn't exist
  if (!existsSync(eventFile)) {
    const fd = openSync(eventFile, 'a')
    closeSync(fd)
  }

  // Get current file size to start reading from end
  const stats = statSync(eventFile)
  let position = stats.size

  try {
    const watcher = watch(eventFile, (eventType) => {
      if (eventType !== 'change') return

      try {
        // Read new content from the file
        const currentStats = statSync(eventFile)
        if (currentStats.size <= position) {
          // File was truncated, reset position
          position = 0
        }

        const fd = openSync(eventFile, 'r')
        const buffer = Buffer.alloc(currentStats.size - position)
        const { readFileSync: readSync } = require('fs')
        const fullContent = readFileSync(eventFile, 'utf-8')
        const newContent = fullContent.slice(position)
        position = currentStats.size
        closeSync(fd)

        // Parse and send each new event
        const lines = newContent.trim().split('\n').filter(Boolean)
        for (const line of lines) {
          try {
            const event = JSON.parse(line)
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send(`hooks:event:${sessionId}`, event)
            }
          } catch {
            // Ignore malformed JSON lines
          }
        }
      } catch (err) {
        console.error('Error reading hook events:', err)
      }
    })

    hookEventWatchers.set(sessionId, { watcher, position })

    watcher.on('error', (error) => {
      console.error('Hook event watcher error:', error)
      hookEventWatchers.delete(sessionId)
    })

    return { success: true }
  } catch (error) {
    console.error('Failed to start hook event watcher:', error)
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('hooks:unwatch', async (_event, sessionId: string) => {
  const existing = hookEventWatchers.get(sessionId)
  if (existing) {
    existing.watcher.close()
    hookEventWatchers.delete(sessionId)
  }
  return { success: true }
})

ipcMain.handle('hooks:clear', async (_event, sessionId: string) => {
  // Clear the event file for a session (useful when restarting)
  const eventFile = join(HOOKS_EVENT_DIR, `${sessionId}.jsonl`)
  if (existsSync(eventFile)) {
    writeFileSync(eventFile, '')
  }
  return { success: true }
})

// Config directory and file - use different config for dev mode
const CONFIG_DIR = join(homedir(), '.agent-manager')
const CONFIG_FILE = join(CONFIG_DIR, isDev ? 'config.dev.json' : 'config.json')

// Default agents
const DEFAULT_AGENTS = [
  { id: 'claude', name: 'Claude Code', command: 'claude' },
  { id: 'aider', name: 'Aider', command: 'aider' },
]

// Demo sessions for E2E tests (each needs a unique directory for branch tracking)
const E2E_DEMO_SESSIONS = [
  { id: '1', name: 'agent-manager', directory: '/tmp/e2e-agent-manager', agentId: 'claude' },
  { id: '2', name: 'backend-api', directory: '/tmp/e2e-backend-api', agentId: 'aider' },
  { id: '3', name: 'docs-site', directory: '/tmp/e2e-docs-site', agentId: null },
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
  { id: 'repo-1', name: 'demo-project', remoteUrl: 'git@github.com:user/demo-project.git', rootDir: '/tmp/e2e-repos/demo-project', defaultBranch: 'main' },
]

// Init scripts directory
const INIT_SCRIPTS_DIR = join(homedir(), '.agent-manager', 'init-scripts')

// Config IPC handlers
ipcMain.handle('config:load', async () => {
  // In E2E test mode, return demo sessions for consistent testing
  if (isE2ETest) {
    return { agents: DEFAULT_AGENTS, sessions: E2E_DEMO_SESSIONS, repos: E2E_DEMO_REPOS, defaultCloneDir: '/tmp/e2e-repos' }
  }

  try {
    if (!existsSync(CONFIG_FILE)) {
      return { agents: DEFAULT_AGENTS, sessions: [] }
    }
    const data = readFileSync(CONFIG_FILE, 'utf-8')
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

ipcMain.handle('config:save', async (_event, config: { agents?: unknown[]; sessions: unknown[]; repos?: unknown[]; defaultCloneDir?: string; showSidebar?: boolean; sidebarWidth?: number; toolbarPanels?: string[] }) => {
  // Don't save config during E2E tests to avoid polluting real config
  if (isE2ETest) {
    return { success: true }
  }

  try {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true })
    }
    // Read existing config to preserve fields we don't explicitly set
    let existingConfig: Record<string, unknown> = {}
    if (existsSync(CONFIG_FILE)) {
      try {
        existingConfig = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'))
      } catch {
        // ignore
      }
    }
    const configToSave = {
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
    writeFileSync(CONFIG_FILE, JSON.stringify(configToSave, null, 2))
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// Mock branch data for E2E tests (keyed by directory)
const E2E_MOCK_BRANCHES: Record<string, string> = {
  '/tmp/e2e-agent-manager': 'main',
  '/tmp/e2e-backend-api': 'feature/auth',
  '/tmp/e2e-docs-site': 'main',
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
      const staged = indexStatus !== ' ' && indexStatus !== '?'

      let fileStatus = 'modified'
      // Determine status from the most relevant field
      const relevantChar = staged ? indexStatus : workingDirStatus
      switch (relevantChar) {
        case 'M': fileStatus = 'modified'; break
        case 'A': fileStatus = 'added'; break
        case 'D': fileStatus = 'deleted'; break
        case 'R': fileStatus = 'renamed'; break
        case '?': fileStatus = 'untracked'; break
        default: fileStatus = 'modified'
      }

      files.push({ path: file.path, status: fileStatus, staged, indexStatus, workingDirStatus })
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

ipcMain.handle('git:show', async (_event, repoPath: string, filePath: string, ref: string = 'HEAD') => {
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
        path: join(dirPath, entry.name),
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

  try {
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
  } catch (error) {
    throw error // Re-throw to send error to renderer
  }
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
    const { appendFileSync } = await import('fs')
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
      const relativePath = filePath.replace(dirPath + '/', '')
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
          path: filePath,
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

  try {
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
  } catch (error) {
    throw error
  }
})

// App info IPC handlers
ipcMain.handle('app:isDev', () => isDev)
ipcMain.handle('app:homedir', () => homedir())

// Hooks setup IPC handlers
const HOOK_SCRIPT_PATH = isDev
  ? join(__dirname, '../../scripts/claude-hook.sh')
  : join(__dirname, '../../../scripts/claude-hook.sh')

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

// Get Claude settings file path for a given config dir
const getClaudeSettingsFile = (configDir?: string) => {
  const baseDir = configDir ? expandHomePath(configDir) : join(homedir(), '.claude')
  return join(baseDir, 'settings.json')
}

ipcMain.handle('hooks:checkSetup', async (_event, configDir?: string) => {
  try {
    const settingsFile = getClaudeSettingsFile(configDir)

    if (!existsSync(settingsFile)) {
      return { configured: false, reason: 'no-claude-settings', configDir: configDir || '~/.claude' }
    }

    const settings = JSON.parse(readFileSync(settingsFile, 'utf-8'))

    // Check if hooks section exists and has our hooks
    if (!settings.hooks) {
      return { configured: false, reason: 'no-hooks-section', configDir: configDir || '~/.claude' }
    }

    // Check for our specific hooks (look for agent-manager or our hook script)
    // New format: each entry has { matcher: {}, hooks: [{ type, command }] }
    const hasOurHook = (entries: Array<{ hooks?: Array<{ command?: string }> }>) => {
      return entries?.some((entry) =>
        entry.hooks?.some((h) => h.command?.includes('claude-hook.sh') || h.command?.includes('agent-manager'))
      )
    }

    const hasPreToolUse = hasOurHook(settings.hooks.PreToolUse)
    const hasPostToolUse = hasOurHook(settings.hooks.PostToolUse)
    const hasPermissionRequest = hasOurHook(settings.hooks.PermissionRequest)
    const hasStop = hasOurHook(settings.hooks.Stop)

    if (hasPreToolUse && hasPostToolUse && hasPermissionRequest && hasStop) {
      return { configured: true, configDir: configDir || '~/.claude' }
    }

    return { configured: false, reason: 'hooks-incomplete', configDir: configDir || '~/.claude' }
  } catch (error) {
    return { configured: false, reason: 'error', error: String(error), configDir: configDir || '~/.claude' }
  }
})

ipcMain.handle('hooks:configure', async (_event, configDir?: string) => {
  try {
    const settingsFile = getClaudeSettingsFile(configDir)

    if (!existsSync(settingsFile)) {
      return { success: false, error: `Claude Code settings file not found at ${settingsFile}. Please run Claude Code at least once.` }
    }

    // Backup existing settings
    const backupPath = settingsFile + '.backup'
    const settingsContent = readFileSync(settingsFile, 'utf-8')
    writeFileSync(backupPath, settingsContent)

    const settings = JSON.parse(settingsContent)

    // Resolve the hook script path
    let hookScript = HOOK_SCRIPT_PATH
    // For packaged app, the script is in resources
    if (!isDev && !existsSync(hookScript)) {
      hookScript = join(process.resourcesPath, 'scripts', 'claude-hook.sh')
    }

    // Ensure hooks section exists
    if (!settings.hooks) {
      settings.hooks = {}
    }

    // New hooks format requires matcher (string) and hooks array
    // Example: {"PostToolUse": [{"matcher": "*", "hooks": [{"type": "command", "command": "..."}]}]}
    const hookEntry = (eventType: string) => ({
      matcher: '*', // Match all
      hooks: [
        {
          type: 'command',
          command: `${hookScript} ${eventType}`
        }
      ]
    })

    // Helper to check if our hook is already configured
    const hasOurHook = (entries: Array<{ hooks?: Array<{ command?: string }> }>) => {
      return entries?.some((entry) =>
        entry.hooks?.some((h) => h.command?.includes('claude-hook.sh'))
      )
    }

    if (!settings.hooks.PreToolUse) {
      settings.hooks.PreToolUse = []
    }
    if (!hasOurHook(settings.hooks.PreToolUse)) {
      settings.hooks.PreToolUse.push(hookEntry('PreToolUse'))
    }

    if (!settings.hooks.PostToolUse) {
      settings.hooks.PostToolUse = []
    }
    if (!hasOurHook(settings.hooks.PostToolUse)) {
      settings.hooks.PostToolUse.push(hookEntry('PostToolUse'))
    }

    if (!settings.hooks.PermissionRequest) {
      settings.hooks.PermissionRequest = []
    }
    if (!hasOurHook(settings.hooks.PermissionRequest)) {
      settings.hooks.PermissionRequest.push(hookEntry('PermissionRequest'))
    }

    if (!settings.hooks.Stop) {
      settings.hooks.Stop = []
    }
    if (!hasOurHook(settings.hooks.Stop)) {
      settings.hooks.Stop.push(hookEntry('Stop'))
    }

    // Write updated settings
    writeFileSync(settingsFile, JSON.stringify(settings, null, 2))

    return { success: true, backupPath }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

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
        current = { path: line.slice(9), branch: '', head: '' }
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
    return issues.map((issue: { number: number; title: string; labels: Array<{ name: string }>; url: string }) => ({
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

// Init script handlers
ipcMain.handle('repos:getInitScript', async (_event, repoId: string) => {
  if (isE2ETest) {
    return '#!/bin/bash\necho "init script for E2E"'
  }

  try {
    const scriptPath = join(INIT_SCRIPTS_DIR, `${repoId}.sh`)
    if (!existsSync(scriptPath)) return null
    return readFileSync(scriptPath, 'utf-8')
  } catch {
    return null
  }
})

ipcMain.handle('repos:saveInitScript', async (_event, repoId: string, script: string) => {
  if (isE2ETest) {
    return { success: true }
  }

  try {
    if (!existsSync(INIT_SCRIPTS_DIR)) {
      mkdirSync(INIT_SCRIPTS_DIR, { recursive: true })
    }
    const scriptPath = join(INIT_SCRIPTS_DIR, `${repoId}.sh`)
    writeFileSync(scriptPath, script, 'utf-8')
    chmodSync(scriptPath, 0o755)
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
    exec(command, { cwd: expandHomePath(cwd), shell: '/bin/bash', timeout: 300000 }, (error, stdout, stderr) => {
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

// Dialog IPC handlers
ipcMain.handle('dialog:openFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
    title: 'Select a Git Repository',
  })
  if (result.canceled || result.filePaths.length === 0) {
    return null
  }
  return result.filePaths[0]
})

// File watching IPC handlers
ipcMain.handle('fs:watch', async (_event, id: string, dirPath: string) => {
  // Don't watch in E2E test mode
  if (isE2ETest) {
    return { success: true }
  }

  // Stop existing watcher for this id if any
  const existingWatcher = fileWatchers.get(id)
  if (existingWatcher) {
    existingWatcher.close()
  }

  try {
    // Use recursive watching to catch changes in subdirectories
    const watcher = watch(dirPath, { recursive: true }, (eventType, filename) => {
      // Skip .git directory changes
      if (filename && filename.startsWith('.git')) return

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(`fs:change:${id}`, { eventType, filename })
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
ipcMain.handle('menu:popup', async (_event, items: Array<{ id: string; label: string; enabled?: boolean; type?: 'separator' }>) => {
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
      window: mainWindow!,
      callback: () => {
        // Menu closed without selection
        resolve(null)
      },
    })
  })
})

// App lifecycle
app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
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
  // Close all hook event watchers
  for (const [id, { watcher }] of hookEventWatchers) {
    watcher.close()
    hookEventWatchers.delete(id)
  }

  if (process.platform !== 'darwin') {
    app.quit()
  }
})
