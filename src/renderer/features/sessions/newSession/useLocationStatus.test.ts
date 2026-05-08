// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, cleanup } from '@testing-library/react'
import '../../../../test/react-setup'
import { useLocationStatus } from './useLocationStatus'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.mocked(window.fs.exists).mockReset()
})

describe('useLocationStatus', () => {
  it('returns "unknown" when location is empty', () => {
    const { result } = renderHook(() => useLocationStatus('', 'repo'))
    expect(result.current.kind).toBe('unknown')
  })

  it('returns "will-create" when location does not exist', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(false)
    const { result } = renderHook(() => useLocationStatus('/some/path', 'repo'))
    await waitFor(() => {
      expect(result.current.kind).toBe('will-create')
    })
  })

  it('returns "ok" when location exists and target does not', async () => {
    vi.mocked(window.fs.exists).mockImplementation((p: string) =>
      Promise.resolve(p === '/some/path')
    )
    const { result } = renderHook(() => useLocationStatus('/some/path', 'repo'))
    await waitFor(() => {
      expect(result.current.kind).toBe('ok')
    })
  })

  it('returns "target-exists" when both location and target exist', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(true)
    const { result } = renderHook(() => useLocationStatus('/some/path', 'repo'))
    await waitFor(() => {
      expect(result.current.kind).toBe('target-exists')
    })
  })

  it('returns "ok" when location exists and repoName is empty', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(true)
    const { result } = renderHook(() => useLocationStatus('/some/path', ''))
    await waitFor(() => {
      expect(result.current.kind).toBe('ok')
    })
  })

  it('returns "unknown" if fs.exists rejects', async () => {
    vi.mocked(window.fs.exists).mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useLocationStatus('/some/path', 'repo'))
    // Wait long enough for the 200ms debounce + the rejected promise to flush
    await new Promise((r) => setTimeout(r, 300))
    expect(result.current.kind).toBe('unknown')
  })

  it('cancels pending check when unmounted before timer fires', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(true)
    const { unmount } = renderHook(() => useLocationStatus('/some/path', 'repo'))
    unmount()
    await new Promise((r) => setTimeout(r, 250))
    expect(window.fs.exists).not.toHaveBeenCalled()
  })

  it('does not update state if aborted between awaits', async () => {
    let resolveSecond: ((v: boolean) => void) | undefined
    const calls: string[] = []
    vi.mocked(window.fs.exists).mockImplementation((p: string) => {
      calls.push(p)
      if (p === '/some/path') return Promise.resolve(true)
      return new Promise<boolean>((r) => { resolveSecond = r })
    })

    const { result, unmount } = renderHook(() => useLocationStatus('/some/path', 'repo'))
    // Wait for first call to land and second call to start
    await waitFor(() => expect(calls).toContain('/some/path/repo'))

    // Unmount aborts; resolving after abort should be a no-op
    unmount()
    resolveSecond?.(true)
    await new Promise((r) => setTimeout(r, 50))

    // Should remain "unknown" — set state was never called after abort
    expect(result.current.kind).toBe('unknown')
  })
})
