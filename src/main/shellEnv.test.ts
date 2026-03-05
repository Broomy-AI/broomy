import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { allowConsoleWarn } from '../test/console-guard'
import type { ExecFileException } from 'child_process'

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}))

import { execFile } from 'child_process'

describe('resolveShellEnv', () => {
  const origPlatform = process.platform
  const origEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: origPlatform })
    // Restore env
    for (const key of Object.keys(process.env)) {
      if (!(key in origEnv)) process.env[key] = undefined
    }
    Object.assign(process.env, origEnv)
  })

  it('skips on win32', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' })
    const { resolveShellEnv } = await import('./shellEnv')
    await resolveShellEnv()
    expect(execFile).not.toHaveBeenCalled()
  })

  it('skips when E2E_TEST is true', async () => {
    process.env.E2E_TEST = 'true'
    const { resolveShellEnv } = await import('./shellEnv')
    await resolveShellEnv()
    expect(execFile).not.toHaveBeenCalled()
  })

  it('parses null-separated env output', async () => {
    delete process.env.E2E_TEST
    vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, callback) => {
      const cb = callback as (err: ExecFileException | null, stdout: string) => void
      cb(null, 'FOO=bar\0BAZ=qux\0')
      return undefined as never
    })

    const { resolveShellEnv } = await import('./shellEnv')
    await resolveShellEnv()

    expect(process.env.FOO).toBe('bar')
    expect(process.env.BAZ).toBe('qux')
  })

  it('handles exec errors gracefully', async () => {
    allowConsoleWarn()
    delete process.env.E2E_TEST
    vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, callback) => {
      const cb = callback as (err: ExecFileException | null, stdout: string) => void
      cb(new Error('spawn failed') as ExecFileException, '')
      return undefined as never
    })

    const { resolveShellEnv } = await import('./shellEnv')
    // Should not throw
    await expect(resolveShellEnv()).resolves.toBeUndefined()
  })

  it('uses SHELL env var for the shell command', async () => {
    delete process.env.E2E_TEST
    process.env.SHELL = '/usr/local/bin/fish'
    vi.mocked(execFile).mockImplementation((cmd, _args, _opts, callback) => {
      expect(cmd).toBe('/usr/local/bin/fish')
      const cb = callback as (err: ExecFileException | null, stdout: string) => void
      cb(null, '')
      return undefined as never
    })

    const { resolveShellEnv } = await import('./shellEnv')
    await resolveShellEnv()
  })
})
