/**
 * IPC handlers for shell commands, external URLs, native dialogs, and context menus.
 */
import { BrowserWindow, IpcMain, dialog, Menu, shell } from 'electron'
import { exec } from 'child_process'
import { lstat, stat } from 'fs/promises'
import { extname, isAbsolute, resolve } from 'path'
import { getExecShell, normalizePath, getAvailableShells, getDefaultShell } from '../platform'
import { HandlerContext, expandHomePath } from './types'
import { zoomMenuItems } from './settings'
import { toHttpUrl } from '../externalUrl'
import type { OpenPathResult } from '../../shared/openPath'

const isDev = process.env.ELECTRON_RENDERER_URL !== undefined

/** Any C0/C1 control character — never valid in a path we'd open, and a red flag in untrusted input. */
const CONTROL_CHARS = /\p{Cc}/u

/** Longest path string we'll consider (both the candidate and the base). */
const MAX_PATH_LEN = 4096

/** Most a single hover batch may probe. */
const MAX_PATHS_PER_CALL = 64

/**
 * Extensions we hand straight to the OS default app on ⌘-click — render-y document/media types,
 * where "open" means view (HTML → browser, PDF → Preview, …). Everything else reveals in the file
 * manager instead, reducing accidental opens of a source file or (worse) an executable. A convenience
 * bound, not a hard security guarantee: HTML/SVG are active content — the modifier + an existence /
 * regular-file check supply the real intent/safety.
 */
const NATIVE_OPEN_EXTENSIONS = new Set([
  '.html', '.htm', '.pdf', '.md', '.markdown', '.txt', '.csv', '.json', '.xml',
  '.yml', '.yaml', '.log', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico',
])

/** True when a path's extension is in the native-open allowlist (case-insensitive; `extname` keeps the dot). */
export function isNativeOpen(filePath: string): boolean {
  return NATIVE_OPEN_EXTENSIONS.has(extname(filePath).toLowerCase())
}

/**
 * Turn a terminal-derived token into an absolute candidate path, or null if it's unusable. `~` is
 * expanded; a relative path is resolved against `baseCwd` (the session's worktree dir). The result
 * is only a candidate — existence and file type are checked by the caller.
 */
export function resolveTerminalPath(raw: unknown, baseCwd: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_PATH_LEN || CONTROL_CHARS.test(raw)) {
    return null
  }
  if (typeof baseCwd !== 'string' || !isAbsolute(baseCwd) || baseCwd.length > MAX_PATH_LEN || CONTROL_CHARS.test(baseCwd)) {
    return null
  }
  const expanded = expandHomePath(raw)
  return isAbsolute(expanded) ? expanded : resolve(baseCwd, expanded)
}

/**
 * Bound concurrent filesystem probes across ALL terminals, so a burst of hover checks on a slow
 * network/FUSE volume can't saturate the libuv thread pool.
 */
const FS_PROBE_LIMIT = 8
let activeProbes = 0
const probeQueue: (() => void)[] = []
async function withProbeSlot<T>(fn: () => Promise<T>): Promise<T> {
  // Take the slot BEFORE any await, and on release either HAND IT DIRECTLY to a waiter or give
  // it back — never both. Decrementing first and resolving a waiter afterwards would leave the
  // slot momentarily unowned: the waiter resumes on a later microtask, so a caller arriving in
  // between sees the lower count, takes the "free" slot, and both run — overshooting the limit.
  if (activeProbes >= FS_PROBE_LIMIT) {
    await new Promise<void>((r) => probeQueue.push(r))
    // Resumed by a releaser that transferred its slot; `activeProbes` already counts us.
  } else {
    activeProbes++
  }
  try {
    return await fn()
  } finally {
    const next = probeQueue.shift()
    if (next) next() // transfer the slot; the count stays as-is
    else activeProbes--
  }
}

/**
 * Existence of one absolute path via `lstat` (so a broken symlink counts as existing — it's revealed
 * on click). Concurrent probes of the SAME path are coalesced into one lstat, bounded by the semaphore.
 */
const MAX_INFLIGHT_PROBES = 256
const inFlightProbes = new Map<string, Promise<boolean>>()
function probeExists(abs: string): Promise<boolean | null> {
  const existing = inFlightProbes.get(abs)
  if (existing) return existing
  // Bound total distinct in-flight probes: under heavy load on a slow volume, decline rather than
  // growing the queue unboundedly. `null` (NOT false) says "didn't look" — reporting a declined
  // probe as absent would be a wrong answer the renderer then caches for a whole negative TTL,
  // hiding a link on an existing file well after the pressure cleared.
  if (inFlightProbes.size >= MAX_INFLIGHT_PROBES) return Promise.resolve(null)
  const p = withProbeSlot(async () => {
    try {
      await lstat(abs)
      return true
    } catch {
      return false
    }
  }).finally(() => inFlightProbes.delete(abs))
  inFlightProbes.set(abs, p)
  return p
}

