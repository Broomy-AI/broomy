// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { PanelProvider, usePanelRegistry, usePanelContext, usePanelVisibility, usePanelToggle, useToolbarPanels } from './PanelContext'
import { PANEL_IDS } from './types'
import type { ReactNode } from 'react'

function createWrapper(toolbarPanels: string[] = ['sidebar', 'explorer', 'agentTerminal', 'userTerminal', 'settings']) {
  return ({ children }: { children: ReactNode }) => (
    <PanelProvider
      toolbarPanels={toolbarPanels}
      onToolbarPanelsChange={vi.fn()}
    >
      {children}
    </PanelProvider>
  )
}

describe('PanelContext', () => {
  describe('usePanelRegistry', () => {
    it('throws when used outside PanelProvider', () => {
      expect(() => {
        renderHook(() => usePanelRegistry())
      }).toThrow('usePanelRegistry must be used within a PanelProvider')
    })

    it('returns registry within PanelProvider', () => {
      const { result } = renderHook(() => usePanelRegistry(), { wrapper: createWrapper() })
      expect(result.current).toBeDefined()
      expect(result.current.get(PANEL_IDS.SIDEBAR)).toBeDefined()
    })
  })

  describe('usePanelContext', () => {
    it('throws when used outside PanelProvider', () => {
      expect(() => {
        renderHook(() => usePanelContext())
      }).toThrow('usePanelContext must be used within a PanelProvider')
    })

    it('returns context within PanelProvider', () => {
      const { result } = renderHook(() => usePanelContext(), { wrapper: createWrapper() })
      expect(result.current.toolbarPanels).toBeDefined()
      expect(result.current.registry).toBeDefined()
    })
  })

  describe('usePanelVisibility', () => {
    it('returns global visibility for global panels', () => {
      const globalVisibility = { [PANEL_IDS.SIDEBAR]: false }
      const sessionVisibility = {}
      const { result } = renderHook(
        () => usePanelVisibility(PANEL_IDS.SIDEBAR, sessionVisibility, globalVisibility),
        { wrapper: createWrapper() }
      )
      expect(result.current).toBe(false)
    })

    it('returns session visibility for per-session panels', () => {
      const globalVisibility = {}
      const sessionVisibility = { [PANEL_IDS.EXPLORER]: true }
      const { result } = renderHook(
        () => usePanelVisibility(PANEL_IDS.EXPLORER, sessionVisibility, globalVisibility),
        { wrapper: createWrapper() }
      )
      expect(result.current).toBe(true)
    })

    it('returns default visibility when not explicitly set', () => {
      const { result } = renderHook(
        () => usePanelVisibility(PANEL_IDS.SIDEBAR, {}, {}),
        { wrapper: createWrapper() }
      )
      // Sidebar defaults to visible
      expect(result.current).toBe(true)
    })

    it('returns false for unknown panel ID', () => {
      const { result } = renderHook(
        () => usePanelVisibility('nonexistent', {}, {}),
        { wrapper: createWrapper() }
      )
      expect(result.current).toBe(false)
    })
  })

  describe('usePanelToggle', () => {
    it('calls onGlobalToggle for global panels', () => {
      const onToggle = vi.fn()
      const onGlobalToggle = vi.fn()
      const { result } = renderHook(
        () => usePanelToggle(PANEL_IDS.SIDEBAR, onToggle, onGlobalToggle),
        { wrapper: createWrapper() }
      )
      result.current()
      expect(onGlobalToggle).toHaveBeenCalledWith(PANEL_IDS.SIDEBAR)
      expect(onToggle).not.toHaveBeenCalled()
    })

    it('calls onToggle for per-session panels', () => {
      const onToggle = vi.fn()
      const onGlobalToggle = vi.fn()
      const { result } = renderHook(
        () => usePanelToggle(PANEL_IDS.EXPLORER, onToggle, onGlobalToggle),
        { wrapper: createWrapper() }
      )
      result.current()
      expect(onToggle).toHaveBeenCalledWith(PANEL_IDS.EXPLORER)
      expect(onGlobalToggle).not.toHaveBeenCalled()
    })

    it('does nothing for unknown panel', () => {
      const onToggle = vi.fn()
      const onGlobalToggle = vi.fn()
      const { result } = renderHook(
        () => usePanelToggle('nonexistent', onToggle, onGlobalToggle),
        { wrapper: createWrapper() }
      )
      result.current()
      expect(onToggle).not.toHaveBeenCalled()
      expect(onGlobalToggle).not.toHaveBeenCalled()
    })
  })

  describe('useToolbarPanels', () => {
    it('returns toolbar panels with shortcut keys', () => {
      const { result } = renderHook(
        () => useToolbarPanels(),
        { wrapper: createWrapper(['sidebar', 'explorer', 'agentTerminal']) }
      )
      expect(result.current).toHaveLength(3)
      expect(result.current[0].shortcutKey).toBe('1')
      expect(result.current[1].shortcutKey).toBe('2')
      expect(result.current[2].shortcutKey).toBe('3')
    })

    it('filters out panels not in registry', () => {
      const { result } = renderHook(
        () => useToolbarPanels(),
        { wrapper: createWrapper(['sidebar', 'nonexistent', 'explorer']) }
      )
      expect(result.current).toHaveLength(2)
      expect(result.current[0].id).toBe(PANEL_IDS.SIDEBAR)
      expect(result.current[1].id).toBe(PANEL_IDS.EXPLORER)
    })
  })
})
