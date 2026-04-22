/**
 * IPC handlers for configuration persistence, profile management, and init scripts.
 *
 * Handles reading/writing per-profile config files, migrating legacy configs
 * to the profiles system, and managing agent init scripts.
 */
import { IpcMain } from 'electron'
import { existsSync, mkdirSync, writeFileSync, copyFileSync, readdirSync } from 'fs'
import { readFile, writeFile, rename, copyFile, mkdir, access, readdir } from 'fs/promises'
import { join } from 'path'
import { makeExecutable } from '../platform'
import {
  HandlerContext,
  CONFIG_DIR,
  PROFILES_DIR,
  PROFILES_FILE,
  getConfigFileName,
  getProfileConfigFile,
  getProfileInitScriptsDir,
  validateProfileId,
  DEFAULT_AGENTS,
  DEFAULT_PROFILES,
  getE2EDemoRepos,
} from './types'
import { getScenarioData } from './scenarios'
import { isWindows, normalizePath } from '../platform'
import { tmpdir } from 'os'

// Legacy config file (pre-profiles)
function getLegacyConfigFile(isDev: boolean): string {
  return join(CONFIG_DIR, getConfigFileName(isDev))
}

// Migrate legacy config to default profile (one-time migration)
// Stays sync because it runs once at startup before any IPC handlers
function migrateToProfiles(isE2ETest: boolean, isDev: boolean): void {
  if (isE2ETest) return

  // Already migrated if profiles.json exists
  if (existsSync(PROFILES_FILE)) return

  const legacyConfigFile = getLegacyConfigFile(isDev)

  // Create profiles directory
  const defaultProfileDir = join(PROFILES_DIR, 'default')
  mkdirSync(defaultProfileDir, { recursive: true })

  // Move legacy config if it exists
  if (existsSync(legacyConfigFile)) {
    copyFileSync(legacyConfigFile, join(defaultProfileDir, getConfigFileName(isDev)))
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

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function loadConfigFile(configFile: string): Promise<Record<string, unknown>> {
  try {
    if (!await fileExists(configFile)) {
      return { agents: DEFAULT_AGENTS, sessions: [] }
    }
    const data = await readFile(configFile, 'utf-8')
    const config = JSON.parse(data)
    // Ensure agents array exists with defaults
    if (!config.agents || config.agents.length === 0) {
      config.agents = DEFAULT_AGENTS
    } else {
      const defaultsById = new Map(DEFAULT_AGENTS.map((a) => [a.id, a]))
      const existingIds = new Set(config.agents.map((a: { id: string }) => a.id))
      for (const defaultAgent of DEFAULT_AGENTS) {
        if (!existingIds.has(defaultAgent.id)) {
          config.agents.push(defaultAgent)
        }
      }
      for (const agent of config.agents) {
        const def = defaultsById.get(agent.id)
        if (def && 'skipApprovalFlag' in def && !agent.skipApprovalFlag) {
          agent.skipApprovalFlag = def.skipApprovalFlag
        }
      }
    }
    return config
  } catch {
    const backupFile = `${configFile}.backup`
    try {
      if (await fileExists(backupFile)) {
        console.warn(`[config:load] Primary config corrupt, falling back to backup: ${backupFile}`)
        const data = await readFile(backupFile, 'utf-8')
        const config = JSON.parse(data)
        if (!config.agents || config.agents.length === 0) {
          config.agents = DEFAULT_AGENTS
        }
        config.recovered = 'backup'
        return config
      }
    } catch {
      // backup also failed
    }
    return { agents: DEFAULT_AGENTS, sessions: [], recovered: 'defaults' }
  }
}

type ProfilesData = { profiles: { id: string; name: string; color: string }[]; lastProfileId: string }

// Atomic write for profiles.json: write to tmp, backup current, rename tmp → profiles.json
async function atomicWriteProfiles(data: ProfilesData): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true })
  const tmpFile = `${PROFILES_FILE}.tmp`
  const backupFile = `${PROFILES_FILE}.backup`
  await writeFile(tmpFile, JSON.stringify(data, null, 2))
  if (await fileExists(PROFILES_FILE)) {
    await copyFile(PROFILES_FILE, backupFile)
  }
  await rename(tmpFile, PROFILES_FILE)
}

// Try to derive a human-readable profile name from its config file
async function deriveProfileName(dirName: string, isDev: boolean): Promise<string> {
  const fallback = dirName === 'default' ? 'Default' : dirName
  for (const dev of [isDev, !isDev]) {
    const configFile = getProfileConfigFile(dirName, dev)
    if (await fileExists(configFile)) {
      const raw = await readFile(configFile, 'utf-8')
      const config = JSON.parse(raw)
      if (config.agents?.[0]?.name) {
        return config.agents[0].name.replace(/^Claude\s+/i, '') || fallback
      }
    }
  }
  return fallback
}