/**
 * Read-only existence probe for the terminal file-path link provider (#153): it only underlines
 * paths that actually exist. Returns one entry per input, in input order — `true`/`false` for a
 * completed probe, `null` when the path was unusable or main declined to probe under load, which
 * the renderer treats as "ask again" rather than caching as absent.
 *
 * This is an arbitrary-path existence oracle for the renderer. That is acceptable here because
 * the renderer is first-party app code, not a web view of untrusted content — but it is the only
 * handler of its kind, so the boundary is stated rather than assumed. It never reads file
 * CONTENT, and every path is re-resolved here from `baseCwd`; the renderer's own resolution is
 * never trusted.
 */
async function pathExistsHandler(ctx: HandlerContext, paths: unknown, baseCwd: unknown): Promise<(boolean | null)[]> {
  if (!Array.isArray(paths)) return []
  const inputs = paths.slice(0, MAX_PATHS_PER_CALL)
  if (ctx.isE2ETest) return inputs.map(() => false)

  const resolved = inputs.map((p) => resolveTerminalPath(p, baseCwd))
  const unique = [...new Set(resolved.filter((p): p is string => p !== null))]
  const results = await Promise.all(unique.map((abs) => probeExists(abs)))
  const existsByAbs = new Map(unique.map((abs, i) => [abs, results[i]]))
  return resolved.map((abs) => (abs === null ? false : existsByAbs.get(abs) ?? null))
}

/**
 * Open a file path clicked in the terminal (#153): documents/media → OS default app; anything else
 * (source, symlink, directory, unknown ext) → reveal in the file manager. `lstat` never follows a
 * symlink, so a symlink is never `isFile()` and reveals rather than opens (see the TOCTOU note below).
 */
async function openPathHandler(ctx: HandlerContext, rawPath: unknown, baseCwd: unknown): Promise<OpenPathResult> {
  if (ctx.isE2ETest) return { action: 'none' }
  const abs = resolveTerminalPath(rawPath, baseCwd)
  if (!abs) return { action: 'none' }

  let stats
  try {
    stats = await lstat(abs)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ENOTDIR') return { action: 'none' }
    return { action: 'failed', error: String(err) }
  }

  // TOCTOU note: `abs` could be swapped between this lstat and the open/reveal below. Accepted: the
  // allowlist is a CONVENIENCE (don't auto-open source/executables on a mis-click), not a security
  // boundary — the agent that printed the path already has full shell access and gains nothing by
  // racing a replacement it could just execute directly. openPath uses the OS default app, exactly
  // like a Finder double-click. Dispatch is guarded so a failure returns `failed`, never rejects.
  try {
    if (!stats.isFile() || !isNativeOpen(abs)) {
      shell.showItemInFolder(abs)
      return { action: 'revealed' }
    }
    const error = await shell.openPath(abs)
    return error ? { action: 'failed', error } : { action: 'opened' }
  } catch (err) {
    return { action: 'failed', error: String(err) }
  }
}

/**
 * Open a directory's *contents* in the OS file manager (Finder / Explorer / Files). Used by the
 * session card's right-click "Open in <file manager>". Distinct from `shell:openPath`, which
 * *reveals* a directory (selects it in its parent) — here we open the folder itself. `stat`
 * follows symlinks so a symlinked worktree still opens, and only directories are opened (never a
 * stray file). Returns an `OpenPathResult` so the renderer can surface a real failure.
 */
async function openInFileManagerHandler(ctx: HandlerContext, rawPath: unknown): Promise<OpenPathResult> {
  if (ctx.isE2ETest) return { action: 'none' }
  if (typeof rawPath !== 'string' || rawPath.length === 0 || rawPath.length > MAX_PATH_LEN || CONTROL_CHARS.test(rawPath)) {
    return { action: 'none' }
  }
  const abs = expandHomePath(rawPath)
  if (!isAbsolute(abs)) return { action: 'none' }

  let stats
  try {
    stats = await stat(abs)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ENOTDIR') return { action: 'none' }
    return { action: 'failed', error: String(err) }
  }
  if (!stats.isDirectory()) return { action: 'none' }

  try {
    const error = await shell.openPath(abs)
    return error ? { action: 'failed', error } : { action: 'opened' }
  } catch (err) {
    return { action: 'failed', error: String(err) }
  }
}

