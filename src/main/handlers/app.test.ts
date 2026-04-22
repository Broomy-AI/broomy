import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies
vi.mock('os', () => ({
  homedir: vi.fn(() => '/mock/home'),
  tmpdir: vi.fn(() => '/mock/tmp'),
}))

vi.mock('../platform', () => ({
  normalizePath: vi.fn((p: string) => p.replace(/\\/g, '/')),
}))

vi.mock('electron', () => ({
  app: { getVersion: vi.fn(() => '0.6.1') },
}))

vi.mock('../crashLog', () => ({
  readLatestCrashLog: vi.fn(() => null),
  deleteAllCrashLogs: vi.fn(),
  buildCrashReportUrl: vi.fn(() => 'https://github.com/Broomy-AI/broomy/issues/new?title=test'),
}))

import { register } from './app'
import { E2EScenario, type HandlerContext } from './types'
import type { IpcMain } from 'electron'
import { readLatestCrashLog, deleteAllCrashLogs } from '../crashLog'

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
      e2eScenario: E2EScenario.Default, e2eRealRepos: false,
      isWindows: false,
      ptyProcesses: new Map(),
      ptyOwnerWindows: new Map(),
      fileWatchers: new Map(),
      watcherOwnerWindows: new Map(),
      profileWindows: new Map(),
      mainWindow: null,
      E2E_MOCK_SHELL: undefined,
      FAKE_CLAUDE_SCRIPT: undefined,
    dockerContainers: new Map(),
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

  it('registers app:getVersion handler', () => {
    register(mockIpcMain as unknown as IpcMain, mockCtx)
    const channels = mockIpcMain.handle.mock.calls.map((c: unknown[]) => c[0])
    expect(channels).toContain('app:getVersion')
  })

  it('app:getVersion handler returns app version', () => {
    register(mockIpcMain as unknown as IpcMain, mockCtx)
    const versionCall = mockIpcMain.handle.mock.calls.find((c: unknown[]) => c[0] === 'app:getVersion')
    const handler = versionCall![1] as () => string
    expect(handler()).toBe('0.6.1')
  })

  it('registers exactly 9 handlers', () => {
    register(mockIpcMain as unknown as IpcMain, mockCtx)
    expect(mockIpcMain.handle).toHaveBeenCalledTimes(9)
  })

  it('app:getBuildInfo handler returns commit and buildTime', () => {
    register(mockIpcMain as unknown as IpcMain, mockCtx)
    const call = mockIpcMain.handle.mock.calls.find((c: unknown[]) => c[0] === 'app:getBuildInfo')
    const handler = call![1] as () => { commit: string; buildTime: string }
    const info = handler()
    expect(info).toHaveProperty('commit')
    expect(info).toHaveProperty('buildTime')
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

  it('registers app:getCrashLog handler', () => {
    register(mockIpcMain as unknown as IpcMain, mockCtx)
    const channels = mockIpcMain.handle.mock.calls.map((c: unknown[]) => c[0])
    expect(channels).toContain('app:getCrashLog')
  })

  it('registers app:dismissCrashLog handler', () => {
    register(mockIpcMain as unknown as IpcMain, mockCtx)
    const channels = mockIpcMain.handle.mock.calls.map((c: unknown[]) => c[0])
    expect(channels).toContain('app:dismissCrashLog')
  })

  it('registers app:getCrashReportUrl handler', () => {
    register(mockIpcMain as unknown as IpcMain, mockCtx)
    const channels = mockIpcMain.handle.mock.calls.map((c: unknown[]) => c[0])
    expect(channels).toContain('app:getCrashReportUrl')
  })

  it('app:getCrashLog returns null when no crash log exists', () => {
    register(mockIpcMain as unknown as IpcMain, mockCtx)
    const call = mockIpcMain.handle.mock.calls.find((c: unknown[]) => c[0] === 'app:getCrashLog')
    const handler = call![1] as () => unknown
    expect(handler()).toBeNull()
  })

  it('app:getCrashLog returns null in E2E test mode', () => {
    const e2eCtx = { ...mockCtx, isE2ETest: true } as unknown as HandlerContext
    register(mockIpcMain as unknown as IpcMain, e2eCtx)
    const call = mockIpcMain.handle.mock.calls.find((c: unknown[]) => c[0] === 'app:getCrashLog')
    const handler = call![1] as () => unknown
    expect(handler()).toBeNull()
  })

  it('app:getCrashReportUrl returns null when no crash log exists', () => {
    register(mockIpcMain as unknown as IpcMain, mockCtx)
    const call = mockIpcMain.handle.mock.calls.find((c: unknown[]) => c[0] === 'app:getCrashReportUrl')
    const handler = call![1] as () => unknown
    expect(handler()).toBeNull()
  })

  it('app:dismissCrashLog does nothing in E2E mode', () => {
    const e2eCtx = { ...mockCtx, isE2ETest: true } as unknown as HandlerContext
    register(mockIpcMain as unknown as IpcMain, e2eCtx)
    const call = mockIpcMain.handle.mock.calls.find((c: unknown[]) => c[0] === 'app:dismissCrashLog')
    const handler = call![1] as () => void
    handler()
    expect(deleteAllCrashLogs).not.toHaveBeenCalled()
  })

  it('app:dismissCrashLog deletes all crash logs', () => {
    register(mockIpcMain as unknown as IpcMain, mockCtx)
    const call = mockIpcMain.handle.mock.calls.find((c: unknown[]) => c[0] === 'app:dismissCrashLog')
    const handler = call![1] as () => void
    handler()
    expect(deleteAllCrashLogs).toHaveBeenCalled()
  })

  it('app:getCrashReportUrl returns URL when crash log exists', () => {
    vi.mocked(readLatestCrashLog).mockReturnValue({ path: '/tmp/crash.log', report: { timestamp: '2024-01-01', message: 'test', stack: '', electronVersion: '28.0.0', appVersion: '0.6.1', platform: 'darwin', processType: 'main' } })
    register(mockIpcMain as unknown as IpcMain, mockCtx)
    const call = mockIpcMain.handle.mock.calls.find((c: unknown[]) => c[0] === 'app:getCrashReportUrl')
    const handler = call![1] as () => unknown
    expect(handler()).toBe('https://github.com/Broomy-AI/broomy/issues/new?title=test')
  })

  it('app:getCrashReportUrl returns null in E2E mode', () => {
    const e2eCtx = { ...mockCtx, isE2ETest: true } as unknown as HandlerContext
    register(mockIpcMain as unknown as IpcMain, e2eCtx)
    const call = mockIpcMain.handle.mock.calls.find((c: unknown[]) => c[0] === 'app:getCrashReportUrl')
    const handler = call![1] as () => unknown
    expect(handler()).toBeNull()
  })

  it('app:getCrashLog returns report when crash log exists', () => {
    const report = { timestamp: '2024-01-01', message: 'crash', stack: 'trace', electronVersion: '28.0.0', appVersion: '0.6.1', platform: 'darwin', processType: 'main' as const }
    vi.mocked(readLatestCrashLog).mockReturnValue({ path: '/tmp/crash.log', report })
    register(mockIpcMain as unknown as IpcMain, mockCtx)
    const call = mockIpcMain.handle.mock.calls.find((c: unknown[]) => c[0] === 'app:getCrashLog')
    const handler = call![1] as () => unknown
    expect(handler()).toEqual(report)
  })
})