// Scan profile directories and reconcile any missing from profiles.json
async function reconcileOrphanProfiles(data: ProfilesData, isDev: boolean): Promise<boolean> {
  if (!await fileExists(PROFILES_DIR)) return false
  const entries = await readdir(PROFILES_DIR, { withFileTypes: true })
  const knownIds = new Set(data.profiles.map(p => p.id))
  let reconciled = false
  for (const entry of entries) {
    if (!entry.isDirectory() || knownIds.has(entry.name)) continue
    let name: string
    try {
      name = await deriveProfileName(entry.name, isDev)
    } catch {
      name = entry.name
    }
    console.warn(`[profiles:list] Recovered orphan profile directory: ${entry.name} (name: ${name})`)
    data.profiles.push({ id: entry.name, name, color: '#6b7280' })
    reconciled = true
  }
  return reconciled
}

export function register(ipcMain: IpcMain, ctx: HandlerContext): void {
  const legacyConfigFile = getLegacyConfigFile(ctx.isDev)

  // Run migration at registration time
  migrateToProfiles(ctx.isE2ETest, ctx.isDev)

  // Create E2E test directories if in E2E mode
  if (ctx.isE2ETest) {
    const sessions = getScenarioData(ctx.e2eScenario).sessions
    for (const session of sessions) {
      if (!existsSync(session.directory)) {
        mkdirSync(session.directory, { recursive: true })
      }
    }
  }

  // Track how many profiles were loaded so we can guard against saving fewer
  let loadedProfileCount = 0

  // Profiles IPC handlers
  ipcMain.handle('profiles:list', async () => {
    if (ctx.isE2ETest) {
      return DEFAULT_PROFILES
    }

    let data: ProfilesData | null = null

    // Try primary file, then backup
    try {
      if (await fileExists(PROFILES_FILE)) {
        data = JSON.parse(await readFile(PROFILES_FILE, 'utf-8'))
      }
    } catch {
      const backupFile = `${PROFILES_FILE}.backup`
      try {
        if (await fileExists(backupFile)) {
          console.warn('[profiles:list] Primary profiles.json corrupt, falling back to backup')
          data = JSON.parse(await readFile(backupFile, 'utf-8'))
        }
      } catch {
        // backup also corrupt
      }
    }

    if (!data) {
      data = { ...DEFAULT_PROFILES, profiles: [...DEFAULT_PROFILES.profiles] }
    }

    // Track loaded count for save guard
    loadedProfileCount = Math.max(loadedProfileCount, data.profiles.length)

    // Self-healing: scan profile directories and reconcile any missing from profiles.json
    try {
      if (await reconcileOrphanProfiles(data, ctx.isDev)) {
        await atomicWriteProfiles(data)
      }
    } catch {
      // scan failed — return what we have
    }

    return data
  })

  ipcMain.handle('profiles:save', async (_event, data: { profiles: { id: string; name: string; color: string }[]; lastProfileId: string }) => {
    if (ctx.isE2ETest) {
      return { success: true }
    }

    // Save guard: refuse to persist fewer profiles than were loaded from disk.
    // This prevents bugs (e.g. failed load returning DEFAULT_PROFILES) from overwriting real data.
    if (data.profiles.length < loadedProfileCount && loadedProfileCount > 1) {
      console.warn(
        `[profiles:save] Save guard: refusing to save ${data.profiles.length} profiles ` +
        `(${loadedProfileCount} were loaded from disk)`
      )
      return { success: false, error: 'Save guard: would lose profiles' }
    }

    try {
      await atomicWriteProfiles(data)
      loadedProfileCount = Math.max(loadedProfileCount, data.profiles.length)
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('profiles:openWindow', (_event, profileId: string) => {
    // Check if a window is already open for this profile
    const existing = ctx.profileWindows.get(profileId)
    if (existing && !existing.isDestroyed()) {
      existing.focus()
      return { success: true, alreadyOpen: true }
    }

    // We need the createWindow function from the main module
    // This is handled by passing it through context or having the main module
    // register this handler itself. For now, we emit an event.
    // Actually, the plan says profiles:openWindow needs createWindow access.
    // We'll handle this by having createWindow passed via context.
    try {
      if ((ctx as HandlerContext & { createWindow?: (profileId?: string) => void }).createWindow) {
        (ctx as HandlerContext & { createWindow?: (profileId?: string) => void }).createWindow!(profileId)
      }
    } catch (err) {
      console.error('[profiles:openWindow] Failed to create window:', err)
      return { success: false, error: String(err) }
    }
    return { success: true, alreadyOpen: false }
  })

  ipcMain.handle('profiles:getOpenProfiles', () => {
    const openProfiles: string[] = []
    for (const [profileId, window] of ctx.profileWindows) {
      if (!window.isDestroyed()) {
        openProfiles.push(profileId)
      }
    }
    return openProfiles
  })

  // Serialized write queue per config file path — prevents concurrent writes
  const writeQueues = new Map<string, Promise<void>>()

  function enqueueWrite(configFile: string, fn: () => Promise<void>): Promise<void> {
    const prev = writeQueues.get(configFile) ?? Promise.resolve()
    const next = prev.then(fn, fn) // run even if previous write failed
    writeQueues.set(configFile, next)
    return next
  }

  // Config IPC handlers - now profile-aware
  ipcMain.handle('config:load', async (_event, profileId?: string) => {
    // In E2E test mode, return demo sessions for consistent testing
    if (ctx.isE2ETest) {
      return {
        agents: DEFAULT_AGENTS,
        sessions: getScenarioData(ctx.e2eScenario).sessions,
        repos: getE2EDemoRepos(),
        defaultCloneDir: normalizePath(join(tmpdir(), 'broomy-e2e-repos')),
      }
    }

    const configFile = profileId ? getProfileConfigFile(profileId, ctx.isDev) : legacyConfigFile
    return loadConfigFile(configFile)
  })

  ipcMain.handle('config:save', async (_event, config: { profileId?: string; agents?: unknown[]; sessions: unknown[]; repos?: unknown[]; defaultCloneDir?: string; defaultShell?: string; showSidebar?: boolean; sidebarWidth?: number; toolbarPanels?: string[] }) => {
    // Don't save config during E2E tests to avoid polluting real config
    if (ctx.isE2ETest) {
      return { success: true }
    }

    const configFile = config.profileId ? getProfileConfigFile(config.profileId, ctx.isDev) : legacyConfigFile
    const configDir = config.profileId ? (validateProfileId(config.profileId), join(PROFILES_DIR, config.profileId)) : CONFIG_DIR

    try {
      await enqueueWrite(configFile, async () => {
        if (!await fileExists(configDir)) {
          await mkdir(configDir, { recursive: true })
        }
        // Read existing config to preserve unknown fields (future-proofing)
        let existingConfig: Record<string, unknown> = {}
        if (await fileExists(configFile)) {
          try {
            existingConfig = JSON.parse(await readFile(configFile, 'utf-8'))
          } catch {
            // ignore corrupt file — we'll overwrite it
          }
        }
        const configToSave: Record<string, unknown> = {
          ...existingConfig,
          agents: config.agents || DEFAULT_AGENTS,
          sessions: config.sessions,
        }
        // Renderer now sends complete state for these fields
        if (config.repos !== undefined) configToSave.repos = config.repos
        if (config.defaultCloneDir !== undefined) configToSave.defaultCloneDir = config.defaultCloneDir
        if (config.defaultShell !== undefined) configToSave.defaultShell = config.defaultShell
        if (config.showSidebar !== undefined) configToSave.showSidebar = config.showSidebar
        if (config.sidebarWidth !== undefined) configToSave.sidebarWidth = config.sidebarWidth
        if (config.toolbarPanels !== undefined) configToSave.toolbarPanels = config.toolbarPanels

        const tmpFile = `${configFile}.tmp`
        const backupFile = `${configFile}.backup`

        // Atomic write: write to tmp, backup current, rename tmp → config
        await writeFile(tmpFile, JSON.stringify(configToSave, null, 2))

        if (await fileExists(configFile)) {
          await copyFile(configFile, backupFile)
        }

        await rename(tmpFile, configFile)
      })
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  // Init script handlers - profile-aware
  ipcMain.handle('repos:getInitScript', async (_event, repoId: string, profileId?: string) => {
    if (ctx.isE2ETest) {
      return isWindows
        ? '@echo off\r\necho init script for E2E'
        : '#!/bin/sh\necho "init script for E2E"'
    }

    try {
      const initScriptsDir = profileId ? getProfileInitScriptsDir(profileId) : join(CONFIG_DIR, 'init-scripts')
      // Check for platform-appropriate extension first, then fall back
      const platformExt = isWindows ? '.bat' : '.sh'
      const fallbackExt = isWindows ? '.sh' : '.bat'
      let scriptPath = join(initScriptsDir, `${repoId}${platformExt}`)
      if (!await fileExists(scriptPath)) {
        scriptPath = join(initScriptsDir, `${repoId}${fallbackExt}`)
      }
      if (!await fileExists(scriptPath)) return null
      return await readFile(scriptPath, 'utf-8')
    } catch {
      return null
    }
  })

  ipcMain.handle('repos:saveInitScript', async (_event, repoId: string, script: string, profileId?: string) => {
    if (ctx.isE2ETest) {
      return { success: true }
    }

    try {
      const initScriptsDir = profileId ? getProfileInitScriptsDir(profileId) : join(CONFIG_DIR, 'init-scripts')
      if (!await fileExists(initScriptsDir)) {
        await mkdir(initScriptsDir, { recursive: true })
      }
      const scriptPath = join(initScriptsDir, isWindows ? `${repoId}.bat` : `${repoId}.sh`)
      await writeFile(scriptPath, script, 'utf-8')
      makeExecutable(scriptPath)
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })
}
