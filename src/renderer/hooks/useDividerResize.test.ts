// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDividerResize } from './useDividerResize'
import type { LayoutSizes } from '../store/sessions'

function makeParams(overrides: Partial<Parameters<typeof useDividerResize>[0]> = {}) {
  return {
    fileViewerPosition: 'top' as const,
    sidebarWidth: 224,
    showSidebar: true,
    showExplorer: true,
    layoutSizes: {
      explorerWidth: 250,
      fileViewerSize: 300,
      userTerminalHeight: 200,
      diffPanelWidth: 400,
      reviewPanelWidth: 350,
      tutorialPanelWidth: 300,
    } satisfies LayoutSizes,
    onSidebarWidthChange: vi.fn(),
    onLayoutSizeChange: vi.fn(),
    ...overrides,
  }
}

function fireMouseEvent(type: string, clientX: number, clientY: number = 0) {
  const event = new MouseEvent(type, { clientX, clientY, bubbles: true })
  document.dispatchEvent(event)
}

describe('useDividerResize', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns refs and draggingDivider initially null', () => {
    const { result } = renderHook(() => useDividerResize(makeParams()))
    expect(result.current.draggingDivider).toBeNull()
    expect(result.current.containerRef).toBeDefined()
    expect(result.current.mainContentRef).toBeDefined()
  })

  it('handleMouseDown returns a function that sets draggingDivider', () => {
    const { result } = renderHook(() => useDividerResize(makeParams()))
    const handler = result.current.handleMouseDown('sidebar')
    expect(typeof handler).toBe('function')
    // Simulate calling it with a React mouse event
    act(() => {
      handler({ preventDefault: vi.fn() } as unknown as React.MouseEvent)
    })
    expect(result.current.draggingDivider).toBe('sidebar')
  })

  it('mouseup clears draggingDivider', () => {
    const { result } = renderHook(() => useDividerResize(makeParams()))
    act(() => {
      result.current.handleMouseDown('explorer')({ preventDefault: vi.fn() } as unknown as React.MouseEvent)
    })
    expect(result.current.draggingDivider).toBe('explorer')
    act(() => fireMouseEvent('mouseup', 0))
    expect(result.current.draggingDivider).toBeNull()
  })

  // --- sidebar drag ---
  it('sidebar drag calls onSidebarWidthChange clamped 150..400', () => {
    const params = makeParams()
    const { result } = renderHook(() => useDividerResize(params))

    // Mock mainContentRef bounding rect
    Object.defineProperty(result.current.mainContentRef, 'current', {
      value: { getBoundingClientRect: () => ({ left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800 }) },
      writable: true,
    })

    act(() => {
      result.current.handleMouseDown('sidebar')({ preventDefault: vi.fn() } as unknown as React.MouseEvent)
    })

    // Move to 250px
    act(() => fireMouseEvent('mousemove', 250))
    expect(params.onSidebarWidthChange).toHaveBeenCalledWith(250)

    // Move below minimum -> clamped to 150
    act(() => fireMouseEvent('mousemove', 50))
    expect(params.onSidebarWidthChange).toHaveBeenCalledWith(150)

    // Move above maximum -> clamped to 400
    act(() => fireMouseEvent('mousemove', 500))
    expect(params.onSidebarWidthChange).toHaveBeenCalledWith(400)
  })

  // --- explorer drag ---
  it('explorer drag calls onLayoutSizeChange with explorerWidth clamped 150..500', () => {
    const params = makeParams({ showSidebar: true, sidebarWidth: 200 })
    const { result } = renderHook(() => useDividerResize(params))

    Object.defineProperty(result.current.mainContentRef, 'current', {
      value: { getBoundingClientRect: () => ({ left: 0, top: 0, right: 1200, bottom: 800, width: 1200, height: 800 }) },
      writable: true,
    })

    act(() => {
      result.current.handleMouseDown('explorer')({ preventDefault: vi.fn() } as unknown as React.MouseEvent)
    })

    // 200 + 300 = 500, offset for sidebar = 200, new width = 500 - 200 = 300
    act(() => fireMouseEvent('mousemove', 500))
    expect(params.onLayoutSizeChange).toHaveBeenCalledWith('explorerWidth', 300)
  })

  it('explorer drag uses 0 offset when sidebar is hidden', () => {
    const params = makeParams({ showSidebar: false })
    const { result } = renderHook(() => useDividerResize(params))

    Object.defineProperty(result.current.mainContentRef, 'current', {
      value: { getBoundingClientRect: () => ({ left: 0, top: 0, right: 1200, bottom: 800, width: 1200, height: 800 }) },
      writable: true,
    })

    act(() => {
      result.current.handleMouseDown('explorer')({ preventDefault: vi.fn() } as unknown as React.MouseEvent)
    })

    act(() => fireMouseEvent('mousemove', 300))
    expect(params.onLayoutSizeChange).toHaveBeenCalledWith('explorerWidth', 300)
  })

  // --- review drag ---
  it('review drag accounts for sidebar and explorer width', () => {
    const params = makeParams({
      showSidebar: true,
      sidebarWidth: 200,
      showExplorer: true,
      layoutSizes: {
        explorerWidth: 250,
        fileViewerSize: 300,
        userTerminalHeight: 200,
        diffPanelWidth: 400,
        reviewPanelWidth: 350,
        tutorialPanelWidth: 300,
      },
    })
    const { result } = renderHook(() => useDividerResize(params))

    Object.defineProperty(result.current.mainContentRef, 'current', {
      value: { getBoundingClientRect: () => ({ left: 0, top: 0, right: 1200, bottom: 800, width: 1200, height: 800 }) },
      writable: true,
    })

    act(() => {
      result.current.handleMouseDown('review')({ preventDefault: vi.fn() } as unknown as React.MouseEvent)
    })

    // offset = 200 (sidebar) + 250 (explorer) = 450, clientX = 750, newWidth = 300
    act(() => fireMouseEvent('mousemove', 750))
    expect(params.onLayoutSizeChange).toHaveBeenCalledWith('reviewPanelWidth', 300)
  })

  it('review drag clamps to 250..600', () => {
    const params = makeParams({ showSidebar: false, showExplorer: false })
    const { result } = renderHook(() => useDividerResize(params))

    Object.defineProperty(result.current.mainContentRef, 'current', {
      value: { getBoundingClientRect: () => ({ left: 0, top: 0, right: 1200, bottom: 800, width: 1200, height: 800 }) },
      writable: true,
    })

    act(() => {
      result.current.handleMouseDown('review')({ preventDefault: vi.fn() } as unknown as React.MouseEvent)
    })

    // Below min -> 250
    act(() => fireMouseEvent('mousemove', 100))
    expect(params.onLayoutSizeChange).toHaveBeenCalledWith('reviewPanelWidth', 250)

    // Above max -> 600
    act(() => fireMouseEvent('mousemove', 900))
    expect(params.onLayoutSizeChange).toHaveBeenCalledWith('reviewPanelWidth', 600)
  })

  // --- fileViewer drag (top position) ---
  it('fileViewer drag in top position adjusts height', () => {
    const params = makeParams({ fileViewerPosition: 'top' })
    const { result } = renderHook(() => useDividerResize(params))

    Object.defineProperty(result.current.containerRef, 'current', {
      value: { getBoundingClientRect: () => ({ left: 0, top: 100, right: 1000, bottom: 900, width: 1000, height: 800 }) },
      writable: true,
    })

    act(() => {
      result.current.handleMouseDown('fileViewer')({ preventDefault: vi.fn() } as unknown as React.MouseEvent)
    })

    // clientY = 400, top = 100, newHeight = 300. maxHeight = 800 - 100 = 700
    act(() => fireMouseEvent('mousemove', 0, 400))
    expect(params.onLayoutSizeChange).toHaveBeenCalledWith('fileViewerSize', 300)
  })

  it('fileViewer drag in top position clamps height', () => {
    const params = makeParams({ fileViewerPosition: 'top' })
    const { result } = renderHook(() => useDividerResize(params))

    Object.defineProperty(result.current.containerRef, 'current', {
      value: { getBoundingClientRect: () => ({ left: 0, top: 0, right: 1000, bottom: 500, width: 1000, height: 500 }) },
      writable: true,
    })

    act(() => {
      result.current.handleMouseDown('fileViewer')({ preventDefault: vi.fn() } as unknown as React.MouseEvent)
    })

    // Below min -> 100
    act(() => fireMouseEvent('mousemove', 0, 50))
    expect(params.onLayoutSizeChange).toHaveBeenCalledWith('fileViewerSize', 100)

    // Above max (500 - 100 = 400) -> 400
    act(() => fireMouseEvent('mousemove', 0, 600))
    expect(params.onLayoutSizeChange).toHaveBeenCalledWith('fileViewerSize', 400)
  })

  // --- fileViewer drag (left position) ---
  it('fileViewer drag in left position adjusts width', () => {
    const params = makeParams({ fileViewerPosition: 'left' })
    const { result } = renderHook(() => useDividerResize(params))

    Object.defineProperty(result.current.containerRef, 'current', {
      value: { getBoundingClientRect: () => ({ left: 100, top: 0, right: 1100, bottom: 800, width: 1000, height: 800 }) },
      writable: true,
    })

    act(() => {
      result.current.handleMouseDown('fileViewer')({ preventDefault: vi.fn() } as unknown as React.MouseEvent)
    })

    // clientX = 500, left = 100, newWidth = 400. maxWidth = 1000 - 200 = 800
    act(() => fireMouseEvent('mousemove', 500))
    expect(params.onLayoutSizeChange).toHaveBeenCalledWith('fileViewerSize', 400)
  })

  it('fileViewer drag in left position clamps width', () => {
    const params = makeParams({ fileViewerPosition: 'left' })
    const { result } = renderHook(() => useDividerResize(params))

    Object.defineProperty(result.current.containerRef, 'current', {
      value: { getBoundingClientRect: () => ({ left: 0, top: 0, right: 600, bottom: 800, width: 600, height: 800 }) },
      writable: true,
    })

    act(() => {
      result.current.handleMouseDown('fileViewer')({ preventDefault: vi.fn() } as unknown as React.MouseEvent)
    })

    // Below min -> 200
    act(() => fireMouseEvent('mousemove', 100))
    expect(params.onLayoutSizeChange).toHaveBeenCalledWith('fileViewerSize', 200)

    // Above max (600 - 200 = 400) -> 400
    act(() => fireMouseEvent('mousemove', 800))
    expect(params.onLayoutSizeChange).toHaveBeenCalledWith('fileViewerSize', 400)
  })

  // --- userTerminal drag ---
  it('userTerminal drag adjusts height from bottom', () => {
    const params = makeParams()
    const { result } = renderHook(() => useDividerResize(params))

    Object.defineProperty(result.current.containerRef, 'current', {
      value: { getBoundingClientRect: () => ({ left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800 }) },
      writable: true,
    })

    act(() => {
      result.current.handleMouseDown('userTerminal')({ preventDefault: vi.fn() } as unknown as React.MouseEvent)
    })

    // bottom = 800, clientY = 500, newHeight = 300
    act(() => fireMouseEvent('mousemove', 0, 500))
    expect(params.onLayoutSizeChange).toHaveBeenCalledWith('userTerminalHeight', 300)
  })

  it('userTerminal drag clamps height 100..500', () => {
    const params = makeParams()
    const { result } = renderHook(() => useDividerResize(params))

    Object.defineProperty(result.current.containerRef, 'current', {
      value: { getBoundingClientRect: () => ({ left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800 }) },
      writable: true,
    })

    act(() => {
      result.current.handleMouseDown('userTerminal')({ preventDefault: vi.fn() } as unknown as React.MouseEvent)
    })

    // Below min: bottom=800, clientY=750, height=50 -> clamped to 100
    act(() => fireMouseEvent('mousemove', 0, 750))
    expect(params.onLayoutSizeChange).toHaveBeenCalledWith('userTerminalHeight', 100)

    // Above max: bottom=800, clientY=100, height=700 -> clamped to 500
    act(() => fireMouseEvent('mousemove', 0, 100))
    expect(params.onLayoutSizeChange).toHaveBeenCalledWith('userTerminalHeight', 500)
  })

  // --- no ref available ---
  it('mousemove does nothing when mainContentRef is null for sidebar', () => {
    const params = makeParams()
    const { result } = renderHook(() => useDividerResize(params))

    // Do NOT set mainContentRef.current — it stays null by default
    act(() => {
      result.current.handleMouseDown('sidebar')({ preventDefault: vi.fn() } as unknown as React.MouseEvent)
    })
    act(() => fireMouseEvent('mousemove', 300))
    expect(params.onSidebarWidthChange).not.toHaveBeenCalled()
  })

  it('mousemove does nothing when containerRef is null for fileViewer', () => {
    const params = makeParams()
    const { result } = renderHook(() => useDividerResize(params))

    // Set mainContentRef but leave containerRef null
    Object.defineProperty(result.current.mainContentRef, 'current', {
      value: { getBoundingClientRect: () => ({ left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800 }) },
      writable: true,
    })

    act(() => {
      result.current.handleMouseDown('fileViewer')({ preventDefault: vi.fn() } as unknown as React.MouseEvent)
    })
    act(() => fireMouseEvent('mousemove', 300, 300))
    expect(params.onLayoutSizeChange).not.toHaveBeenCalled()
  })

  // --- cleanup ---
  it('cleans up event listeners on unmount', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    const params = makeParams()
    const { result, unmount } = renderHook(() => useDividerResize(params))

    act(() => {
      result.current.handleMouseDown('sidebar')({ preventDefault: vi.fn() } as unknown as React.MouseEvent)
    })

    unmount()
    expect(removeSpy).toHaveBeenCalledWith('mousemove', expect.any(Function))
    expect(removeSpy).toHaveBeenCalledWith('mouseup', expect.any(Function))
    removeSpy.mockRestore()
  })
})
