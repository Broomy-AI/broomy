/**
 * Unit tests for devcontainer CLI wrapper functions.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateDefaultDevcontainerJson, buildDevcontainerExecArgs, devcontainerSetupMessage, isDevcontainerCliAvailable, hasDevcontainerConfig, writeDefaultDevcontainerConfig, normalizePostAttachCommand, devcontainerUp } from './devcontainer'
import { EventEmitter } from 'events'

// We need to mock execFile as a callback-style function that promisify will wrap
const mockExecFile = vi.fn()
const mockSpawn = vi.fn()
vi.mock('child_process', () => ({
  execFile: (...args: unknown[]) => mockExecFile(...args),
  spawn: (...args: unknown[]) => mockSpawn(...args),
}))

vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}))

import { existsSync, mkdirSync, writeFileSync } from 'fs'

describe('devcontainer', () => {
  describe('generateDefaultDevcontainerJson', () => {
    it('returns a valid devcontainer config with base image and features', () => {
      const config = generateDefaultDevcontainerJson()
      expect(config.image).toBe('mcr.microsoft.com/devcontainers/base:ubuntu')
      expect(config.features).toBeDefined()
      expect(config.features['ghcr.io/devcontainers/features/node:1']).toEqual({})
      expect(config.features['ghcr.io/devcontainers/features/git:1']).toEqual({})
      expect(config.features['ghcr.io/devcontainers/features/github-cli:1']).toEqual({})
    })
  })

  describe('buildDevcontainerExecArgs', () => {
    it('builds args for interactive shell', () => {
      const args = buildDevcontainerExecArgs('abc123', 'vscode', '/workspace', {})
      expect(args).toEqual([
        'exec', '-it', '-u', 'vscode', '-w', '/workspace',
        'abc123', 'bash', '-l',
      ])
    })

    it('builds args with command', () => {
      const args = buildDevcontainerExecArgs('abc123', 'vscode', '/workspace', {}, 'claude')
      expect(args).toEqual([
        'exec', '-it', '-u', 'vscode', '-w', '/workspace',
        'abc123', 'bash', '-l', '-c', 'claude',
      ])
    })

    it('uses specified remote user', () => {
      const args = buildDevcontainerExecArgs('abc123', 'root', '/workspace', {})
      expect(args).toContain('-u')
      const userIndex = args.indexOf('-u')
      expect(args[userIndex + 1]).toBe('root')
    })

    it('passes environment variables', () => {
      const args = buildDevcontainerExecArgs('abc123', 'vscode', '/workspace', {
        ANTHROPIC_API_KEY: 'sk-123',
        NODE_ENV: 'development',
      })
      expect(args).toContain('-e')
      expect(args).toContain('ANTHROPIC_API_KEY=sk-123')
      expect(args).toContain('NODE_ENV=development')
    })
  })

  describe('devcontainerSetupMessage', () => {
    it('returns a message with install instructions', () => {
      const msg = devcontainerSetupMessage({ available: false, error: 'devcontainer CLI is not installed' })
      expect(msg).toContain('Dev Container CLI required')
      expect(msg).toContain('npm install -g @devcontainers/cli')
      expect(msg).toContain('devcontainer CLI is not installed')
    })

    it('handles missing error message', () => {
      const msg = devcontainerSetupMessage({ available: false })
      expect(msg).toContain('devcontainer CLI is not available')
    })
  })

  describe('isDevcontainerCliAvailable', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('returns available with version when CLI exists', async () => {
      mockExecFile.mockImplementation((_cmd: string, _args: string[], callback: (err: null, result: { stdout: string }) => void) => {
        callback(null, { stdout: '0.62.0\n' })
      })

      const result = await isDevcontainerCliAvailable()
      expect(result.available).toBe(true)
      expect(result.version).toBe('0.62.0')
    })

    it('returns not available with ENOENT error', async () => {
      mockExecFile.mockImplementation((_cmd: string, _args: string[], callback: (err: Error) => void) => {
        callback(new Error('spawn devcontainer ENOENT'))
      })

      const result = await isDevcontainerCliAvailable()
      expect(result.available).toBe(false)
      expect(result.error).toBe('devcontainer CLI is not installed')
    })

    it('returns not available with generic error', async () => {
      mockExecFile.mockImplementation((_cmd: string, _args: string[], callback: (err: Error) => void) => {
        callback(new Error('something went wrong'))
      })

      const result = await isDevcontainerCliAvailable()
      expect(result.available).toBe(false)
      expect(result.error).toBe('something went wrong')
    })

    it('returns not available with not found error', async () => {
      mockExecFile.mockImplementation((_cmd: string, _args: string[], callback: (err: Error) => void) => {
        callback(new Error('not found'))
      })

      const result = await isDevcontainerCliAvailable()
      expect(result.available).toBe(false)
      expect(result.error).toBe('devcontainer CLI is not installed')
    })
  })

  describe('hasDevcontainerConfig', () => {
    beforeEach(() => {
      vi.mocked(existsSync).mockReset()
    })

    it('returns true when .devcontainer/devcontainer.json exists', () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        return String(path).includes('.devcontainer/devcontainer.json')
      })
      expect(hasDevcontainerConfig('/workspace')).toBe(true)
    })

    it('returns true when .devcontainer.json exists', () => {
      vi.mocked(existsSync).mockImplementation((path) => {
        return String(path).endsWith('.devcontainer.json')
      })
      expect(hasDevcontainerConfig('/workspace')).toBe(true)
    })

    it('returns false when no config exists', () => {
      vi.mocked(existsSync).mockReturnValue(false)
      expect(hasDevcontainerConfig('/workspace')).toBe(false)
    })
  })

  describe('normalizePostAttachCommand', () => {
    it('returns undefined for falsy values', () => {
      expect(normalizePostAttachCommand(null)).toBeUndefined()
      expect(normalizePostAttachCommand(undefined)).toBeUndefined()
      expect(normalizePostAttachCommand('')).toBeUndefined()
    })

    it('returns string as-is', () => {
      expect(normalizePostAttachCommand('pnpm dev')).toBe('pnpm dev')
    })

    it('joins array with space', () => {
      expect(normalizePostAttachCommand(['pnpm', 'dev'])).toBe('pnpm dev')
    })

    it('joins object values with &&', () => {
      expect(normalizePostAttachCommand({ services: 'pnpm dev', other: 'echo hi' }))
        .toBe('pnpm dev && echo hi')
    })

    it('handles object with array values', () => {
      expect(normalizePostAttachCommand({ cmd: ['npm', 'start'] })).toBe('npm start')
    })

    it('returns undefined for empty object', () => {
      expect(normalizePostAttachCommand({})).toBeUndefined()
    })

    it('returns undefined for non-object/array/string types', () => {
      expect(normalizePostAttachCommand(42)).toBeUndefined()
    })
  })

  describe('writeDefaultDevcontainerConfig', () => {
    beforeEach(() => {
      vi.mocked(existsSync).mockReset()
      vi.mocked(mkdirSync).mockReset()
      vi.mocked(writeFileSync).mockReset()
    })

    it('creates .devcontainer dir and writes config', () => {
      vi.mocked(existsSync).mockReturnValue(false)

      writeDefaultDevcontainerConfig('/workspace')

      expect(mkdirSync).toHaveBeenCalledWith(expect.stringContaining('.devcontainer'), { recursive: true })
      expect(writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('devcontainer.json'),
        expect.stringContaining('mcr.microsoft.com/devcontainers/base:ubuntu'),
      )
    })

    it('skips mkdir if .devcontainer already exists', () => {
      vi.mocked(existsSync).mockReturnValue(true)

      writeDefaultDevcontainerConfig('/workspace')

      expect(mkdirSync).not.toHaveBeenCalled()
      expect(writeFileSync).toHaveBeenCalled()
    })
  })

  describe('devcontainerUp', () => {
    /** Create a mock child process with stdout/stderr emitters. */
    function createMockChild() {
      const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter }
      child.stdout = new EventEmitter()
      child.stderr = new EventEmitter()
      return child
    }

    beforeEach(() => {
      mockSpawn.mockReset()
    })

    it('returns success with parsed container info', async () => {
      const child = createMockChild()
      mockSpawn.mockReturnValue(child)

      const onProgress = vi.fn()
      const promise = devcontainerUp('/workspace', onProgress)

      const output = JSON.stringify({
        outcome: 'createdAndStarted',
        containerId: 'abc123',
        remoteUser: 'vscode',
        remoteWorkspaceFolder: '/workspaces/myrepo',
        mergedConfiguration: { postAttachCommand: 'pnpm dev' },
      })
      child.stdout.emit('data', Buffer.from(output))
      child.emit('close', 0)

      const result = await promise
      expect(result.success).toBe(true)
      expect(result.result).toEqual({
        containerId: 'abc123',
        remoteUser: 'vscode',
        remoteWorkspaceFolder: '/workspaces/myrepo',
        postAttachCommand: 'pnpm dev',
      })
    })

    it('passes --skip-post-attach and --include-merged-configuration flags', async () => {
      const child = createMockChild()
      mockSpawn.mockReturnValue(child)

      const promise = devcontainerUp('/workspace', vi.fn())
      child.stdout.emit('data', Buffer.from(JSON.stringify({
        outcome: 'createdAndStarted', containerId: 'x', remoteUser: 'u', remoteWorkspaceFolder: '/w',
      })))
      child.emit('close', 0)
      await promise

      expect(mockSpawn).toHaveBeenCalledWith('devcontainer', expect.arrayContaining([
        '--skip-post-attach', '--include-merged-configuration',
      ]), expect.any(Object))
    })

    it('returns error on non-zero exit code', async () => {
      const child = createMockChild()
      mockSpawn.mockReturnValue(child)

      const promise = devcontainerUp('/workspace', vi.fn())
      child.emit('close', 1)

      const result = await promise
      expect(result.success).toBe(false)
      expect(result.error).toContain('exited with code 1')
    })

    it('returns error on spawn failure', async () => {
      const child = createMockChild()
      mockSpawn.mockReturnValue(child)

      const promise = devcontainerUp('/workspace', vi.fn())
      child.emit('error', new Error('spawn failed'))

      const result = await promise
      expect(result.success).toBe(false)
      expect(result.error).toBe('spawn failed')
    })

    it('returns error on invalid JSON output', async () => {
      const child = createMockChild()
      mockSpawn.mockReturnValue(child)

      const promise = devcontainerUp('/workspace', vi.fn())
      child.stdout.emit('data', Buffer.from('not json'))
      child.emit('close', 0)

      const result = await promise
      expect(result.success).toBe(false)
      expect(result.error).toContain('Failed to parse')
    })

    it('streams stderr to onProgress', async () => {
      const child = createMockChild()
      mockSpawn.mockReturnValue(child)

      const onProgress = vi.fn()
      const promise = devcontainerUp('/workspace', onProgress)

      child.stderr.emit('data', Buffer.from('Building image...\n'))
      child.stdout.emit('data', Buffer.from(JSON.stringify({
        outcome: 'ok', containerId: 'c', remoteUser: 'u', remoteWorkspaceFolder: '/w',
      })))
      child.emit('close', 0)
      await promise

      expect(onProgress).toHaveBeenCalledWith(expect.stringContaining('Building image...'))
    })

    it('returns undefined postAttachCommand when not in merged config', async () => {
      const child = createMockChild()
      mockSpawn.mockReturnValue(child)

      const promise = devcontainerUp('/workspace', vi.fn())
      child.stdout.emit('data', Buffer.from(JSON.stringify({
        outcome: 'ok', containerId: 'c', remoteUser: 'u', remoteWorkspaceFolder: '/w',
      })))
      child.emit('close', 0)

      const result = await promise
      expect(result.result?.postAttachCommand).toBeUndefined()
    })
  })
})
