import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  copyFileSync: vi.fn(),
  readdirSync: vi.fn(),
}))

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  rename: vi.fn(),
  copyFile: vi.fn(),
  mkdir: vi.fn(),
}))

vi.mock('../platform', () => ({
  isWindows: false,
  normalizePath: (p: string) => p.replace(/\\/g, '/'),
  makeExecutable: vi.fn(),
}))

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'fs'
import { readFile, writeFile, rename, copyFile, mkdir } from 'fs/promises'
import { register } from './config'
import { DEFAULT_AGENTS, DEFAULT_PROFILES, HandlerContext } from './types'

function createMockCtx(overrides: Partial<HandlerContext> = {}): HandlerContext {
  return {
    isE2ETest: false,
    isScreenshotMode: false,
    isDev: false,
    isWindows: false,
    ptyProcesses: new Map(),
    ptyOwnerWindows: new Map(),
    fileWatchers: new Map(),
    watcherOwnerWindows: new Map(),
    profileWindows: new Map(),
    mainWindow: null,
    E2E_MOCK_SHELL: undefined,
    FAKE_CLAUDE_SCRIPT: undefined,
    ...overrides,
  }
}

function setupHandlers(ctx?: HandlerContext) {
  const handlers: Record<string, Function> = {}
  const mockIpcMain = {
    handle: vi.fn((channel: string, handler: Function) => {
      handlers[channel] = handler
    }),
  }
  register(mockIpcMain as never, ctx ?? createMockCtx())
  return handlers
}