export function register(ipcMain: IpcMain, ctx: HandlerContext): void {
  ipcMain.handle('shell:exec', async (_event, command: string, cwd: string) => {
    if (ctx.isE2ETest && !ctx.e2eRealRepos) {
      return { success: true, stdout: '', stderr: '', exitCode: 0 }
    }

    return new Promise<{ success: boolean; stdout: string; stderr: string; exitCode: number }>((resolve) => {
      exec(command, { cwd: expandHomePath(cwd), shell: getExecShell(), timeout: 300000 }, (error, stdout, stderr) => {
        const exitCode = error ? error.code ?? 1 : 0
        resolve({
          success: !error,
          stdout: stdout || '',
          stderr: stderr || '',
          exitCode: typeof exitCode === 'number' ? exitCode : 1,
        })
      })
    })
  })

  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    if (ctx.isE2ETest) {
      return
    }
    // Refuse anything that isn't http(s): agent output / repo content is untrusted, and
    // every in-app caller already passes http(s). Silent in production, like the other
    // guarded handlers, but noisy in dev so a mis-formed caller isn't a button that does nothing.
    const safeUrl = toHttpUrl(url)
    if (!safeUrl) {
      if (isDev) console.warn('[shell] refused to open non-http(s) URL:', url)
      return
    }
    await shell.openExternal(safeUrl)
  })

  // Terminal file-path links (#153): a read-only existence probe for the hover provider, and the
  // click handler that opens documents/media (default app) or reveals everything else in Finder.
  ipcMain.handle('shell:pathExists', (_event, paths: unknown, baseCwd: unknown) => pathExistsHandler(ctx, paths, baseCwd))
  ipcMain.handle('shell:openPath', (_event, rawPath: unknown, baseCwd: unknown) => openPathHandler(ctx, rawPath, baseCwd))
  ipcMain.handle('shell:openInFileManager', (_event, rawPath: unknown) => openInFileManagerHandler(ctx, rawPath))

  ipcMain.handle('shells:list', (_event) => {
    if (ctx.isE2ETest) {
      const defaultPath = getDefaultShell()
      return [
        { path: defaultPath, name: 'Default Shell', isDefault: true },
        { path: '/bin/bash', name: 'Bash', isDefault: false },
        { path: '/bin/sh', name: 'sh', isDefault: false },
      ]
    }
    return getAvailableShells()
  })

  ipcMain.handle('dialog:openFolder', async (_event) => {
    const senderWindow = BrowserWindow.fromWebContents(_event.sender) || ctx.mainWindow
    const result = await dialog.showOpenDialog(senderWindow!, {
      properties: ['openDirectory'],
      title: 'Select a Git Repository',
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return normalizePath(result.filePaths[0])
  })

  ipcMain.handle('dialog:saveFile', async (_event, options: { defaultPath?: string; title?: string; filters?: { name: string; extensions: string[] }[] } = {}) => {
    if (ctx.isE2ETest) return null
    const senderWindow = BrowserWindow.fromWebContents(_event.sender) || ctx.mainWindow
    const result = await dialog.showSaveDialog(senderWindow!, {
      defaultPath: options.defaultPath,
      title: options.title,
      filters: options.filters,
    })
    if (result.canceled || !result.filePath) return null
    return result.filePath
  })

  ipcMain.handle('menu:appMenuPopup', async (_event) => {
    if (ctx.isE2ETest) {
      return null
    }
    const senderWindow = BrowserWindow.fromWebContents(_event.sender) || ctx.mainWindow
    return new Promise<string | null>((resolve) => {
      const template: Electron.MenuItemConstructorOptions[] = [
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
              click: () => {
                senderWindow?.webContents.send('menu:select-all')
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
            // Same persisted items as the app menu — the two must not drift apart.
            ...zoomMenuItems(ctx),
            { type: 'separator' as const },
            { role: 'togglefullscreen' as const },
          ],
        },
        {
          label: 'Window',
          submenu: [
            { role: 'minimize' },
            { role: 'zoom' },
            { role: 'close' },
          ],
        },
        {
          label: 'Help',
          submenu: [
            { label: 'Getting Started', click: () => resolve('help:getting-started') },
            { label: 'Keyboard Shortcuts', click: () => resolve('help:shortcuts') },
            { type: 'separator' },
            { label: 'Reset Tutorial Progress', click: () => resolve('help:reset-tutorial') },
            { type: 'separator' },
            { label: 'Check for Updates...', click: () => resolve('check-for-updates') },
            { type: 'separator' },
            {
              label: 'Report Issue...',
              click: () => {
                void shell.openExternal('https://github.com/Broomy-AI/broomy/issues')
                resolve(null)
              },
            },
          ],
        },
        { type: 'separator' },
        { label: 'Configure Toolbar...', click: () => resolve('configure-toolbar') },
        { label: 'About Broomy', click: () => resolve('about') },
      ]

      const menu = Menu.buildFromTemplate(template)
      menu.popup({
        window: senderWindow!,
        callback: () => {
          resolve(null)
        },
      })
    })
  })

  ipcMain.handle('window:minimize', (_event) => {
    if (ctx.isE2ETest) return
    BrowserWindow.fromWebContents(_event.sender)?.minimize()
  })

  ipcMain.handle('window:maximize', (_event) => {
    if (ctx.isE2ETest) return
    const win = BrowserWindow.fromWebContents(_event.sender)
    if (win?.isMaximized()) {
      win.unmaximize()
    } else {
      win?.maximize()
    }
  })

  ipcMain.handle('window:close', (_event) => {
    if (ctx.isE2ETest) return
    BrowserWindow.fromWebContents(_event.sender)?.close()
  })

  ipcMain.handle('menu:popup', async (_event, items: { id: string; label: string; enabled?: boolean; type?: 'separator' }[]) => {
    const senderWindow = BrowserWindow.fromWebContents(_event.sender) || ctx.mainWindow
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
          resolve(null)
        },
      })
    })
  })
}
