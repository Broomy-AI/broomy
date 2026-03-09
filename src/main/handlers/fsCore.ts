/**
 * IPC handlers for core filesystem operations.
 *
 * Provides directory listing, file read/write, rename, delete, and
 * filesystem watching with change events streamed to the renderer.
 */
import { BrowserWindow, IpcMain, IpcMainInvokeEvent } from 'electron'
import { watch } from 'fs'
import { readdir, readFile, writeFile, appendFile, stat, mkdir, rm, access, rename } from 'fs/promises'
import { join } from 'path'
import { normalizePath } from '../platform'
import { HandlerContext } from './types'
import { getScenarioData, SHARED_README } from './scenarios'

async function handleReadDir(ctx: HandlerContext, dirPath: string) {
  if (ctx.isE2ETest && !ctx.e2eRealRepos) {
    const scenario = getScenarioData(ctx.e2eScenario)
    const entries = scenario.fileTree.readDir(dirPath)
    if (entries) {
      return entries.map(e => ({ name: e.name, path: join(dirPath, e.name), isDirectory: e.isDirectory }))
    }
    return [
      { name: 'src', path: join(dirPath, 'src'), isDirectory: true },
      { name: 'package.json', path: join(dirPath, 'package.json'), isDirectory: false },
      { name: 'README.md', path: join(dirPath, 'README.md'), isDirectory: false },
    ]
  }

  try {
    const entries = await readdir(dirPath, { withFileTypes: true })
    return entries
      .filter((entry) => entry.name !== '.git')
      .map((entry) => ({
        name: entry.name,
        path: normalizePath(join(dirPath, entry.name)),
        isDirectory: entry.isDirectory(),
      }))
      .sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1
        if (!a.isDirectory && b.isDirectory) return 1
        return a.name.localeCompare(b.name)
      })
  } catch {
    return []
  }
}

async function handleReadFile(ctx: HandlerContext, filePath: string) {
  if (ctx.isE2ETest && !ctx.e2eRealRepos) {
    const scenario = getScenarioData(ctx.e2eScenario)
    const scenarioContent = scenario.readFile(filePath)
    if (scenarioContent !== null) return scenarioContent
    if (filePath.endsWith('README.md')) return SHARED_README
    return '// Mock file content for E2E tests\nexport const test = true;\n'
  }

  try {
    await access(filePath)
  } catch {
    throw new Error(`File not found: ${filePath}`)
  }
  const stats = await stat(filePath)
  if (stats.isDirectory()) {
    throw new Error('Cannot read directory as file')
  }
  if (stats.size > 5 * 1024 * 1024) {
    throw new Error('File is too large to display')
  }
  return readFile(filePath, 'utf-8')
}

