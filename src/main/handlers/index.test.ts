import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock all sub-handler modules
vi.mock('./pty', () => ({
  register: vi.fn(),
}))

vi.mock('./config', () => ({
  register: vi.fn(),
}))

vi.mock('./git', () => ({
  register: vi.fn(),
}))

vi.mock('./fs', () => ({
  register: vi.fn(),
}))

vi.mock('./gh', () => ({
  register: vi.fn(),
}))

vi.mock('./shell', () => ({
  register: vi.fn(),
}))

vi.mock('./app', () => ({
  register: vi.fn(),
}))

vi.mock('./typescript', () => ({
  register: vi.fn(),
}))

import { registerAllHandlers } from './index'
import * as ptyHandlers from './pty'
import * as configHandlers from './config'
import * as gitHandlers from './git'
import * as fsHandlers from './fs'
import * as ghHandlers from './gh'
import * as shellHandlers from './shell'
import * as appHandlers from './app'
import * as typescriptHandlers from './typescript'
import type { HandlerContext } from './types'
import type { IpcMain } from 'electron'

describe('registerAllHandlers', () => {
  let mockIpcMain: { handle: ReturnType<typeof vi.fn> }
  let mockCtx: HandlerContext

  beforeEach(() => {
    vi.clearAllMocks()
    mockIpcMain = { handle: vi.fn() }
    mockCtx = {} as HandlerContext
  })

  it('delegates to ptyHandlers.register', () => {
    registerAllHandlers(mockIpcMain as unknown as IpcMain, mockCtx)
    expect(ptyHandlers.register).toHaveBeenCalledWith(mockIpcMain, mockCtx)
  })

  it('delegates to configHandlers.register', () => {
    registerAllHandlers(mockIpcMain as unknown as IpcMain, mockCtx)
    expect(configHandlers.register).toHaveBeenCalledWith(mockIpcMain, mockCtx)
  })

  it('delegates to gitHandlers.register', () => {
    registerAllHandlers(mockIpcMain as unknown as IpcMain, mockCtx)
    expect(gitHandlers.register).toHaveBeenCalledWith(mockIpcMain, mockCtx)
  })

  it('delegates to fsHandlers.register', () => {
    registerAllHandlers(mockIpcMain as unknown as IpcMain, mockCtx)
    expect(fsHandlers.register).toHaveBeenCalledWith(mockIpcMain, mockCtx)
  })

  it('delegates to ghHandlers.register', () => {
    registerAllHandlers(mockIpcMain as unknown as IpcMain, mockCtx)
    expect(ghHandlers.register).toHaveBeenCalledWith(mockIpcMain, mockCtx)
  })

  it('delegates to shellHandlers.register', () => {
    registerAllHandlers(mockIpcMain as unknown as IpcMain, mockCtx)
    expect(shellHandlers.register).toHaveBeenCalledWith(mockIpcMain, mockCtx)
  })

  it('delegates to appHandlers.register', () => {
    registerAllHandlers(mockIpcMain as unknown as IpcMain, mockCtx)
    expect(appHandlers.register).toHaveBeenCalledWith(mockIpcMain, mockCtx)
  })

  it('delegates to typescriptHandlers.register', () => {
    registerAllHandlers(mockIpcMain as unknown as IpcMain, mockCtx)
    expect(typescriptHandlers.register).toHaveBeenCalledWith(mockIpcMain, mockCtx)
  })

  it('calls all 8 handler register functions exactly once', () => {
    registerAllHandlers(mockIpcMain as unknown as IpcMain, mockCtx)
    expect(ptyHandlers.register).toHaveBeenCalledTimes(1)
    expect(configHandlers.register).toHaveBeenCalledTimes(1)
    expect(gitHandlers.register).toHaveBeenCalledTimes(1)
    expect(fsHandlers.register).toHaveBeenCalledTimes(1)
    expect(ghHandlers.register).toHaveBeenCalledTimes(1)
    expect(shellHandlers.register).toHaveBeenCalledTimes(1)
    expect(appHandlers.register).toHaveBeenCalledTimes(1)
    expect(typescriptHandlers.register).toHaveBeenCalledTimes(1)
  })
})
