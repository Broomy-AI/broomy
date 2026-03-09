import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../workerPool', () => ({
  runInWorker: vi.fn(),
}))

vi.mock('electron', () => ({
  IpcMain: {},
}))

import { runInWorker } from '../workerPool'
import { register } from './typescript'
import { E2EScenario, type HandlerContext } from './types'

function createCtx(overrides: Partial<HandlerContext> = {}): HandlerContext {
  return {
    isE2ETest: false,
    e2eScenario: E2EScenario.Default, e2eRealRepos: false,
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
    dockerContainers: new Map(),
    ...overrides,
  } as HandlerContext
}

function setupHandlers(ctx?: HandlerContext) {
  const handlers: Record<string, Function> = {}
  const mockIpcMain = {
    handle: vi.fn((channel: string, handler: Function) => {
      handlers[channel] = handler
    }),
  }
  register(mockIpcMain as never, ctx ?? createCtx())
  return handlers
}

describe('typescript handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers ts:getProjectContext channel', () => {
    const handlers = setupHandlers()
    expect(handlers['ts:getProjectContext']).toBeDefined()
  })

  describe('ts:getProjectContext', () => {
    it('returns mock data in E2E mode', async () => {
      const handlers = setupHandlers(createCtx({ isE2ETest: true }))
      const result = await handlers['ts:getProjectContext']({}, '/my/project')
      expect(result).toEqual({
        projectRoot: '/my/project',
        compilerOptions: {
          target: 'es2020',
          module: 'esnext',
          moduleResolution: 'node',
          jsx: 'react-jsx',
          strict: true,
          esModuleInterop: true,
        },
        files: [
          { path: 'src/utils.ts', content: 'export function add(a: number, b: number): number {\n  return a + b\n}\n\nexport function multiply(a: number, b: number): number {\n  return a * b\n}\n' },
          { path: 'src/index.ts', content: expect.stringContaining('add') },
        ],
      })
      expect(runInWorker).not.toHaveBeenCalled()
    })

    it('delegates to runInWorker in normal mode', async () => {
      const mockResult = {
        projectRoot: '/project',
        compilerOptions: { target: 'es2021', strict: true },
        files: [{ path: 'src/app.ts', content: 'export const app = true;' }],
      }
      vi.mocked(runInWorker).mockResolvedValue(mockResult)

      const handlers = setupHandlers()
      const result = await handlers['ts:getProjectContext']({}, '/project')
      expect(result).toEqual(mockResult)
      const workerPath = vi.mocked(runInWorker).mock.calls[0][0]
      expect(workerPath).toContain('tsProject.worker.js')
      expect(workerPath).not.toContain('../workers')
      expect(runInWorker).toHaveBeenCalledWith(
        expect.stringContaining('tsProject.worker.js'),
        { projectRoot: '/project' },
      )
    })
  })
})
