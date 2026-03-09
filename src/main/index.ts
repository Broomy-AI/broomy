/**
 * Main process entry point for the Broomy Electron app.
 *
 * Creates the BrowserWindow, registers every IPC handler the renderer can call,
 * and manages application lifecycle (PTY processes, file watchers, window cleanup).
 * Handlers are organized into groups: PTY management (node-pty), config/profile
 * persistence (~/.broomy/), git operations (simple-git), GitHub CLI wrappers (gh),
 * filesystem I/O, shell execution, native context menus, and TypeScript project
 * context collection. Every handler checks the `isE2ETest` flag and returns
 * deterministic mock data during Playwright tests so no real repos, APIs, or
 * config files are touched.
 */
import { app, BrowserWindow, ipcMain, Menu, shell, dialog } from 'electron'
import pkg from 'electron-updater'
const { autoUpdater } = pkg
import { join, dirname } from 'path'
import { existsSync, readFileSync, FSWatcher } from 'fs'
import { execFileSync } from 'child_process'
import * as pty from 'node-pty'
import { isWindows, isMac, isLinux, resolveCommand, enhancedPath } from './platform'
import { registerAllHandlers, HandlerContext, PROFILES_FILE } from './handlers'
import { resolveShellEnv } from './shellEnv'
import { writeCrashLog, appendErrorLog } from './crashLog'

// Ensure app name is correct (in dev mode Electron defaults to "Electron")
app.name = 'Broomy'

// Check if we're in development mode
const isDev = process.env.ELECTRON_RENDERER_URL !== undefined

// Check if we're in E2E test mode
const isE2ETest = process.env.E2E_TEST === 'true'

// Check if we should hide the window (headless mode)
const isHeadless = process.env.E2E_HEADLESS !== 'false'

// Extend PATH with common bin directories (e.g. ~/.local/bin, /opt/homebrew/bin)
// so tools like claude, git, gh are found even before resolveShellEnv() runs.
process.env.PATH = enhancedPath(process.env.PATH)

// On Windows, also resolve git/gh from well-known install locations
if (isWindows) {
  const dirsToAdd = new Set<string>()
  for (const cmd of ['git', 'gh'] as const) {
    const resolved = resolveCommand(cmd)
    if (resolved) {
      dirsToAdd.add(dirname(resolved))
    }
  }
  if (dirsToAdd.size > 0) {
    const current = process.env.PATH || ''
    process.env.PATH = `${[...dirsToAdd].join(';')};${current}`
  }
}

// Crash handlers — write crash report to disk so the next launch can show recovery UI
if (!isE2ETest) {
  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error)
    try {
      appendErrorLog('main', error instanceof Error ? (error.stack ?? error.message) : String(error))
      writeCrashLog(error, 'main')
      dialog.showErrorBox('Broomy crashed', error.message || String(error))
    } catch {
      // Best-effort — avoid infinite crash loops
    }
    app.exit(1)
  })

  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection:', reason)
    try {
      appendErrorLog('main', reason instanceof Error ? (reason.stack ?? reason.message) : String(reason))
      writeCrashLog(reason, 'main')
      dialog.showErrorBox('Broomy crashed', reason instanceof Error ? reason.message : String(reason))
    } catch {
      // Best-effort
    }
    app.exit(1)
  })
}

