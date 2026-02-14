// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import '../../../test/react-setup'

// Mock the repo store
vi.mock('../../store/repos', () => ({
  useRepoStore: vi.fn().mockImplementation((selector: (s: { repos: unknown[] }) => unknown) =>
    selector({ repos: [] })
  ),
}))

import { useSourceControlData } from './useSourceControlData'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useSourceControlData', () => {
  const defaultProps = {
    directory: '/repos/project',
    gitStatus: [],
    syncStatus: { current: 'feature/test', tracking: 'origin/feature/test', ahead: 0, behind: 0 },
    scView: 'working' as const,
  }

  it('returns initial state values', () => {
    const { result } = renderHook(() => useSourceControlData(defaultProps))

    expect(result.current.commitMessage).toBe('')
    expect(result.current.isCommitting).toBe(false)
    expect(result.current.commitError).toBeNull()
    expect(result.current.isSyncing).toBe(false)
    expect(result.current.isSyncingWithMain).toBe(false)
    expect(result.current.gitOpError).toBeNull()
    expect(result.current.branchChanges).toEqual([])
    expect(result.current.branchBaseName).toBe('main')
  })

  it('computes staged and unstaged files', () => {
    const gitStatus = [
      { path: 'src/index.ts', status: 'modified', staged: true },
      { path: 'src/app.ts', status: 'added', staged: false },
      { path: 'src/utils.ts', status: 'modified', staged: true },
    ]
    const { result } = renderHook(() =>
      useSourceControlData({ ...defaultProps, gitStatus })
    )

    expect(result.current.stagedFiles).toHaveLength(2)
    expect(result.current.unstagedFiles).toHaveLength(1)
    expect(result.current.stagedFiles[0].path).toBe('src/index.ts')
    expect(result.current.unstagedFiles[0].path).toBe('src/app.ts')
  })

  it('updates commitMessage via setCommitMessage', () => {
    const { result } = renderHook(() => useSourceControlData(defaultProps))

    act(() => {
      result.current.setCommitMessage('test message')
    })

    expect(result.current.commitMessage).toBe('test message')
  })

  it('updates isCommitting via setIsCommitting', () => {
    const { result } = renderHook(() => useSourceControlData(defaultProps))

    act(() => {
      result.current.setIsCommitting(true)
    })

    expect(result.current.isCommitting).toBe(true)
  })

  it('updates commitError via setCommitError', () => {
    const { result } = renderHook(() => useSourceControlData(defaultProps))

    act(() => {
      result.current.setCommitError('hook failed')
    })

    expect(result.current.commitError).toBe('hook failed')
  })

  it('updates gitOpError via setGitOpError', () => {
    const { result } = renderHook(() => useSourceControlData(defaultProps))

    act(() => {
      result.current.setGitOpError({ operation: 'Push', message: 'failed' })
    })

    expect(result.current.gitOpError).toEqual({ operation: 'Push', message: 'failed' })
  })

  it('fetches branch changes when scView is branch', async () => {
    vi.mocked(window.git.branchChanges).mockResolvedValue({
      files: [{ path: 'src/index.ts', status: 'modified' }],
      baseBranch: 'main',
      mergeBase: 'abc123',
    })

    const { result } = renderHook(() =>
      useSourceControlData({ ...defaultProps, scView: 'branch' })
    )

    // Wait for the async effect to resolve
    await act(async () => {
      await new Promise(r => setTimeout(r, 0))
    })

    expect(window.git.branchChanges).toHaveBeenCalledWith('/repos/project')
    expect(result.current.branchChanges).toEqual([{ path: 'src/index.ts', status: 'modified' }])
    expect(result.current.branchBaseName).toBe('main')
    expect(result.current.branchMergeBase).toBe('abc123')
  })

  it('fetches branch commits when scView is commits', async () => {
    vi.mocked(window.git.branchCommits).mockResolvedValue({
      commits: [
        { hash: 'abc123', shortHash: 'abc123', message: 'Fix', author: 'test', date: '2024-01-01' },
      ],
      baseBranch: 'main',
    })

    const { result } = renderHook(() =>
      useSourceControlData({ ...defaultProps, scView: 'commits' })
    )

    await act(async () => {
      await new Promise(r => setTimeout(r, 0))
    })

    expect(window.git.branchCommits).toHaveBeenCalledWith('/repos/project')
    expect(result.current.branchCommits).toHaveLength(1)
    expect(result.current.branchCommits[0].hash).toBe('abc123')
  })

  it('resets state when directory changes', () => {
    const { result, rerender } = renderHook(
      (props) => useSourceControlData(props),
      { initialProps: defaultProps }
    )

    act(() => {
      result.current.setCommitError('some error')
      result.current.setGitOpError({ operation: 'Push', message: 'failed' })
    })

    expect(result.current.commitError).toBe('some error')

    // Change directory
    rerender({ ...defaultProps, directory: '/repos/other-project' })

    expect(result.current.commitError).toBeNull()
    expect(result.current.gitOpError).toBeNull()
  })

  it('provides the gitStatus from props', () => {
    const gitStatus = [{ path: 'src/index.ts', status: 'modified', staged: false }]
    const { result } = renderHook(() =>
      useSourceControlData({ ...defaultProps, gitStatus })
    )

    expect(result.current.gitStatus).toEqual(gitStatus)
  })

  it('fetches PR status on mount', async () => {
    vi.mocked(window.gh.prStatus).mockResolvedValue({
      number: 42,
      title: 'Test PR',
      state: 'OPEN',
      url: 'https://github.com/test/pr/42',
    })
    vi.mocked(window.gh.hasWriteAccess).mockResolvedValue(true)
    vi.mocked(window.git.headCommit).mockResolvedValue('abc123')

    const { result } = renderHook(() => useSourceControlData(defaultProps))

    await act(async () => {
      await new Promise(r => setTimeout(r, 0))
    })

    expect(window.gh.prStatus).toHaveBeenCalledWith('/repos/project')
    expect(result.current.prStatus).toEqual({
      number: 42,
      title: 'Test PR',
      state: 'OPEN',
      url: 'https://github.com/test/pr/42',
    })
    expect(result.current.hasWriteAccess).toBe(true)
  })
})
