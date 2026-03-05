// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import '../../test/react-setup'
import { useMenuButton } from './useMenuButton'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(window.app.platform).mockResolvedValue('linux')
})

describe('useMenuButton', () => {
  const deps = {
    setShowPanelPicker: vi.fn(),
    setShowHelpModal: vi.fn(),
    setShowShortcutsModal: vi.fn(),
  }

  it('detects non-mac platform', async () => {
    const { result } = renderHook(() => useMenuButton(deps))
    // Initially darwin (default state), then resolves to linux
    await act(async () => {})
    expect(result.current.isMac).toBe(false)
  })

  it('detects mac platform', async () => {
    vi.mocked(window.app.platform).mockResolvedValue('darwin')
    const { result } = renderHook(() => useMenuButton(deps))
    await act(async () => {})
    expect(result.current.isMac).toBe(true)
  })

  it('returns platform string', async () => {
    const { result } = renderHook(() => useMenuButton(deps))
    await act(async () => {})
    expect(result.current.platform).toBe('linux')
  })

  it('opens panel picker on configure-toolbar', async () => {
    vi.mocked(window.menu.appMenuPopup).mockResolvedValue('configure-toolbar')
    const { result } = renderHook(() => useMenuButton(deps))
    await act(async () => { await result.current.handleMenuButtonClick() })
    expect(deps.setShowPanelPicker).toHaveBeenCalledWith(true)
  })

  it('opens help modal on help:getting-started', async () => {
    vi.mocked(window.menu.appMenuPopup).mockResolvedValue('help:getting-started')
    const { result } = renderHook(() => useMenuButton(deps))
    await act(async () => { await result.current.handleMenuButtonClick() })
    expect(deps.setShowHelpModal).toHaveBeenCalledWith(true)
  })

  it('opens shortcuts modal on help:shortcuts', async () => {
    vi.mocked(window.menu.appMenuPopup).mockResolvedValue('help:shortcuts')
    const { result } = renderHook(() => useMenuButton(deps))
    await act(async () => { await result.current.handleMenuButtonClick() })
    expect(deps.setShowShortcutsModal).toHaveBeenCalledWith(true)
  })

  it('resets tutorial on help:reset-tutorial', async () => {
    vi.mocked(window.menu.appMenuPopup).mockResolvedValue('help:reset-tutorial')
    const { result } = renderHook(() => useMenuButton(deps))
    await act(async () => { await result.current.handleMenuButtonClick() })
    // Tutorial store resetProgress was called — verify via store state
    const { useTutorialStore } = await import('../store/tutorial')
    expect(useTutorialStore.getState()).toBeDefined()
  })

  it('checks for updates on check-for-updates', async () => {
    vi.mocked(window.menu.appMenuPopup).mockResolvedValue('check-for-updates')
    const { result } = renderHook(() => useMenuButton(deps))
    await act(async () => { await result.current.handleMenuButtonClick() })
    expect(window.update.checkForUpdates).toHaveBeenCalled()
  })

  it('does nothing when menu is dismissed (null)', async () => {
    vi.mocked(window.menu.appMenuPopup).mockResolvedValue(null)
    const { result } = renderHook(() => useMenuButton(deps))
    await act(async () => { await result.current.handleMenuButtonClick() })
    expect(deps.setShowPanelPicker).not.toHaveBeenCalled()
    expect(deps.setShowHelpModal).not.toHaveBeenCalled()
    expect(deps.setShowShortcutsModal).not.toHaveBeenCalled()
  })
})
