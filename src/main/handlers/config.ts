import { IpcMain } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, readdirSync } from 'fs'
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
  DEFAULT_AGENTS,
  DEFAULT_PROFILES,
  getE2EDemoSessions,
  getE2EDemoRepos,
} from './types'
import { isWindows, normalizePath } from '../platform'
import { tmpdir } from 'os'

// Legacy config file (pre-profiles)
function getLegacyConfigFile(isDev: boolean): string {
  return join(CONFIG_DIR, getConfigFileName(isDev))
}

// Migrate legacy config to default profile (one-time migration)
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

export function register(ipcMain: IpcMain, ctx: HandlerContext): void {
  const legacyConfigFile = getLegacyConfigFile(ctx.isDev)

  // Run migration at registration time
  migrateToProfiles(ctx.isE2ETest, ctx.isDev)

  // Create E2E test directories if in E2E mode
  if (ctx.isE2ETest) {
    const sessions = getE2EDemoSessions(ctx.isScreenshotMode)
    for (const session of sessions) {
      if (!existsSync(session.directory)) {
        mkdirSync(session.directory, { recursive: true })
      }
    }
  }

  // Profiles IPC handlers
  ipcMain.handle('profiles:list', async () => {
    if (ctx.isE2ETest) {
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
    if (ctx.isE2ETest) {
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
    if ((ctx as HandlerContext & { createWindow?: (profileId?: string) => void }).createWindow) {
      (ctx as HandlerContext & { createWindow?: (profileId?: string) => void }).createWindow!(profileId)
    }
    return { success: true, alreadyOpen: false }
  })

  ipcMain.handle('profiles:getOpenProfiles', async () => {
    const openProfiles: string[] = []
    for (const [profileId, window] of ctx.profileWindows) {
      if (!window.isDestroyed()) {
        openProfiles.push(profileId)
      }
    }
    return openProfiles
  })

  // Config IPC handlers - now profile-aware
  ipcMain.handle('config:load', async (_event, profileId?: string) => {
    // In E2E test mode, return demo sessions for consistent testing
    if (ctx.isE2ETest) {
      return {
        agents: DEFAULT_AGENTS,
        sessions: getE2EDemoSessions(ctx.isScreenshotMode),
        repos: getE2EDemoRepos(),
        defaultCloneDir: normalizePath(join(tmpdir(), 'broomy-e2e-repos')),
      }
    }

    const configFile = profileId ? getProfileConfigFile(profileId, ctx.isDev) : legacyConfigFile
    try {
      if (!existsSync(configFile)) {
        return { agents: DEFAULT_AGENTS, sessions: [] }
      }
      const data = readFileSync(configFile, 'utf-8')
      const config = JSON.parse(data)
      // Ensure agents array exists with defaults
      if (!config.agents || config.agents.length === 0) {
        config.agents = DEFAULT_AGENTS
      } else {
        // Merge in any new default agents that aren't already present
        const existingIds = new Set(config.agents.map((a: { id: string }) => a.id))
        for (const defaultAgent of DEFAULT_AGENTS) {
          if (!existingIds.has(defaultAgent.id)) {
            config.agents.push(defaultAgent)
          }
        }
      }
      return config
    } catch {
      return { agents: DEFAULT_AGENTS, sessions: [] }
    }
  })

  ipcMain.handle('config:save', async (_event, config: { profileId?: string; agents?: unknown[]; sessions: unknown[]; repos?: unknown[]; defaultCloneDir?: string; showSidebar?: boolean; sidebarWidth?: number; toolbarPanels?: string[] }) => {
    // Don't save config during E2E tests to avoid polluting real config
    if (ctx.isE2ETest) {
      return { success: true }
    }

    const configFile = config.profileId ? getProfileConfigFile(config.profileId, ctx.isDev) : legacyConfigFile
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

  // Init script handlers - profile-aware
  ipcMain.handle('repos:getInitScript', async (_event, repoId: string, profileId?: string) => {
    if (ctx.isE2ETest) {
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
    if (ctx.isE2ETest) {
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
}
