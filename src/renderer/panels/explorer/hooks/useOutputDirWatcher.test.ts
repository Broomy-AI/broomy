// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import '../../../../test/setup'
import { useOutputDirWatcher, type OutputDirState } from './useOutputDirWatcher'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useOutputDirWatcher', () => {
  it('returns defaults when sessionId is null', () => {
    const { result } = renderHook(() => useOutputDirWatcher(null, '/repos/project'))
    expect(result.current.issuePlanExists).toBe(false)
    expect(result.current.suggestGitignore).toBe(false)
  })

  it('returns defaults when directory is undefined', () => {
    const { result } = renderHook(() => useOutputDirWatcher('session-1', undefined))
    expect(result.current.issuePlanExists).toBe(false)
    expect(result.current.suggestGitignore).toBe(false)
  })

  it('checks plan file existence on mount', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(true as never)
    vi.mocked(window.fs.readDir).mockResolvedValue([
      { name: 'plan.md', path: '/repos/project/.broomy/output/plan.md', isDirectory: false, isFile: true, isSymlink: false },
    ] as never)
    vi.mocked(window.fs.readFile).mockResolvedValue('/output/\n')

    let result: { current: OutputDirState }
    await act(async () => {
      const hook = renderHook(() => useOutputDirWatcher('session-1', '/repos/project'))
      result = hook.result
    })

    expect(result!.current.issuePlanExists).toBe(true)
    expect(window.fs.exists).toHaveBeenCalledWith('/repos/project/.broomy/output/plan.md')
  })

  it('sets up a file watcher on the output directory', () => {
    vi.mocked(window.fs.exists).mockResolvedValue(false as never)

    renderHook(() => useOutputDirWatcher('session-1', '/repos/project'))

    expect(window.fs.watch).toHaveBeenCalledWith('issue-plan-session-1', '/repos/project/.broomy/output')
    expect(window.fs.onChange).toHaveBeenCalledWith('issue-plan-session-1', expect.any(Function))
  })

  it('re-checks existence when plan.md change event fires', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(false as never)
    vi.mocked(window.fs.readDir).mockResolvedValue([])
    let changeCallback: (event: { eventType: string; filename: string | null }) => void = () => {}
    vi.mocked(window.fs.onChange).mockImplementation((_id, cb) => {
      changeCallback = cb
      return () => {}
    })

    let result: { current: OutputDirState }
    await act(async () => {
      const hook = renderHook(() => useOutputDirWatcher('session-1', '/repos/project'))
      result = hook.result
    })

    expect(result!.current.issuePlanExists).toBe(false)

    // Simulate plan.md being created
    vi.mocked(window.fs.exists).mockResolvedValue(true as never)
    vi.mocked(window.fs.readDir).mockResolvedValue([
      { name: 'plan.md', path: '/repos/project/.broomy/output/plan.md', isDirectory: false, isFile: true, isSymlink: false },
    ] as never)
    vi.mocked(window.fs.readFile).mockResolvedValue('/output/\n')
    await act(async () => {
      changeCallback({ eventType: 'rename', filename: 'plan.md' })
    })

    expect(result!.current.issuePlanExists).toBe(true)
  })

  it('cleans up watcher on unmount', () => {
    vi.mocked(window.fs.exists).mockResolvedValue(false as never)
    const removeListener = vi.fn()
    vi.mocked(window.fs.onChange).mockReturnValue(removeListener)

    const { unmount } = renderHook(() => useOutputDirWatcher('session-1', '/repos/project'))
    unmount()

    expect(removeListener).toHaveBeenCalled()
    expect(window.fs.unwatch).toHaveBeenCalledWith('issue-plan-session-1')
  })

  it('does not set up watcher when sessionId is null', () => {
    renderHook(() => useOutputDirWatcher(null, '/repos/project'))

    expect(window.fs.watch).not.toHaveBeenCalled()
    expect(window.fs.onChange).not.toHaveBeenCalled()
  })

  describe('gitignore suggestion', () => {
    it('suggests gitignore when output files exist and no gitignore is set up', async () => {
      vi.mocked(window.fs.exists).mockImplementation(async (path: string) => {
        if (path === '/repos/project/.broomy/output') return true
        if (path === '/repos/project/.broomy/.gitignore') return false
        if (path === '/repos/project/.gitignore') return false
        return false
      })
      vi.mocked(window.fs.readDir).mockResolvedValue([
        { name: 'review.md', path: '/repos/project/.broomy/output/review.md', isDirectory: false, isFile: true, isSymlink: false },
      ] as never)

      let result: { current: OutputDirState }
      await act(async () => {
        const hook = renderHook(() => useOutputDirWatcher('session-1', '/repos/project'))
        result = hook.result
      })

      expect(result!.current.suggestGitignore).toBe(true)
    })

    it('does not suggest when .broomy/.gitignore has /output/ entry', async () => {
      vi.mocked(window.fs.exists).mockImplementation(async (path: string) => {
        if (path === '/repos/project/.broomy/output') return true
        if (path === '/repos/project/.broomy/.gitignore') return true
        return false
      })
      vi.mocked(window.fs.readDir).mockResolvedValue([
        { name: 'review.md', path: '/repos/project/.broomy/output/review.md', isDirectory: false, isFile: true, isSymlink: false },
      ] as never)
      vi.mocked(window.fs.readFile).mockResolvedValue('# Broomy generated files\n/output/\n')

      let result: { current: OutputDirState }
      await act(async () => {
        const hook = renderHook(() => useOutputDirWatcher('session-1', '/repos/project'))
        result = hook.result
      })

      expect(result!.current.suggestGitignore).toBe(false)
    })

    it('does not suggest when .broomy/ is in repo .gitignore (legacy)', async () => {
      vi.mocked(window.fs.exists).mockImplementation(async (path: string) => {
        if (path === '/repos/project/.broomy/output') return true
        if (path === '/repos/project/.broomy/.gitignore') return false
        if (path === '/repos/project/.gitignore') return true
        return false
      })
      vi.mocked(window.fs.readDir).mockResolvedValue([
        { name: 'review.md', path: '/repos/project/.broomy/output/review.md', isDirectory: false, isFile: true, isSymlink: false },
      ] as never)
      vi.mocked(window.fs.readFile).mockResolvedValue('.broomy/\n')

      let result: { current: OutputDirState }
      await act(async () => {
        const hook = renderHook(() => useOutputDirWatcher('session-1', '/repos/project'))
        result = hook.result
      })

      expect(result!.current.suggestGitignore).toBe(false)
    })

    it('does not suggest when output directory is empty', async () => {
      vi.mocked(window.fs.exists).mockImplementation(async (path: string) => {
        if (path === '/repos/project/.broomy/output') return true
        return false
      })
      vi.mocked(window.fs.readDir).mockResolvedValue([])

      let result: { current: OutputDirState }
      await act(async () => {
        const hook = renderHook(() => useOutputDirWatcher('session-1', '/repos/project'))
        result = hook.result
      })

      expect(result!.current.suggestGitignore).toBe(false)
    })

    it('dismiss hides the suggestion', async () => {
      vi.mocked(window.fs.exists).mockImplementation(async (path: string) => {
        if (path === '/repos/project/.broomy/output') return true
        return false
      })
      vi.mocked(window.fs.readDir).mockResolvedValue([
        { name: 'review.md', path: '/repos/project/.broomy/output/review.md', isDirectory: false, isFile: true, isSymlink: false },
      ] as never)

      let result: { current: OutputDirState }
      await act(async () => {
        const hook = renderHook(() => useOutputDirWatcher('session-1', '/repos/project'))
        result = hook.result
      })

      expect(result!.current.suggestGitignore).toBe(true)

      act(() => {
        result!.current.dismissGitignore()
      })

      expect(result!.current.suggestGitignore).toBe(false)
    })
  })
})
