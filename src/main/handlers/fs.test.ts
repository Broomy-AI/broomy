import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the sub-modules
vi.mock('./fsCore', () => ({
  register: vi.fn(),
}))

vi.mock('./fsSearch', () => ({
  register: vi.fn(),
}))

import { register } from './fs'
import * as fsCore from './fsCore'
import * as fsSearch from './fsSearch'
import type { HandlerContext } from './types'
import type { IpcMain } from 'electron'

describe('fs handler register', () => {
  let mockIpcMain: { handle: ReturnType<typeof vi.fn> }
  let mockCtx: HandlerContext

  beforeEach(() => {
    vi.clearAllMocks()
    mockIpcMain = { handle: vi.fn() }
    mockCtx = {} as HandlerContext
  })

  it('delegates to fsCore.register', () => {
    register(mockIpcMain as unknown as IpcMain, mockCtx)
    expect(fsCore.register).toHaveBeenCalledWith(mockIpcMain, mockCtx)
  })

  it('delegates to fsSearch.register', () => {
    register(mockIpcMain as unknown as IpcMain, mockCtx)
    expect(fsSearch.register).toHaveBeenCalledWith(mockIpcMain, mockCtx)
  })

  it('calls both sub-module register functions exactly once', () => {
    register(mockIpcMain as unknown as IpcMain, mockCtx)
    expect(fsCore.register).toHaveBeenCalledTimes(1)
    expect(fsSearch.register).toHaveBeenCalledTimes(1)
  })
})
