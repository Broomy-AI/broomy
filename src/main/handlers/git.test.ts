import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the sub-modules
vi.mock('./gitBasic', () => ({
  register: vi.fn(),
}))

vi.mock('./gitBranch', () => ({
  register: vi.fn(),
}))

vi.mock('./gitSync', () => ({
  register: vi.fn(),
}))

import { register } from './git'
import * as gitBasic from './gitBasic'
import * as gitBranch from './gitBranch'
import * as gitSync from './gitSync'
import type { HandlerContext } from './types'
import type { IpcMain } from 'electron'

describe('git handler register', () => {
  let mockIpcMain: { handle: ReturnType<typeof vi.fn> }
  let mockCtx: HandlerContext

  beforeEach(() => {
    vi.clearAllMocks()
    mockIpcMain = { handle: vi.fn() }
    mockCtx = {} as HandlerContext
  })

  it('delegates to gitBasic.register', () => {
    register(mockIpcMain as unknown as IpcMain, mockCtx)
    expect(gitBasic.register).toHaveBeenCalledWith(mockIpcMain, mockCtx)
  })

  it('delegates to gitBranch.register', () => {
    register(mockIpcMain as unknown as IpcMain, mockCtx)
    expect(gitBranch.register).toHaveBeenCalledWith(mockIpcMain, mockCtx)
  })

  it('delegates to gitSync.register', () => {
    register(mockIpcMain as unknown as IpcMain, mockCtx)
    expect(gitSync.register).toHaveBeenCalledWith(mockIpcMain, mockCtx)
  })

  it('calls all three sub-module register functions exactly once', () => {
    register(mockIpcMain as unknown as IpcMain, mockCtx)
    expect(gitBasic.register).toHaveBeenCalledTimes(1)
    expect(gitBranch.register).toHaveBeenCalledTimes(1)
    expect(gitSync.register).toHaveBeenCalledTimes(1)
  })
})