describe('config handlers', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    // Default: profiles.json already exists (skip migration)
    vi.mocked(existsSync).mockReturnValue(true)
  })

  describe('registration', () => {
    it('registers all expected IPC channels', () => {
      const handlers = setupHandlers()
      expect(handlers['config:load']).toBeDefined()
      expect(handlers['config:save']).toBeDefined()
      expect(handlers['profiles:list']).toBeDefined()
      expect(handlers['profiles:save']).toBeDefined()
      expect(handlers['profiles:openWindow']).toBeDefined()
      expect(handlers['profiles:getOpenProfiles']).toBeDefined()
      expect(handlers['repos:getInitScript']).toBeDefined()
      expect(handlers['repos:saveInitScript']).toBeDefined()
    })
  })

  describe('profiles:list', () => {
    it('returns DEFAULT_PROFILES in E2E mode', () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = handlers['profiles:list']()
      expect(result).toEqual(DEFAULT_PROFILES)
    })

    it('reads profiles from file in normal mode', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      const mockProfiles = { profiles: [{ id: 'test', name: 'Test', color: '#fff' }], lastProfileId: 'test' }
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockProfiles))

      const handlers = setupHandlers()
      const result = handlers['profiles:list']()
      expect(result).toEqual(mockProfiles)
    })

    it('returns DEFAULT_PROFILES when profiles file does not exist', () => {
      // First call during registration migration check returns true, subsequent calls vary
      vi.mocked(existsSync).mockImplementation((path: unknown) => {
        if (String(path).endsWith('profiles.json')) return false
        return true
      })
      const handlers = setupHandlers()
      const result = handlers['profiles:list']()
      expect(result).toEqual(DEFAULT_PROFILES)
    })

    it('returns DEFAULT_PROFILES on parse error', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue('not json')

      const handlers = setupHandlers()
      const result = handlers['profiles:list']()
      expect(result).toEqual(DEFAULT_PROFILES)
    })
  })

  describe('profiles:save', () => {
    it('returns success in E2E mode without writing', () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = handlers['profiles:save'](null, { profiles: [], lastProfileId: 'x' })
      expect(result).toEqual({ success: true })
      expect(writeFileSync).not.toHaveBeenCalled()
    })

    it('writes profiles to file in normal mode', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      const handlers = setupHandlers()
      const data = { profiles: [{ id: 'p1', name: 'Profile 1', color: '#f00' }], lastProfileId: 'p1' }
      const result = handlers['profiles:save'](null, data)
      expect(result).toEqual({ success: true })
      expect(writeFileSync).toHaveBeenCalledWith(expect.any(String), JSON.stringify(data, null, 2))
    })

    it('returns error when write fails', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(writeFileSync).mockImplementation(() => { throw new Error('disk full') })
      const handlers = setupHandlers()
      const result = handlers['profiles:save'](null, { profiles: [], lastProfileId: 'x' })
      expect(result).toEqual({ success: false, error: expect.stringContaining('disk full') })
    })
  })

  describe('profiles:openWindow', () => {
    it('focuses existing window if already open', () => {
      const ctx = createMockCtx()
      const mockWindow = { isDestroyed: () => false, focus: vi.fn() }
      ctx.profileWindows.set('test-profile', mockWindow as never)

      const handlers = setupHandlers(ctx)
      const result = handlers['profiles:openWindow'](null, 'test-profile')
      expect(result).toEqual({ success: true, alreadyOpen: true })
      expect(mockWindow.focus).toHaveBeenCalled()
    })

    it('calls createWindow when context has it', () => {
      const createWindow = vi.fn()
      const ctx = createMockCtx() as HandlerContext & { createWindow: Function }
      ;(ctx as unknown as { createWindow: Function }).createWindow = createWindow

      const handlers = setupHandlers(ctx)
      const result = handlers['profiles:openWindow'](null, 'new-profile')
      expect(result).toEqual({ success: true, alreadyOpen: false })
      expect(createWindow).toHaveBeenCalledWith('new-profile')
    })
  })

  describe('profiles:getOpenProfiles', () => {
    it('returns list of open profile IDs', () => {
      const ctx = createMockCtx()
      ctx.profileWindows.set('p1', { isDestroyed: () => false } as never)
      ctx.profileWindows.set('p2', { isDestroyed: () => true } as never)
      ctx.profileWindows.set('p3', { isDestroyed: () => false } as never)

      const handlers = setupHandlers(ctx)
      const result = handlers['profiles:getOpenProfiles']()
      expect(result).toEqual(['p1', 'p3'])
    })
  })

  describe('config:load', () => {
    it('returns E2E demo data in E2E mode', () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = handlers['config:load'](null)
      expect(result).toHaveProperty('agents')
      expect(result).toHaveProperty('sessions')
      expect(result).toHaveProperty('repos')
      expect(result.agents).toEqual(DEFAULT_AGENTS)
    })

    it('returns default agents when config file does not exist', () => {
      vi.mocked(existsSync).mockImplementation((path: unknown) => {
        if (String(path).endsWith('profiles.json')) return true
        return false
      })

      const handlers = setupHandlers()
      const result = handlers['config:load'](null, 'default')
      expect(result).toEqual({ agents: DEFAULT_AGENTS, sessions: [] })
    })

    it('reads and returns config from file', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      const mockConfig = { agents: DEFAULT_AGENTS, sessions: [{ id: '1' }] }
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockConfig))

      const handlers = setupHandlers()
      const result = handlers['config:load'](null, 'default')
      expect(result.sessions).toHaveLength(1)
      expect(result.agents).toEqual(DEFAULT_AGENTS)
    })

    it('merges in new default agents that are not already present', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      const mockConfig = {
        agents: [{ id: 'claude', name: 'Claude', command: 'claude', color: '#D97757' }],
        sessions: [],
      }
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockConfig))

      const handlers = setupHandlers()
      const result = handlers['config:load'](null, 'default')
      // Should have the original claude + codex + gemini merged in
      expect(result.agents.length).toBeGreaterThan(1)
      const ids = result.agents.map((a: { id: string }) => a.id)
      expect(ids).toContain('codex')
      expect(ids).toContain('gemini')
    })

    it('falls back to backup on corrupt primary config', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      const backupConfig = { agents: DEFAULT_AGENTS, sessions: [{ id: 'backup' }] }
      vi.mocked(readFileSync).mockImplementation((path: unknown) => {
        if (String(path).endsWith('.backup')) return JSON.stringify(backupConfig)
        throw new Error('corrupt')
      })

      const handlers = setupHandlers()
      const result = handlers['config:load'](null, 'default')
      expect(result.sessions).toHaveLength(1)
      expect(result.sessions[0].id).toBe('backup')
    })

    it('returns defaults when both primary and backup fail', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockImplementation(() => { throw new Error('corrupt') })

      const handlers = setupHandlers()
      const result = handlers['config:load'](null, 'default')
      expect(result).toEqual({ agents: DEFAULT_AGENTS, sessions: [] })
    })
  })

  describe('config:save', () => {
    it('returns success without writing in E2E mode', async () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = await handlers['config:save'](null, { sessions: [] })
      expect(result).toEqual({ success: true })
    })

    it('writes config to file with atomic write pattern', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue('{}')
      vi.mocked(writeFile).mockResolvedValue(undefined)
      vi.mocked(copyFile).mockResolvedValue(undefined)
      vi.mocked(rename).mockResolvedValue(undefined)

      const handlers = setupHandlers()
      const result = await handlers['config:save'](null, {
        profileId: 'default',
        sessions: [{ id: '1' }],
        agents: DEFAULT_AGENTS,
      })
      expect(result).toEqual({ success: true })
      expect(writeFile).toHaveBeenCalledWith(expect.stringContaining('.tmp'), expect.any(String))
      expect(rename).toHaveBeenCalled()
    })

    it('creates directory if it does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false)
      vi.mocked(readFile).mockRejectedValue(new Error('not found'))
      vi.mocked(writeFile).mockResolvedValue(undefined)
      vi.mocked(rename).mockResolvedValue(undefined)
      vi.mocked(mkdir).mockResolvedValue(undefined)

      const handlers = setupHandlers()
      const result = await handlers['config:save'](null, {
        profileId: 'default',
        sessions: [],
      })
      expect(result).toEqual({ success: true })
      expect(mkdir).toHaveBeenCalledWith(expect.any(String), { recursive: true })
    })

    it('returns error when write fails', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue('{}')
      vi.mocked(writeFile).mockRejectedValue(new Error('disk full'))

      const handlers = setupHandlers()
      const result = await handlers['config:save'](null, {
        profileId: 'default',
        sessions: [],
      })
      expect(result).toEqual({ success: false, error: expect.stringContaining('disk full') })
    })

    it('preserves optional fields like repos and defaultCloneDir', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFile).mockResolvedValue('{}')
      vi.mocked(writeFile).mockResolvedValue(undefined)
      vi.mocked(copyFile).mockResolvedValue(undefined)
      vi.mocked(rename).mockResolvedValue(undefined)

      const handlers = setupHandlers()
      await handlers['config:save'](null, {
        profileId: 'default',
        sessions: [],
        repos: [{ id: 'r1' }],
        defaultCloneDir: '/tmp/repos',
        showSidebar: true,
        sidebarWidth: 300,
        toolbarPanels: ['panel1'],
      })

      const writtenJson = JSON.parse(vi.mocked(writeFile).mock.calls[0][1] as string)
      expect(writtenJson.repos).toEqual([{ id: 'r1' }])
      expect(writtenJson.defaultCloneDir).toBe('/tmp/repos')
      expect(writtenJson.showSidebar).toBe(true)
      expect(writtenJson.sidebarWidth).toBe(300)
      expect(writtenJson.toolbarPanels).toEqual(['panel1'])
    })
  })

  describe('repos:getInitScript', () => {
    it('returns mock script in E2E mode', () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = handlers['repos:getInitScript'](null, 'repo1')
      expect(result).toContain('echo')
    })

    it('reads init script from file system', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue('#!/bin/sh\necho hi')

      const handlers = setupHandlers()
      const result = handlers['repos:getInitScript'](null, 'repo1', 'default')
      expect(result).toBe('#!/bin/sh\necho hi')
    })

    it('returns null when script does not exist', () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const handlers = setupHandlers()
      const result = handlers['repos:getInitScript'](null, 'repo1', 'default')
      expect(result).toBeNull()
    })
  })

  describe('repos:saveInitScript', () => {
    it('returns success in E2E mode without writing', () => {
      const handlers = setupHandlers(createMockCtx({ isE2ETest: true }))
      const result = handlers['repos:saveInitScript'](null, 'repo1', '#!/bin/sh\necho hi')
      expect(result).toEqual({ success: true })
    })

    it('writes script to file system', () => {
      vi.mocked(existsSync).mockReturnValue(true)
      const handlers = setupHandlers()
      const result = handlers['repos:saveInitScript'](null, 'repo1', '#!/bin/sh\necho hi', 'default')
      expect(result).toEqual({ success: true })
      expect(writeFileSync).toHaveBeenCalled()
    })

    it('creates init-scripts directory if it does not exist', () => {
      vi.mocked(existsSync).mockImplementation((path: unknown) => {
        if (String(path).includes('init-scripts')) return false
        return true
      })

      const handlers = setupHandlers()
      handlers['repos:saveInitScript'](null, 'repo1', '#!/bin/sh\necho hi', 'default')
      expect(mkdirSync).toHaveBeenCalledWith(expect.stringContaining('init-scripts'), { recursive: true })
    })
  })

  describe('migration', () => {
    it('skips migration in E2E mode', () => {
      vi.mocked(existsSync).mockReturnValue(false)
      setupHandlers(createMockCtx({ isE2ETest: true }))
      // Should not have written profiles.json
      expect(writeFileSync).not.toHaveBeenCalledWith(
        expect.stringContaining('profiles.json'),
        expect.any(String),
      )
    })

    it('migrates legacy config to default profile', () => {
      // profiles.json does NOT exist, legacy config DOES exist
      vi.mocked(existsSync).mockImplementation((path: unknown) => {
        const p = String(path)
        if (p.endsWith('profiles.json')) return false
        if (p.includes('config.json') && !p.includes('profiles')) return true
        if (p.includes('init-scripts') && !p.includes('profiles')) return true
        return false
      })
      vi.mocked(readdirSync as unknown as () => string[]).mockReturnValue([])

      setupHandlers()
      // Should have created default profile directory
      expect(mkdirSync).toHaveBeenCalledWith(expect.stringContaining('default'), { recursive: true })
      // Should have written profiles.json with defaults
      expect(writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('profiles.json'),
        JSON.stringify(DEFAULT_PROFILES, null, 2),
      )
    })
  })
})
