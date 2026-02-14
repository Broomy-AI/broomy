import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the sub-modules
vi.mock('./ghCore', () => ({
  register: vi.fn(),
}))

vi.mock('./ghComments', () => ({
  register: vi.fn(),
}))

import { register } from './gh'
import * as ghCore from './ghCore'
import * as ghComments from './ghComments'
import type { HandlerContext } from './types'
import type { IpcMain } from 'electron'

describe('gh handler register', () => {
  let mockIpcMain: { handle: ReturnType<typeof vi.fn> }
  let mockCtx: HandlerContext

  beforeEach(() => {
    vi.clearAllMocks()
    mockIpcMain = { handle: vi.fn() }
    mockCtx = {} as HandlerContext
  })

  it('delegates to ghCore.register', () => {
    register(mockIpcMain as unknown as IpcMain, mockCtx)
    expect(ghCore.register).toHaveBeenCalledWith(mockIpcMain, mockCtx)
  })

  it('delegates to ghComments.register', () => {
    register(mockIpcMain as unknown as IpcMain, mockCtx)
    expect(ghComments.register).toHaveBeenCalledWith(mockIpcMain, mockCtx)
  })

  it('calls both sub-module register functions exactly once', () => {
    register(mockIpcMain as unknown as IpcMain, mockCtx)
    expect(ghCore.register).toHaveBeenCalledTimes(1)
    expect(ghComments.register).toHaveBeenCalledTimes(1)
  })
})
