import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies
vi.mock('os', () => ({
  homedir: vi.fn(() => '/mock/home'),
  tmpdir: vi.fn(() => '/mock/tmp'),
}))

vi.mock('../platform', () => ({
  normalizePath: vi.fn((p: string) => p.replace(/\\/g, '/')),
}))

import { register } from './app'
import type { HandlerContext } from './types'
import type { IpcMain } from 'electron'

describe('app handler register', () => {
  let mockIpcMain: { handle: ReturnType<typeof vi.fn> }
  let mockCtx: HandlerContext

  beforeEach(() => {
    mockIpcMain = {
      handle: vi.fn(),
    }
    mockCtx = {
      isDev: true,
      isE2ETest: false,
      isScreenshotMode: false,
      isWindows: false,
      ptyProcesses: new Map(),
      ptyOwnerWindows: new Map(),
      fileWatchers: new Map(),
      watcherOwnerWindows: new Map(),
      profileWindows: new Map(),
      mainWindow: null,
      E2E_MOCK_SHELL: undefined,
      FAKE_CLAUDE_SCRIPT: undefined,
    } as unknown as HandlerContext
  })

  it('registers app:isDev handler', () => {
    register(mockIpcMain as unknown as IpcMain, mockCtx)
    const calls = mockIpcMain.handle.mock.calls
    const channels = calls.map((c: unknown[]) => c[0])
    expect(channels).toContain('app:isDev')
  })

  it('registers app:homedir handler', () => {
    register(mockIpcMain as unknown as IpcMain, mockCtx)
    const channels = mockIpcMain.handle.mock.calls.map((c: unknown[]) => c[0])
    expect(channels).toContain('app:homedir')
  })

  it('registers app:platform handler', () => {
    register(mockIpcMain as unknown as IpcMain, mockCtx)
    const channels = mockIpcMain.handle.mock.calls.map((c: unknown[]) => c[0])
    expect(channels).toContain('app:platform')
  })

  it('registers app:tmpdir handler', () => {
    register(mockIpcMain as unknown as IpcMain, mockCtx)
    const channels = mockIpcMain.handle.mock.calls.map((c: unknown[]) => c[0])
    expect(channels).toContain('app:tmpdir')
  })

  it('registers exactly 4 handlers', () => {
    register(mockIpcMain as unknown as IpcMain, mockCtx)
    expect(mockIpcMain.handle).toHaveBeenCalledTimes(4)
  })

  it('app:isDev handler returns ctx.isDev', () => {
    register(mockIpcMain as unknown as IpcMain, mockCtx)
    const isDevCall = mockIpcMain.handle.mock.calls.find((c: unknown[]) => c[0] === 'app:isDev')
    const handler = isDevCall![1] as () => boolean
    expect(handler()).toBe(true)
  })

  it('app:homedir handler returns homedir()', () => {
    register(mockIpcMain as unknown as IpcMain, mockCtx)
    const homedirCall = mockIpcMain.handle.mock.calls.find((c: unknown[]) => c[0] === 'app:homedir')
    const handler = homedirCall![1] as () => string
    expect(handler()).toBe('/mock/home')
  })

  it('app:platform handler returns process.platform', () => {
    register(mockIpcMain as unknown as IpcMain, mockCtx)
    const platformCall = mockIpcMain.handle.mock.calls.find((c: unknown[]) => c[0] === 'app:platform')
    const handler = platformCall![1] as () => string
    expect(handler()).toBe(process.platform)
  })

  it('app:tmpdir handler returns normalized tmpdir', () => {
    register(mockIpcMain as unknown as IpcMain, mockCtx)
    const tmpdirCall = mockIpcMain.handle.mock.calls.find((c: unknown[]) => c[0] === 'app:tmpdir')
    const handler = tmpdirCall![1] as () => string
    expect(handler()).toBe('/mock/tmp')
  })
})