// PTY instances map
const ptyProcesses = new Map<string, pty.IPty>()
// File watchers map
const fileWatchers = new Map<string, FSWatcher>()
// Track windows by profileId
const profileWindows = new Map<string, BrowserWindow>()
// Track which window owns each PTY
const ptyOwnerWindows = new Map<string, BrowserWindow>()
// Track which window owns each file watcher
const watcherOwnerWindows = new Map<string, BrowserWindow>()
// Track Docker containers for isolation
const dockerContainers = new Map<string, import('./handlers/types').DockerContainerState>()
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
    } : isLinux ? {
      frame: false,
      autoHideMenuBar: true,
    } : {
      titleBarStyle: 'hidden' as const,
      titleBarOverlay: {
        color: '#252525',
        symbolColor: '#e0e0e0',
        height: 40,
      },
      autoHideMenuBar: true,
    }),
    // Hide window in E2E test mode for headless-like behavior (unless E2E_HEADLESS=false)
    show: !(isE2ETest && isHeadless),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
    acceptFirstMouse: true,
  })

  // Security: restrict webview tags to HTTPS URLs only
  window.webContents.on('will-attach-webview', (_event, webPreferences, params) => {
    // Strip away preload scripts
    delete webPreferences.preload
    webPreferences.nodeIntegration = false
    webPreferences.contextIsolation = true

    // Only allow HTTPS URLs
    if (params.src && !params.src.startsWith('https://')) {
      _event.preventDefault()
    }
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
    void window.loadURL(`${process.env.ELECTRON_RENDERER_URL}${profileParam}`)
    if (!isE2ETest) window.webContents.openDevTools()
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'), {
      search: profileId ? `profile=${encodeURIComponent(profileId)}` : undefined,
    })
  }

  // Ensure window shows once ready (but not in headless E2E mode)
  if (!(isE2ETest && isHeadless)) {
    window.once('ready-to-show', () => {
      window.show()
    })
  }

  // Log renderer errors
  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription)
    appendErrorLog('did-fail-load', `${errorCode}: ${errorDescription}`)
  })

  window.webContents.on('console-message', (_event, level, message, _line, _sourceId) => {
    // level 3 = error (0=verbose, 1=info, 2=warning, 3=error)
    if (level >= 3) {
      appendErrorLog('renderer', message)
    }
  })

  window.webContents.on('render-process-gone', (_event, details) => {
    console.error('Render process gone:', details)
    if (details.reason !== 'clean-exit') {
      try {
        writeCrashLog(new Error(`Renderer process gone: ${details.reason} (exit code ${details.exitCode})`), 'renderer')
      } catch {
        // best-effort
      }
    }
  })

  // Kill PTY processes and close file watchers when the renderer reloads —
  // prevents FD exhaustion from accumulated zombie handles
  window.webContents.on('did-start-navigation', (_event, url, _isInPlace, isMainFrame) => {
    if (!isMainFrame) return
    // Only clean up on same-origin navigation (reload), not initial load
    const currentUrl = window.webContents.getURL()
    if (currentUrl && currentUrl !== url) return
    for (const [id, owner] of ptyOwnerWindows) {
      if (owner === window) {
        const proc = ptyProcesses.get(id)
        if (proc) {
          proc.kill()
          ptyProcesses.delete(id)
        }
        ptyOwnerWindows.delete(id)
      }
    }
    for (const [id, owner] of watcherOwnerWindows) {
      if (owner === window) {
        const watcher = fileWatchers.get(id)
        if (watcher) {
          watcher.close()
          fileWatchers.delete(id)
        }
        watcherOwnerWindows.delete(id)
      }
    }
  })

  // Prevent navigation to external URLs — open them in the default browser instead
  window.webContents.on('will-navigate', (event, url) => {
    // Allow reloading the app itself (file:// or devserver URLs)
    if (url.startsWith('file://') || url.startsWith('http://localhost')) return
    event.preventDefault()
    void shell.openExternal(url)
  })

  // Intercept window.open() calls and redirect to external browser
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  // Cleanup when window is closing
  window.on('close', () => {
    // Remove from profileWindows tracking
    if (profileId) {
      profileWindows.delete(profileId)
    }
    // Kill PTY processes belonging to this window only
    for (const [id, owner] of ptyOwnerWindows) {
      if (owner === window) {
        const ptyProcess = ptyProcesses.get(id)
        if (ptyProcess) {
          ptyProcess.kill()
          ptyProcesses.delete(id)
        }
        ptyOwnerWindows.delete(id)
      }
    }
    // Close file watchers belonging to this window only
    for (const [id, owner] of watcherOwnerWindows) {
      if (owner === window) {
        const watcher = fileWatchers.get(id)
        if (watcher) {
          watcher.close()
          fileWatchers.delete(id)
        }
        watcherOwnerWindows.delete(id)
      }
    }
    if (window === mainWindow) {
      mainWindow = null
    }
  })

  return window
}

// Build context for handler modules
const context: HandlerContext & { createWindow: (profileId?: string) => BrowserWindow } = {
  isE2ETest,
  get e2eScenario() { return (process.env.E2E_SCENARIO || 'default') as import('./handlers/types').E2EScenario },
  e2eRealRepos: process.env.E2E_REAL_REPOS === 'true',
  isDev,
  isWindows,
  ptyProcesses,
  ptyOwnerWindows,
  fileWatchers,
  watcherOwnerWindows,
  profileWindows,
  get mainWindow() { return mainWindow },
  E2E_MOCK_SHELL: process.env.E2E_MOCK_SHELL,
  FAKE_CLAUDE_SCRIPT: process.env.FAKE_CLAUDE_SCRIPT,
  dockerContainers,
  createWindow,
}