async function handleWriteFile(ctx: HandlerContext, filePath: string, content: string) {
  if (ctx.isE2ETest && !ctx.e2eRealRepos) {
    return { success: true }
  }

  try {
    await writeFile(filePath, content, 'utf-8')
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

async function handleAppendFile(ctx: HandlerContext, filePath: string, content: string) {
  if (ctx.isE2ETest && !ctx.e2eRealRepos) {
    return { success: true }
  }

  try {
    await appendFile(filePath, content, 'utf-8')
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

async function handleExists(ctx: HandlerContext, filePath: string) {
  if (ctx.isE2ETest) {
    // Check if scenario has marketing review files in tmp dir
    if (getScenarioData(ctx.e2eScenario).hasMarketingReviewFiles && /\/tmp\/broomy-review-[^/]+\/(review|comments)\.json$/.exec(filePath)) {
      return true
    }
    // Review/comments files always exist for mock data in any scenario
    if (/\.broomy[/\\]output[/\\](review|comments)\.json$/.exec(filePath)) {
      return true
    }
    if (/\.broomy[/\\](output[/\\])?review\.md$/.exec(filePath)) {
      return true
    }
    // Fall through to real fs for other paths (e.g. .git directory checks)
  }
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function handleMkdir(ctx: HandlerContext, dirPath: string) {
  if (ctx.isE2ETest && !ctx.e2eRealRepos) {
    return { success: true }
  }

  try {
    try {
      await access(dirPath)
      return { success: false, error: 'Directory already exists' }
    } catch {
      // does not exist, proceed
    }
    await mkdir(dirPath, { recursive: true })
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

async function handleRm(ctx: HandlerContext, targetPath: string) {
  if (ctx.isE2ETest && !ctx.e2eRealRepos) {
    return { success: true }
  }

  try {
    try {
      await access(targetPath)
    } catch {
      return { success: true }
    }
    await rm(targetPath, { recursive: true, force: true })
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

async function handleRename(ctx: HandlerContext, oldPath: string, newPath: string) {
  if (ctx.isE2ETest && !ctx.e2eRealRepos) {
    return { success: true }
  }

  try {
    await rename(oldPath, newPath)
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

async function handleCreateFile(ctx: HandlerContext, filePath: string) {
  if (ctx.isE2ETest && !ctx.e2eRealRepos) {
    return { success: true }
  }

  try {
    try {
      await access(filePath)
      return { success: false, error: 'File already exists' }
    } catch {
      // does not exist, proceed
    }
    await writeFile(filePath, '')
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

async function handleReadFileBase64(ctx: HandlerContext, filePath: string) {
  if (ctx.isE2ETest && !ctx.e2eRealRepos) {
    return 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  }

  try {
    await access(filePath)
  } catch {
    throw new Error(`File not found: ${filePath}`)
  }
  const stats = await stat(filePath)
  if (stats.isDirectory()) {
    throw new Error('Cannot read directory as file')
  }
  if (stats.size > 10 * 1024 * 1024) {
    throw new Error('File is too large to display')
  }
  const buffer = await readFile(filePath)
  return buffer.toString('base64')
}

const MAX_WATCHERS = 8

async function handleWatch(ctx: HandlerContext, _event: IpcMainInvokeEvent, id: string, watchPath: string) {
  if (ctx.isE2ETest && !ctx.e2eRealRepos) {
    return { success: true }
  }

  const senderWindow = BrowserWindow.fromWebContents(_event.sender)

  const existingWatcher = ctx.fileWatchers.get(id)
  if (existingWatcher) {
    existingWatcher.close()
  } else if (ctx.fileWatchers.size >= MAX_WATCHERS) {
    console.error(`File watcher limit reached (${MAX_WATCHERS}), refusing new watcher: ${id}`)
    return { success: false, error: 'Too many file watchers' }
  }

  if (senderWindow) {
    ctx.watcherOwnerWindows.set(id, senderWindow)
  }

  try {
    await access(watchPath)
  } catch {
    // Path doesn't exist yet — not an error, just nothing to watch
    return { success: false, error: 'Path does not exist' }
  }

  try {
    const watcher = watch(watchPath, (eventType, filename) => {
      const ownerWindow = ctx.watcherOwnerWindows.get(id) || ctx.mainWindow
      if (ownerWindow && !ownerWindow.isDestroyed()) {
        ownerWindow.webContents.send(`fs:change:${id}`, { eventType, filename })
      }
    })

    ctx.fileWatchers.set(id, watcher)

    watcher.on('error', (error) => {
      console.error(`[fs:watch] Watcher error for ${id}:`, error)
      const ownerWindow = ctx.watcherOwnerWindows.get(id) || ctx.mainWindow
      if (ownerWindow && !ownerWindow.isDestroyed()) {
        ownerWindow.webContents.send(`fs:watchError:${id}`, String(error))
      }
      watcher.close()
      ctx.fileWatchers.delete(id)
      ctx.watcherOwnerWindows.delete(id)
    })

    return { success: true }
  } catch (error) {
    console.error('Failed to start file watcher:', error)
    return { success: false, error: String(error) }
  }
}

function handleUnwatch(ctx: HandlerContext, id: string) {
  const watcher = ctx.fileWatchers.get(id)
  if (watcher) {
    watcher.close()
    ctx.fileWatchers.delete(id)
    ctx.watcherOwnerWindows.delete(id)
  }
  return { success: true }
}

export function register(ipcMain: IpcMain, ctx: HandlerContext): void {
  ipcMain.handle('fs:readDir', (_event, dirPath: string) => handleReadDir(ctx, dirPath))
  ipcMain.handle('fs:readFile', (_event, filePath: string) => handleReadFile(ctx, filePath))
  ipcMain.handle('fs:writeFile', (_event, filePath: string, content: string) => handleWriteFile(ctx, filePath, content))
  ipcMain.handle('fs:appendFile', (_event, filePath: string, content: string) => handleAppendFile(ctx, filePath, content))
  ipcMain.handle('fs:exists', (_event, filePath: string) => handleExists(ctx, filePath))
  ipcMain.handle('fs:mkdir', (_event, dirPath: string) => handleMkdir(ctx, dirPath))
  ipcMain.handle('fs:rm', (_event, targetPath: string) => handleRm(ctx, targetPath))
  ipcMain.handle('fs:rename', (_event, oldPath: string, newPath: string) => handleRename(ctx, oldPath, newPath))
  ipcMain.handle('fs:createFile', (_event, filePath: string) => handleCreateFile(ctx, filePath))
  ipcMain.handle('fs:readFileBase64', (_event, filePath: string) => handleReadFileBase64(ctx, filePath))
  ipcMain.handle('fs:watch', (_event, id: string, watchPath: string) => handleWatch(ctx, _event, id, watchPath))
  ipcMain.handle('fs:unwatch', (_event, id: string) => handleUnwatch(ctx, id))
}
