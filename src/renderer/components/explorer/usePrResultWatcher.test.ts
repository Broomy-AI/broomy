// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import '../../../test/react-setup'
import { usePrResultWatcher } from './usePrResultWatcher'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('usePrResultWatcher', () => {
  const defaultConfig = {
    directory: '/repos/project',
    onUpdatePrState: vi.fn(),
    setPrStatus: vi.fn(),
  }

  it('sets up watcher on .broomy/output directory', () => {
    renderHook(() => usePrResultWatcher(defaultConfig))

    expect(window.fs.watch).toHaveBeenCalledWith(
      'pr-result-/repos/project',
      '/repos/project/.broomy/output',
    )
    expect(window.fs.onChange).toHaveBeenCalledWith(
      'pr-result-/repos/project',
      expect.any(Function),
    )
  })

  it('does not set up watcher when directory is undefined', () => {
    renderHook(() => usePrResultWatcher({ ...defaultConfig, directory: undefined }))

    expect(window.fs.watch).not.toHaveBeenCalled()
    expect(window.fs.onChange).not.toHaveBeenCalled()
  })

  it('cleans up watcher on unmount', () => {
    const removeListener = vi.fn()
    vi.mocked(window.fs.onChange).mockReturnValue(removeListener)

    const { unmount } = renderHook(() => usePrResultWatcher(defaultConfig))
    unmount()

    expect(removeListener).toHaveBeenCalled()
    expect(window.fs.unwatch).toHaveBeenCalledWith('pr-result-/repos/project')
  })

  it('ignores events for non-pr-result files', async () => {
    let changeHandler: (event: { eventType: string; filename: string | null }) => void = () => {}
    vi.mocked(window.fs.onChange).mockImplementation((_id, cb) => {
      changeHandler = cb
      return () => {}
    })

    renderHook(() => usePrResultWatcher(defaultConfig))
    changeHandler({ eventType: 'change', filename: 'plan.md' })

    // readFile should not be called for non-matching filenames
    expect(window.fs.readFile).not.toHaveBeenCalled()
  })

  it('reads pr-result.json and updates PR state on change event', async () => {
    vi.useFakeTimers()
    let changeHandler: (event: { eventType: string; filename: string | null }) => void = () => {}
    vi.mocked(window.fs.onChange).mockImplementation((_id, cb) => {
      changeHandler = cb
      return () => {}
    })
    vi.mocked(window.fs.readFile).mockResolvedValue(
      JSON.stringify({ url: 'https://github.com/pr/42', number: 42 }),
    )
    vi.mocked(window.gh.prStatus).mockResolvedValue({
      number: 42,
      title: 'Test PR',
      state: 'OPEN',
      url: 'https://github.com/pr/42',
      headRefName: 'feature/test',
      baseRefName: 'main',
    })

    renderHook(() => usePrResultWatcher(defaultConfig))
    changeHandler({ eventType: 'change', filename: 'pr-result.json' })

    // Advance past debounce
    await vi.advanceTimersByTimeAsync(300)
    // Let async work complete
    await vi.runAllTimersAsync()

    expect(window.fs.readFile).toHaveBeenCalledWith('/repos/project/.broomy/output/pr-result.json')
    expect(defaultConfig.onUpdatePrState).toHaveBeenCalledWith('OPEN', 42, 'https://github.com/pr/42')
    expect(window.gh.prStatus).toHaveBeenCalledWith('/repos/project')
    expect(defaultConfig.setPrStatus).toHaveBeenCalledWith({
      number: 42,
      title: 'Test PR',
      state: 'OPEN',
      url: 'https://github.com/pr/42',
      headRefName: 'feature/test',
      baseRefName: 'main',
    })

    vi.useRealTimers()
  })

  it('does not update PR state when url is missing from result', async () => {
    vi.useFakeTimers()
    let changeHandler: (event: { eventType: string; filename: string | null }) => void = () => {}
    vi.mocked(window.fs.onChange).mockImplementation((_id, cb) => {
      changeHandler = cb
      return () => {}
    })
    vi.mocked(window.fs.readFile).mockResolvedValue(JSON.stringify({ error: 'failed' }))

    renderHook(() => usePrResultWatcher(defaultConfig))
    changeHandler({ eventType: 'change', filename: 'pr-result.json' })

    await vi.advanceTimersByTimeAsync(300)
    await vi.runAllTimersAsync()

    expect(defaultConfig.onUpdatePrState).not.toHaveBeenCalled()

    vi.useRealTimers()
  })

  it('handles read errors gracefully', async () => {
    vi.useFakeTimers()
    let changeHandler: (event: { eventType: string; filename: string | null }) => void = () => {}
    vi.mocked(window.fs.onChange).mockImplementation((_id, cb) => {
      changeHandler = cb
      return () => {}
    })
    vi.mocked(window.fs.readFile).mockRejectedValue(new Error('ENOENT'))

    renderHook(() => usePrResultWatcher(defaultConfig))
    changeHandler({ eventType: 'change', filename: 'pr-result.json' })

    await vi.advanceTimersByTimeAsync(300)
    await vi.runAllTimersAsync()

    expect(defaultConfig.onUpdatePrState).not.toHaveBeenCalled()
    expect(defaultConfig.setPrStatus).not.toHaveBeenCalled()

    vi.useRealTimers()
  })

  it('debounces multiple rapid change events', async () => {
    vi.useFakeTimers()
    let changeHandler: (event: { eventType: string; filename: string | null }) => void = () => {}
    vi.mocked(window.fs.onChange).mockImplementation((_id, cb) => {
      changeHandler = cb
      return () => {}
    })
    vi.mocked(window.fs.readFile).mockResolvedValue(
      JSON.stringify({ url: 'https://github.com/pr/1', number: 1 }),
    )
    vi.mocked(window.gh.prStatus).mockResolvedValue(null)

    renderHook(() => usePrResultWatcher(defaultConfig))

    // Fire multiple events rapidly
    changeHandler({ eventType: 'change', filename: 'pr-result.json' })
    changeHandler({ eventType: 'change', filename: 'pr-result.json' })
    changeHandler({ eventType: 'change', filename: 'pr-result.json' })

    await vi.advanceTimersByTimeAsync(300)
    await vi.runAllTimersAsync()

    // readFile should only be called once due to debouncing
    expect(window.fs.readFile).toHaveBeenCalledTimes(1)

    vi.useRealTimers()
  })

  it('recreates watcher when directory changes', () => {
    const removeListener = vi.fn()
    vi.mocked(window.fs.onChange).mockReturnValue(removeListener)

    const { rerender } = renderHook(
      (props) => usePrResultWatcher(props),
      { initialProps: defaultConfig },
    )

    // Change directory
    rerender({ ...defaultConfig, directory: '/repos/other' })

    // Old watcher cleaned up
    expect(removeListener).toHaveBeenCalled()
    expect(window.fs.unwatch).toHaveBeenCalledWith('pr-result-/repos/project')

    // New watcher set up
    expect(window.fs.watch).toHaveBeenCalledWith(
      'pr-result-/repos/other',
      '/repos/other/.broomy/output',
    )
  })
})
