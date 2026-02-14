import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { HandlerContext } from './types'

// Mock fs operations
const mockExistsSync = vi.fn()
const mockReadFileSync = vi.fn()
const mockReaddirSync = vi.fn()
const mockStatSync = vi.fn()

vi.mock('fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
  readdirSync: (...args: unknown[]) => mockReaddirSync(...args),
  statSync: (...args: unknown[]) => mockStatSync(...args),
}))

vi.mock('electron', () => ({
  IpcMain: {},
}))

function createCtx(overrides: Partial<HandlerContext> = {}): HandlerContext {
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
  } as HandlerContext
}

describe('typescript handlers', () => {
  let handlers: Record<string, Function>
  const mockIpcMain = {
    handle: vi.fn((channel: string, handler: Function) => {
      handlers[channel] = handler
    }),
  }
  const mockEvent = { sender: { id: 1 } }

  beforeEach(() => {
    vi.clearAllMocks()
    handlers = {}
  })

  describe('ts:getProjectContext', () => {
    it('returns mock data in E2E mode', async () => {
      const { register } = await import('./typescript')
      const ctx = createCtx({ isE2ETest: true })
      register(mockIpcMain as never, ctx)

      const result = await handlers['ts:getProjectContext'](mockEvent, '/my/project')
      expect(result).toEqual({
        projectRoot: '/my/project',
        compilerOptions: {
          target: 'es2020',
          module: 'esnext',
          jsx: 'react-jsx',
          strict: true,
          esModuleInterop: true,
        },
        files: [
          { path: 'src/index.ts', content: 'export const test = true;\n' },
          { path: 'src/utils.ts', content: 'export function add(a: number, b: number) { return a + b; }\n' },
        ],
      })
    })

    it('parses tsconfig.json and collects project files', async () => {
      const { register } = await import('./typescript')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      // Mock tsconfig.json exists and can be read
      mockExistsSync.mockImplementation((path: string) => {
        if (path === '/project/tsconfig.json') return true
        return false
      })
      mockReadFileSync.mockImplementation((path: string) => {
        if (path === '/project/tsconfig.json') {
          return JSON.stringify({
            compilerOptions: { target: 'es2021', strict: true },
          })
        }
        if (path === '/project/src/app.ts') {
          return 'export const app = true;'
        }
        return ''
      })

      // Mock directory listing
      mockReaddirSync.mockImplementation((dir: string, opts?: { withFileTypes: boolean }) => {
        if (opts?.withFileTypes) {
          if (dir === '/project') {
            return [
              { name: 'src', isDirectory: () => true },
              { name: 'tsconfig.json', isDirectory: () => false },
              { name: 'node_modules', isDirectory: () => true },
            ]
          }
          if (dir === '/project/src') {
            return [
              { name: 'app.ts', isDirectory: () => false },
              { name: 'readme.md', isDirectory: () => false },
            ]
          }
        }
        return []
      })

      mockStatSync.mockReturnValue({ size: 100 })

      const result = await handlers['ts:getProjectContext'](mockEvent, '/project')
      expect(result.projectRoot).toBe('/project')
      expect(result.compilerOptions).toEqual({ target: 'es2021', strict: true })
      expect(result.files).toHaveLength(1)
      expect(result.files[0].path).toBe('src/app.ts')
      expect(result.files[0].content).toBe('export const app = true;')
    })

    it('skips directories in SKIP_DIRS', async () => {
      const { register } = await import('./typescript')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      mockExistsSync.mockImplementation((path: string) => {
        if (path === '/project/tsconfig.json') return true
        return false
      })
      mockReadFileSync.mockImplementation((path: string) => {
        if (path === '/project/tsconfig.json') {
          return JSON.stringify({ compilerOptions: {} })
        }
        return ''
      })

      mockReaddirSync.mockImplementation((dir: string, opts?: { withFileTypes: boolean }) => {
        if (opts?.withFileTypes && dir === '/project') {
          return [
            { name: '.git', isDirectory: () => true },
            { name: 'node_modules', isDirectory: () => true },
            { name: 'dist', isDirectory: () => true },
            { name: 'build', isDirectory: () => true },
            { name: '.next', isDirectory: () => true },
            { name: '.cache', isDirectory: () => true },
            { name: '__pycache__', isDirectory: () => true },
            { name: '.venv', isDirectory: () => true },
          ]
        }
        return []
      })

      const result = await handlers['ts:getProjectContext'](mockEvent, '/project')
      // None of the skip dirs should be traversed - readdirSync should only be called for /project
      expect(result.files).toHaveLength(0)
    })

    it('skips non-TS/JS file extensions', async () => {
      const { register } = await import('./typescript')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      mockExistsSync.mockImplementation((path: string) => {
        if (path === '/project/tsconfig.json') return true
        return false
      })
      mockReadFileSync.mockImplementation((path: string) => {
        if (path === '/project/tsconfig.json') {
          return JSON.stringify({ compilerOptions: {} })
        }
        return 'file content'
      })

      mockReaddirSync.mockImplementation((dir: string, opts?: { withFileTypes: boolean }) => {
        if (opts?.withFileTypes && dir === '/project') {
          return [
            { name: 'file.py', isDirectory: () => false },
            { name: 'style.css', isDirectory: () => false },
            { name: 'data.json', isDirectory: () => false },
            { name: 'image.png', isDirectory: () => false },
          ]
        }
        return []
      })

      const result = await handlers['ts:getProjectContext'](mockEvent, '/project')
      expect(result.files).toHaveLength(0)
    })

    it('includes .ts, .tsx, .js, .jsx files', async () => {
      const { register } = await import('./typescript')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      mockExistsSync.mockImplementation((path: string) => {
        if (path === '/project/tsconfig.json') return true
        return false
      })
      mockReadFileSync.mockImplementation((path: string) => {
        if (path === '/project/tsconfig.json') {
          return JSON.stringify({ compilerOptions: {} })
        }
        return 'content'
      })

      mockReaddirSync.mockImplementation((dir: string, opts?: { withFileTypes: boolean }) => {
        if (opts?.withFileTypes && dir === '/project') {
          return [
            { name: 'a.ts', isDirectory: () => false },
            { name: 'b.tsx', isDirectory: () => false },
            { name: 'c.js', isDirectory: () => false },
            { name: 'd.jsx', isDirectory: () => false },
          ]
        }
        return []
      })

      mockStatSync.mockReturnValue({ size: 50 })

      const result = await handlers['ts:getProjectContext'](mockEvent, '/project')
      expect(result.files).toHaveLength(4)
    })

    it('skips files larger than 1MB', async () => {
      const { register } = await import('./typescript')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      mockExistsSync.mockImplementation((path: string) => {
        if (path === '/project/tsconfig.json') return true
        return false
      })
      mockReadFileSync.mockImplementation((path: string) => {
        if (path === '/project/tsconfig.json') {
          return JSON.stringify({ compilerOptions: {} })
        }
        return 'content'
      })

      mockReaddirSync.mockImplementation((dir: string, opts?: { withFileTypes: boolean }) => {
        if (opts?.withFileTypes && dir === '/project') {
          return [
            { name: 'small.ts', isDirectory: () => false },
            { name: 'huge.ts', isDirectory: () => false },
          ]
        }
        return []
      })

      mockStatSync.mockImplementation((path: string) => {
        if (path === '/project/huge.ts') return { size: 2 * 1024 * 1024 }
        return { size: 100 }
      })

      const result = await handlers['ts:getProjectContext'](mockEvent, '/project')
      expect(result.files).toHaveLength(1)
      expect(result.files[0].path).toBe('small.ts')
    })

    it('handles tsconfig with extends', async () => {
      const { register } = await import('./typescript')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      mockExistsSync.mockImplementation((path: string) => {
        if (path === '/project/tsconfig.json') return true
        if (path === '/project/tsconfig.base.json') return true
        return false
      })
      mockReadFileSync.mockImplementation((path: string) => {
        if (path === '/project/tsconfig.json') {
          return JSON.stringify({
            extends: './tsconfig.base.json',
            compilerOptions: { strict: true },
          })
        }
        if (path === '/project/tsconfig.base.json') {
          return JSON.stringify({
            compilerOptions: { target: 'es2020', module: 'esnext' },
          })
        }
        return ''
      })

      mockReaddirSync.mockReturnValue([])

      const result = await handlers['ts:getProjectContext'](mockEvent, '/project')
      // Base config merged with extending config
      expect(result.compilerOptions).toEqual({
        target: 'es2020',
        module: 'esnext',
        strict: true,
      })
    })

    it('handles tsconfig with comments', async () => {
      const { register } = await import('./typescript')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      mockExistsSync.mockImplementation((path: string) => {
        if (path === '/project/tsconfig.json') return true
        return false
      })
      mockReadFileSync.mockImplementation((path: string) => {
        if (path === '/project/tsconfig.json') {
          return `{
            // This is a comment
            "compilerOptions": {
              "target": "es2020" /* inline comment */
            }
          }`
        }
        return ''
      })

      mockReaddirSync.mockReturnValue([])

      const result = await handlers['ts:getProjectContext'](mockEvent, '/project')
      expect(result.compilerOptions).toEqual({ target: 'es2020' })
    })

    it('handles missing tsconfig.json gracefully', async () => {
      const { register } = await import('./typescript')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      mockExistsSync.mockReturnValue(false)
      mockReaddirSync.mockImplementation((_dir: string, opts?: { withFileTypes: boolean }) => {
        if (opts?.withFileTypes) return []
        return []
      })

      const result = await handlers['ts:getProjectContext'](mockEvent, '/project')
      expect(result.projectRoot).toBe('/project')
      expect(result.compilerOptions).toEqual({})
      expect(result.files).toEqual([])
    })

    it('discovers monorepo tsconfigs in subdirectories', async () => {
      const { register } = await import('./typescript')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      // Root tsconfig does not exist
      mockExistsSync.mockImplementation((path: string) => {
        if (path === '/project/tsconfig.json') return false
        if (path === '/project/packages/tsconfig.json') return true
        if (path === '/project/apps/tsconfig.json') return true
        return false
      })
      mockReadFileSync.mockImplementation((path: string) => {
        if (path === '/project/packages/tsconfig.json') {
          return JSON.stringify({
            compilerOptions: { target: 'es2021', baseUrl: '.' },
          })
        }
        if (path === '/project/apps/tsconfig.json') {
          return JSON.stringify({
            compilerOptions: { target: 'es2022', baseUrl: './' },
          })
        }
        return ''
      })

      // First call is for walking /project, second/third for reading subdirs
      mockReaddirSync.mockImplementation((dir: string, opts?: { withFileTypes: boolean }) => {
        if (opts?.withFileTypes && dir === '/project') {
          return [
            { name: 'packages', isDirectory: () => true },
            { name: 'apps', isDirectory: () => true },
            { name: '.git', isDirectory: () => true },
            { name: 'node_modules', isDirectory: () => true },
          ]
        }
        // walkDir calls for subdirectories
        if (opts?.withFileTypes && dir === '/project/packages') return []
        if (opts?.withFileTypes && dir === '/project/apps') return []
        // Non-withFileTypes call for monorepo detection
        if (!opts && dir === '/project') {
          return [
            { name: 'packages', isDirectory: () => true },
            { name: 'apps', isDirectory: () => true },
            { name: '.git', isDirectory: () => true },
            { name: 'node_modules', isDirectory: () => true },
          ]
        }
        return []
      })

      const result = await handlers['ts:getProjectContext'](mockEvent, '/project')
      // Uses the first sub-project's compilerOptions plus monorepo paths
      expect(result.compilerOptions.target).toBe('es2021')
      expect(result.compilerOptions.baseUrl).toBe('.')
      expect(result.compilerOptions.paths).toEqual({
        '*': ['packages/*', 'apps/*'],
      })
    })

    it('handles unreadable directories gracefully', async () => {
      const { register } = await import('./typescript')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      mockExistsSync.mockImplementation((path: string) => {
        if (path === '/project/tsconfig.json') return true
        return false
      })
      mockReadFileSync.mockImplementation((path: string) => {
        if (path === '/project/tsconfig.json') {
          return JSON.stringify({ compilerOptions: {} })
        }
        return ''
      })

      mockReaddirSync.mockImplementation((dir: string, opts?: { withFileTypes: boolean }) => {
        if (opts?.withFileTypes && dir === '/project') {
          return [
            { name: 'src', isDirectory: () => true },
          ]
        }
        if (opts?.withFileTypes && dir === '/project/src') {
          throw new Error('EACCES: permission denied')
        }
        return []
      })

      const result = await handlers['ts:getProjectContext'](mockEvent, '/project')
      // Should not throw, just skip unreadable directories
      expect(result.files).toHaveLength(0)
    })

    it('handles unreadable files gracefully', async () => {
      const { register } = await import('./typescript')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      mockExistsSync.mockImplementation((path: string) => {
        if (path === '/project/tsconfig.json') return true
        return false
      })
      mockReadFileSync.mockImplementation((path: string) => {
        if (path === '/project/tsconfig.json') {
          return JSON.stringify({ compilerOptions: {} })
        }
        if (path === '/project/unreadable.ts') {
          throw new Error('EACCES')
        }
        return 'readable content'
      })

      mockReaddirSync.mockImplementation((dir: string, opts?: { withFileTypes: boolean }) => {
        if (opts?.withFileTypes && dir === '/project') {
          return [
            { name: 'unreadable.ts', isDirectory: () => false },
            { name: 'readable.ts', isDirectory: () => false },
          ]
        }
        return []
      })

      mockStatSync.mockReturnValue({ size: 100 })

      const result = await handlers['ts:getProjectContext'](mockEvent, '/project')
      // Should only include the readable file
      expect(result.files).toHaveLength(1)
      expect(result.files[0].path).toBe('readable.ts')
    })

    it('limits extends chain depth to 5', async () => {
      const { register } = await import('./typescript')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      // Create a circular or deep extends chain
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockImplementation((path: string) => {
        // Each config extends another, creating a deep chain
        if (path.includes('tsconfig')) {
          return JSON.stringify({
            extends: './tsconfig.json',
            compilerOptions: { strict: true },
          })
        }
        return ''
      })

      mockReaddirSync.mockReturnValue([])

      // Should not infinite loop - the depth limit of 5 prevents it
      const result = await handlers['ts:getProjectContext'](mockEvent, '/project')
      expect(result.projectRoot).toBe('/project')
    })

    it('handles extends from node_modules', async () => {
      const { register } = await import('./typescript')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      mockExistsSync.mockImplementation((path: string) => {
        if (path === '/project/tsconfig.json') return true
        if (path === '/project/node_modules/@tsconfig/node18/tsconfig.json') return true
        return false
      })
      mockReadFileSync.mockImplementation((path: string) => {
        if (path === '/project/tsconfig.json') {
          return JSON.stringify({
            extends: '@tsconfig/node18/tsconfig.json',
            compilerOptions: { outDir: './dist' },
          })
        }
        if (path === '/project/node_modules/@tsconfig/node18/tsconfig.json') {
          return JSON.stringify({
            compilerOptions: { target: 'es2023', module: 'node16' },
          })
        }
        return ''
      })

      mockReaddirSync.mockReturnValue([])

      const result = await handlers['ts:getProjectContext'](mockEvent, '/project')
      expect(result.compilerOptions).toEqual({
        target: 'es2023',
        module: 'node16',
        outDir: './dist',
      })
    })

    it('appends .json to extends path when original does not exist', async () => {
      const { register } = await import('./typescript')
      const ctx = createCtx()
      register(mockIpcMain as never, ctx)

      mockExistsSync.mockImplementation((path: string) => {
        if (path === '/project/tsconfig.json') return true
        // ./tsconfig.base does not exist, but ./tsconfig.base.json does
        if (path === '/project/tsconfig.base') return false
        if (path === '/project/tsconfig.base.json') return true
        return false
      })
      mockReadFileSync.mockImplementation((path: string) => {
        if (path === '/project/tsconfig.json') {
          return JSON.stringify({
            extends: './tsconfig.base',
            compilerOptions: { strict: true },
          })
        }
        if (path === '/project/tsconfig.base.json') {
          return JSON.stringify({
            compilerOptions: { target: 'es2020' },
          })
        }
        return ''
      })

      mockReaddirSync.mockReturnValue([])

      const result = await handlers['ts:getProjectContext'](mockEvent, '/project')
      expect(result.compilerOptions).toEqual({ target: 'es2020', strict: true })
    })
  })
})
