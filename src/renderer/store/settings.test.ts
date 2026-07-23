// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DEFAULT_APPEARANCE } from '../../shared/appearance'
import { useSettingsStore } from './settings'
import { useErrorStore } from './errors'

const save = vi.fn().mockResolvedValue({ success: true })

beforeEach(() => {
  vi.useFakeTimers()
  save.mockClear().mockResolvedValue({ success: true })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(window as any).settings = { getInitial: () => ({ appearance: DEFAULT_APPEARANCE, systemIsDark: true, resolvedTheme: 'dark' }), save }
  useSettingsStore.setState({ appearance: DEFAULT_APPEARANCE, systemIsDark: true, resolvedTheme: 'dark' })
})

afterEach(() => {
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
})

describe('settings store', () => {
  it('set merges the patch, re-derives the theme, and debounces the save', async () => {
    useSettingsStore.getState().set({ theme: 'light' })
    expect(useSettingsStore.getState().appearance.theme).toBe('light')
    expect(useSettingsStore.getState().resolvedTheme).toBe('light')
    expect(save).not.toHaveBeenCalled() // still debouncing
    await vi.advanceTimersByTimeAsync(200)
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ theme: 'light' }))
  })

  it("resolves a 'system' theme against systemIsDark", () => {
    useSettingsStore.setState({ systemIsDark: false })
    useSettingsStore.getState().set({ theme: 'system' })
    expect(useSettingsStore.getState().resolvedTheme).toBe('light')
  })

  it('coalesces rapid sets into a single save of the latest value', async () => {
    const { set } = useSettingsStore.getState()
    set({ appTextScale: 1.1 })
    set({ appTextScale: 1.25 })
    set({ appTextScale: 1.4 })
    await vi.advanceTimersByTimeAsync(200)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ appTextScale: 1.4 }))
  })

  it('surfaces an error toast when the save fails', async () => {
    save.mockResolvedValueOnce({ success: false, error: 'disk full' })
    const spy = vi.spyOn(useErrorStore.getState(), 'showErrorDetail')
    useSettingsStore.getState().set({ sidebarRailColored: false })
    await vi.advanceTimersByTimeAsync(200)
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ displayMessage: 'Could not save appearance settings', detail: 'disk full' }),
    )
  })

  it('applyRemote updates state WITHOUT scheduling a save, cancelling any pending one', async () => {
    useSettingsStore.getState().set({ theme: 'light' }) // queues a save
    useSettingsStore.getState().applyRemote({
      appearance: { ...DEFAULT_APPEARANCE, theme: 'hc' },
      systemIsDark: false,
      resolvedTheme: 'hc',
    })
    expect(useSettingsStore.getState().resolvedTheme).toBe('hc')
    await vi.advanceTimersByTimeAsync(200)
    expect(save).not.toHaveBeenCalled() // the queued save was cancelled
  })

  it('reset restores the defaults', async () => {
    useSettingsStore.setState({ appearance: { ...DEFAULT_APPEARANCE, theme: 'hc' } })
    useSettingsStore.getState().reset()
    expect(useSettingsStore.getState().appearance).toEqual(DEFAULT_APPEARANCE)
    await vi.advanceTimersByTimeAsync(200)
  })
})
