// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useLayoutClamp } from './useLayoutClamp'
import { SIDEBAR_MIN, EXPLORER_MIN, TUTORIAL_MIN, AGENT_MIN_WIDTH } from './useDividerResize'
import type { LayoutSizes } from '../store/sessions'

type ResizeCallback = () => void

describe('useLayoutClamp', () => {
  let resizeCallback: ResizeCallback | null = null
  const mockDisconnect = vi.fn()
  const mockObserve = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    resizeCallback = null

    // Mock ResizeObserver — must use function() not arrow for constructor
    globalThis.ResizeObserver = function MockResizeObserver(cb: ResizeCallback) {
      resizeCallback = cb
      return {
        observe: mockObserve,
        disconnect: mockDisconnect,
        unobserve: vi.fn(),
      }
    } as unknown as typeof ResizeObserver
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const defaultLayoutSizes: LayoutSizes = {
    explorerWidth: 250,
    fileViewerSize: 300,
    userTerminalHeight: 200,
    diffPanelWidth: 400,
    tutorialPanelWidth: 300,
  }

  function makeRef(width = 1200): { current: HTMLDivElement } {
    const el = document.createElement('div')
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      width,
      height: 800,
      top: 0,
      left: 0,
      bottom: 800,
      right: width,
      x: 0,
      y: 0,
      toJSON: () => {},
    })
    return { current: el }
  }

  it('observes the main content element', () => {
    const ref = makeRef()
    renderHook(() =>
      useLayoutClamp({
        mainContentRef: ref,
        showSidebar: false,
        showExplorer: false,
        showTutorial: false,
        sidebarWidth: 200,
        layoutSizes: defaultLayoutSizes,
        onSidebarWidthChange: vi.fn(),
        onLayoutSizeChange: vi.fn(),
      }),
    )

    expect(mockObserve).toHaveBeenCalledWith(ref.current)
  })

  it('disconnects on unmount', () => {
    const ref = makeRef()
    const { unmount } = renderHook(() =>
      useLayoutClamp({
        mainContentRef: ref,
        showSidebar: false,
        showExplorer: false,
        showTutorial: false,
        sidebarWidth: 200,
        layoutSizes: defaultLayoutSizes,
        onSidebarWidthChange: vi.fn(),
        onLayoutSizeChange: vi.fn(),
      }),
    )

    unmount()
    expect(mockDisconnect).toHaveBeenCalled()
  })

  it('does nothing when agent width is above minimum', () => {
    const ref = makeRef(1200)
    const onLayoutSizeChange = vi.fn()
    const onSidebarWidthChange = vi.fn()

    renderHook(() =>
      useLayoutClamp({
        mainContentRef: ref,
        showSidebar: true,
        showExplorer: true,
        showTutorial: false,
        sidebarWidth: 200,
        layoutSizes: defaultLayoutSizes,
        onSidebarWidthChange,
        onLayoutSizeChange,
      }),
    )

    resizeCallback?.()

    expect(onLayoutSizeChange).not.toHaveBeenCalled()
    expect(onSidebarWidthChange).not.toHaveBeenCalled()
  })

  it('shrinks tutorial panel first when agent width is below minimum', () => {
    // Total = 600, sidebar=200, explorer=250, tutorial=300 → agent = 600-750 = -150
    const ref = makeRef(600)
    const onLayoutSizeChange = vi.fn()
    const onSidebarWidthChange = vi.fn()

    renderHook(() =>
      useLayoutClamp({
        mainContentRef: ref,
        showSidebar: true,
        showExplorer: true,
        showTutorial: true,
        sidebarWidth: 200,
        layoutSizes: defaultLayoutSizes,
        onSidebarWidthChange,
        onLayoutSizeChange,
      }),
    )

    resizeCallback?.()

    // Tutorial should be shrunk first
    expect(onLayoutSizeChange).toHaveBeenCalledWith('tutorialPanelWidth', expect.any(Number))
  })

  it('shrinks explorer after tutorial is at minimum', () => {
    // Tutorial already at minimum
    const layoutSizes = { ...defaultLayoutSizes, tutorialPanelWidth: TUTORIAL_MIN }
    // Total = 600, sidebar=200, explorer=250, tutorial=TUTORIAL_MIN → need shrink
    const ref = makeRef(600)
    const onLayoutSizeChange = vi.fn()

    renderHook(() =>
      useLayoutClamp({
        mainContentRef: ref,
        showSidebar: true,
        showExplorer: true,
        showTutorial: true,
        sidebarWidth: 200,
        layoutSizes,
        onSidebarWidthChange: vi.fn(),
        onLayoutSizeChange,
      }),
    )

    resizeCallback?.()

    expect(onLayoutSizeChange).toHaveBeenCalledWith('explorerWidth', expect.any(Number))
  })

  it('shrinks sidebar as last resort', () => {
    // All panels at minimum except sidebar
    const layoutSizes = {
      ...defaultLayoutSizes,
      explorerWidth: EXPLORER_MIN,
      tutorialPanelWidth: TUTORIAL_MIN,
    }
    // Total small enough that sidebar needs shrinking
    // 3 visible panels = 3 dividers × 6px = 18px
    const DIVIDER_WIDTH = 6
    const dividers = 3 * DIVIDER_WIDTH
    const usedByPanels = EXPLORER_MIN + TUTORIAL_MIN
    const totalWidth = usedByPanels + dividers + 300 + AGENT_MIN_WIDTH - 50 // 50px deficit
    const ref = makeRef(totalWidth)
    const onSidebarWidthChange = vi.fn()

    renderHook(() =>
      useLayoutClamp({
        mainContentRef: ref,
        showSidebar: true,
        showExplorer: true,
        showTutorial: true,
        sidebarWidth: 300,
        layoutSizes,
        onSidebarWidthChange,
        onLayoutSizeChange: vi.fn(),
      }),
    )

    resizeCallback?.()

    expect(onSidebarWidthChange).toHaveBeenCalledWith(250) // 300 - 50
  })

  it('does nothing when ref.current is null', () => {
    const ref = { current: null } as unknown as { current: HTMLDivElement }
    const onLayoutSizeChange = vi.fn()

    renderHook(() =>
      useLayoutClamp({
        mainContentRef: ref,
        showSidebar: false,
        showExplorer: false,
        showTutorial: false,
        sidebarWidth: 200,
        layoutSizes: defaultLayoutSizes,
        onSidebarWidthChange: vi.fn(),
        onLayoutSizeChange,
      }),
    )

    expect(mockObserve).not.toHaveBeenCalled()
  })

  it('does nothing when total width is zero', () => {
    const ref = makeRef(0)
    const onLayoutSizeChange = vi.fn()

    renderHook(() =>
      useLayoutClamp({
        mainContentRef: ref,
        showSidebar: false,
        showExplorer: false,
        showTutorial: false,
        sidebarWidth: 200,
        layoutSizes: defaultLayoutSizes,
        onSidebarWidthChange: vi.fn(),
        onLayoutSizeChange,
      }),
    )

    resizeCallback?.()

    expect(onLayoutSizeChange).not.toHaveBeenCalled()
  })

  it('handles only sidebar visible', () => {
    // Total = 356, sidebar=200, 1 divider=6 → agent = 150, need to recover 50
    const DIVIDER_WIDTH = 6
    const ref = makeRef(350 + DIVIDER_WIDTH)
    const onSidebarWidthChange = vi.fn()

    renderHook(() =>
      useLayoutClamp({
        mainContentRef: ref,
        showSidebar: true,
        showExplorer: false,
        showTutorial: false,
        sidebarWidth: 200,
        layoutSizes: defaultLayoutSizes,
        onSidebarWidthChange,
        onLayoutSizeChange: vi.fn(),
      }),
    )

    resizeCallback?.()

    expect(onSidebarWidthChange).toHaveBeenCalledWith(SIDEBAR_MIN)
  })

  it('handles only explorer visible', () => {
    // Total = 406, explorer=250, 1 divider=6 → agent = 150, deficit = 50
    const DIVIDER_WIDTH = 6
    const ref = makeRef(400 + DIVIDER_WIDTH)
    const onLayoutSizeChange = vi.fn()

    renderHook(() =>
      useLayoutClamp({
        mainContentRef: ref,
        showSidebar: false,
        showExplorer: true,
        showTutorial: false,
        sidebarWidth: 200,
        layoutSizes: defaultLayoutSizes,
        onSidebarWidthChange: vi.fn(),
        onLayoutSizeChange,
      }),
    )

    resizeCallback?.()

    expect(onLayoutSizeChange).toHaveBeenCalledWith('explorerWidth', 200) // 250 - 50
  })

  it('does not shrink panels below their minimum', () => {
    // Explorer at minimum already, sidebar should not be touched if hidden
    const layoutSizes = { ...defaultLayoutSizes, explorerWidth: EXPLORER_MIN }
    const ref = makeRef(300)
    const onLayoutSizeChange = vi.fn()
    const onSidebarWidthChange = vi.fn()

    renderHook(() =>
      useLayoutClamp({
        mainContentRef: ref,
        showSidebar: false,
        showExplorer: true,
        showTutorial: false,
        sidebarWidth: 200,
        layoutSizes,
        onSidebarWidthChange,
        onLayoutSizeChange,
      }),
    )

    resizeCallback?.()

    // Explorer is already at minimum, can't shrink
    expect(onLayoutSizeChange).not.toHaveBeenCalled()
    // Sidebar is hidden, shouldn't be touched
    expect(onSidebarWidthChange).not.toHaveBeenCalled()
  })
})