// Expose context on globalThis for E2E tests to clean up PTY processes between reloads
if (isE2ETest) {
  (globalThis as Record<string, unknown>).__appContext = context
}

// Register all IPC handlers
registerAllHandlers(ipcMain, context)

async function checkForUpdatesFromMenu(): Promise<void> {
  if (isE2ETest || isDev) {
    void dialog.showMessageBox({ message: 'Update checking is disabled in development mode.' })
    return
  }
  try {
    const result = await autoUpdater.checkForUpdates()
    if (result && result.updateInfo.version !== autoUpdater.currentVersion?.version) {
      // The renderer's VersionIndicator will handle the UI via IPC events
      const info = result.updateInfo
      const focusedWindow = BrowserWindow.getFocusedWindow()
      if (focusedWindow) {
        focusedWindow.webContents.send('updater:updateAvailable', {
          version: info.version,
        })
      }
    } else {
      void dialog.showMessageBox({ message: 'You are running the latest version of Broomy.' })
    }
  } catch {
    void dialog.showMessageBox({ message: 'Could not check for updates. Please try again later.' })
  }
}

// Build application menu with Help menu
function buildAppMenu() {
  const menuTemplate: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        {
          label: 'Check for Updates...',
          click: () => { void checkForUpdatesFromMenu() },
        },
        { type: 'separator' as const },
        { role: 'services' as const },
        { type: 'separator' as const },
        { role: 'hide' as const },
        { role: 'hideOthers' as const },
        { role: 'unhide' as const },
        { type: 'separator' as const },
        { role: 'quit' as const },
      ],
    }] : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        {
          label: 'Select All',
          accelerator: 'CmdOrCtrl+A',
          click: (_, browserWindow) => {
            browserWindow?.webContents.send('menu:select-all')
          },
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        ...(isDev
          ? [
              { role: 'reload' as const },
              { role: 'forceReload' as const },
              { role: 'toggleDevTools' as const },
              { type: 'separator' as const },
            ]
          : []),
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Agent',
      submenu: [
        {
          label: 'Restart Agent',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: (_, browserWindow) => {
            browserWindow?.webContents.send('agent:restart')
          },
        },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [
          { type: 'separator' as const },
          { role: 'front' as const },
        ] : [
          { role: 'close' as const },
        ]),
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Getting Started',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow()
            if (focusedWindow) {
              focusedWindow.webContents.send('help:menu', 'getting-started')
            }
          },
        },
        {
          label: 'Keyboard Shortcuts',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow()
            if (focusedWindow) {
              focusedWindow.webContents.send('help:menu', 'shortcuts')
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Reset Tutorial Progress',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow()
            if (focusedWindow) {
              focusedWindow.webContents.send('help:menu', 'reset-tutorial')
            }
          },
        },
        { type: 'separator' },
        ...(!isMac ? [{
          label: 'Check for Updates...',
          click: () => { void checkForUpdatesFromMenu() },
        },
        { type: 'separator' as const }] : []),
        {
          label: 'Report Issue...',
          click: () => {
            void shell.openExternal('https://github.com/Broomy-AI/broomy/issues')
          },
        },
      ],
    },
  ]

  const menu = Menu.buildFromTemplate(menuTemplate)
  Menu.setApplicationMenu(menu)
}

// App lifecycle
  void app.whenReady().then(async () => {
    await resolveShellEnv()

    // Build the application menu
    buildAppMenu()
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
  stopDockerContainers()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Also stop containers on Cmd+Q / Quit (macOS doesn't always fire window-all-closed)
app.on('will-quit', () => {
  stopDockerContainers()
})

function stopDockerContainers() {
  // Stop legacy broomy-managed containers (backward compat — can be removed in a future release)
  try {
    const ids = execFileSync('docker', ['ps', '-q', '--filter', 'name=broomy-'], { encoding: 'utf-8' }).trim()
    if (ids) {
      execFileSync('docker', ['stop', ...ids.split('\n').filter(Boolean)], { timeout: 10000 })
    }
  } catch {
    // Docker not available or already stopped — ignore
  }
  // Stop any tracked devcontainers
  for (const [, state] of context.dockerContainers) {
    try {
      execFileSync('docker', ['stop', state.containerId], { timeout: 10000 })
    } catch {
      // Already stopped or gone — ignore
    }
  }
  context.dockerContainers.clear()
}
