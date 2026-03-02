// @vitest-environment jsdom
/**
 * Tests for the useChecksRunner hook.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import '../../../../test/react-setup'
import { useChecksRunner } from './useChecksRunner'

describe('useChecksRunner', () => {
  beforeEach(() => {
    vi.mocked(window.shell.exec).mockReset()
  })

  it('initializes with empty results and not running', () => {
    const { result } = renderHook(() => useChecksRunner('/test/dir'))
    expect(result.current.results).toEqual([])
    expect(result.current.isRunning).toBe(false)
  })

  it('returns built-in checks by default', () => {
    const { result } = renderHook(() => useChecksRunner('/test/dir'))
    expect(result.current.checks).toHaveLength(3)
    expect(result.current.checks.map(c => c.id)).toEqual(['lint', 'typecheck', 'test'])
  })

  it('merges custom checks from repo config', () => {
    const repo = {
      id: 'r1', name: 'Test', remoteUrl: '', rootDir: '/test', defaultBranch: 'main',
      customChecks: [{ id: 'format', label: 'Format', command: 'npm run format' }],
    }
    const { result } = renderHook(() => useChecksRunner('/test/dir', repo))
    expect(result.current.checks).toHaveLength(4)
    expect(result.current.checks[3].id).toBe('format')
  })

  it('overrides built-in check commands from repo config', () => {
    const repo = {
      id: 'r1', name: 'Test', remoteUrl: '', rootDir: '/test', defaultBranch: 'main',
      checkCommands: { lint: 'pnpm lint' },
    }
    const { result } = renderHook(() => useChecksRunner('/test/dir', repo))
    const lintCheck = result.current.checks.find(c => c.id === 'lint')
    expect(lintCheck?.command).toBe('pnpm lint')
  })

  it('runs all checks sequentially and updates results', async () => {
    vi.mocked(window.shell.exec)
      .mockResolvedValueOnce({ success: true, stdout: 'ok', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ success: true, stdout: '', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ success: false, stdout: '', stderr: 'FAIL', exitCode: 1 })

    const { result } = renderHook(() => useChecksRunner('/test/dir'))

    await act(async () => {
      await result.current.runChecks()
    })

    expect(result.current.results).toHaveLength(3)
    expect(result.current.results[0].status).toBe('passed')
    expect(result.current.results[1].status).toBe('passed')
    expect(result.current.results[2].status).toBe('failed')
    expect(result.current.results[2].output).toContain('FAIL')
    expect(result.current.isRunning).toBe(false)
  })

  it('runs a single check by id', async () => {
    vi.mocked(window.shell.exec)
      .mockResolvedValueOnce({ success: true, stdout: 'pass', stderr: '', exitCode: 0 })

    const { result } = renderHook(() => useChecksRunner('/test/dir'))

    await act(async () => {
      await result.current.runCheck('lint')
    })

    expect(result.current.results).toHaveLength(1)
    expect(result.current.results[0].id).toBe('lint')
    expect(result.current.results[0].status).toBe('passed')
  })

  it('handles exec errors gracefully', async () => {
    vi.mocked(window.shell.exec).mockRejectedValueOnce(new Error('spawn ENOENT'))

    const { result } = renderHook(() => useChecksRunner('/test/dir'))

    await act(async () => {
      await result.current.runCheck('lint')
    })

    expect(result.current.results[0].status).toBe('failed')
    expect(result.current.results[0].output).toContain('spawn ENOENT')
  })
})
