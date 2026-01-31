import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { homedir } from 'os'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import * as pty from 'node-pty'
import simpleGit from 'simple-git'

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
}

// PTY IPC handlers
ipcMain.handle('pty:create', (_event, options: { id: string; cwd: string; command?: string }) => {
  // In E2E test mode, use a controlled shell that won't run real commands
  let shell: string
  let shellArgs: string[] = []
  let initialCommand: string | undefined = options.command

  if (isE2ETest) {
    // In E2E mode, always use a regular shell but prefix with a test marker
    shell = '/bin/bash'
    shellArgs = []
    // Override any command with a safe echo
    initialCommand = 'echo "E2E_TEST_SHELL_READY"; PS1="test-shell$ "'
  } else if (E2E_MOCK_SHELL) {
    // Run the mock shell script via bash (external script mode)
    shell = '/bin/bash'
    shellArgs = [E2E_MOCK_SHELL]
  } else {
    shell = process.env.SHELL || '/bin/zsh'
    shellArgs = []
  }

  const ptyProcess = pty.spawn(shell, shellArgs, {
    name: 'xterm-256color',
    cols: 80,
    rows: 30,
    cwd: options.cwd,
    env: process.env as Record<string, string>,
  })

  ptyProcesses.set(options.id, ptyProcess)

  // Forward data to renderer
  ptyProcess.onData((data) => {
    mainWindow?.webContents.send(`pty:data:${options.id}`, data)
  })

  ptyProcess.onExit(({ exitCode }) => {
    mainWindow?.webContents.send(`pty:exit:${options.id}`, exitCode)
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

// Config directory and file
const CONFIG_DIR = join(homedir(), '.agent-manager')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')

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

// Config IPC handlers
ipcMain.handle('config:load', async () => {
  // In E2E test mode, return demo sessions for consistent testing
  if (isE2ETest) {
    return { agents: DEFAULT_AGENTS, sessions: E2E_DEMO_SESSIONS }
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

ipcMain.handle('config:save', async (_event, config: { agents?: unknown[]; sessions: unknown[] }) => {
  try {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true })
    }
    // Ensure agents array exists
    const configToSave = {
      agents: config.agents || DEFAULT_AGENTS,
      sessions: config.sessions,
    }
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

  if (process.platform !== 'darwin') {
    app.quit()
  }
})
