import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, FSWatcher } from 'fs'
import * as pty from 'node-pty'
import { isWindows, isMac } from './platform'
import { registerAllHandlers, HandlerContext, PROFILES_FILE } from './handlers'

// Ensure app name is correct (in dev mode Electron defaults to "Electron")
app.name = 'Broomy'

// Check if we're in development mode
const isDev = process.env.ELECTRON_RENDERER_URL !== undefined

// Check if we're in E2E test mode
const isE2ETest = process.env.E2E_TEST === 'true'

// Check if we should hide the window (headless mode)
const isHeadless = process.env.E2E_HEADLESS !== 'false'

// Check if we're in screenshot mode (richer mock data for marketing screenshots)
const isScreenshotMode = process.env.SCREENSHOT_MODE === 'true'

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

// Build context for handler modules
const context: HandlerContext & { createWindow: (profileId?: string) => BrowserWindow } = {
  isE2ETest,
  isScreenshotMode,
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
  createWindow,
}

// Register all IPC handlers
registerAllHandlers(ipcMain, context)

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
