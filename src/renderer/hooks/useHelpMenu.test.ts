// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useHelpMenu } from './useHelpMenu'
import { useTutorialStore } from '../store/tutorial'
import type { HelpMenuEvent } from '../../preload/index'

// Mock the tutorial store
vi.mock('../store/tutorial', () => ({
  useTutorialStore: vi.fn(),
}))

describe('useHelpMenu', () => {
  let helpMenuCallback: ((event: HelpMenuEvent) => void) | null = null
  const mockUnsubscribe = vi.fn()
  const mockLoadTutorial = vi.fn()
  const mockMarkStepComplete = vi.fn()
  const mockResetProgress = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    helpMenuCallback = null

    // Set up the tutorial store mock
    vi.mocked(useTutorialStore).mockReturnValue({
      loadTutorial: mockLoadTutorial,
      markStepComplete: mockMarkStepComplete,
      resetProgress: mockResetProgress,
    } as unknown as ReturnType<typeof useTutorialStore>)

    // Capture the help menu callback
    vi.mocked(window.help.onHelpMenu).mockImplementation((callback) => {
      helpMenuCallback = callback
      return mockUnsubscribe
    })
  })

  describe('initialization', () => {
    it('loads tutorial on mount', () => {
      renderHook(() => useHelpMenu('profile-1'))
      expect(mockLoadTutorial).toHaveBeenCalledWith('profile-1')
    })

    it('loads tutorial with undefined profileId', () => {
      renderHook(() => useHelpMenu(undefined))
      expect(mockLoadTutorial).toHaveBeenCalledWith(undefined)
    })

    it('registers help menu listener', () => {
      renderHook(() => useHelpMenu('profile-1'))
      expect(window.help.onHelpMenu).toHaveBeenCalledWith(expect.any(Function))
    })

    it('unsubscribes on unmount', () => {
      const { unmount } = renderHook(() => useHelpMenu('profile-1'))
      unmount()
      expect(mockUnsubscribe).toHaveBeenCalled()
    })
  })

  describe('initial state', () => {
    it('starts with modals hidden', () => {
      const { result } = renderHook(() => useHelpMenu('profile-1'))
      expect(result.current.showHelpModal).toBe(false)
      expect(result.current.showShortcutsModal).toBe(false)
    })
  })

  describe('help menu events', () => {
    it('shows help modal on getting-started event', () => {
      const { result } = renderHook(() => useHelpMenu('profile-1'))

      act(() => {
        helpMenuCallback!('getting-started')
      })

      expect(result.current.showHelpModal).toBe(true)
      expect(result.current.showShortcutsModal).toBe(false)
    })

    it('shows shortcuts modal on shortcuts event', () => {
      const { result } = renderHook(() => useHelpMenu('profile-1'))

      act(() => {
        helpMenuCallback!('shortcuts')
      })

      expect(result.current.showShortcutsModal).toBe(true)
      expect(result.current.showHelpModal).toBe(false)
    })

    it('resets tutorial on reset-tutorial event', () => {
      renderHook(() => useHelpMenu('profile-1'))

      act(() => {
        helpMenuCallback!('reset-tutorial')
      })

      expect(mockResetProgress).toHaveBeenCalled()
    })

    it('resets tutorial on any other event type (else branch)', () => {
      // The else branch handles 'reset-tutorial' and would handle
      // any future HelpMenuEvent variant not explicitly matched
      renderHook(() => useHelpMenu('profile-1'))

      act(() => {
        helpMenuCallback!('reset-tutorial')
      })

      expect(mockResetProgress).toHaveBeenCalled()
    })
  })

  describe('setters', () => {
    it('can toggle help modal', () => {
      const { result } = renderHook(() => useHelpMenu('profile-1'))

      act(() => {
        result.current.setShowHelpModal(true)
      })
      expect(result.current.showHelpModal).toBe(true)

      act(() => {
        result.current.setShowHelpModal(false)
      })
      expect(result.current.showHelpModal).toBe(false)
    })

    it('can toggle shortcuts modal', () => {
      const { result } = renderHook(() => useHelpMenu('profile-1'))

      act(() => {
        result.current.setShowShortcutsModal(true)
      })
      expect(result.current.showShortcutsModal).toBe(true)

      act(() => {
        result.current.setShowShortcutsModal(false)
      })
      expect(result.current.showShortcutsModal).toBe(false)
    })
  })

  describe('returned values', () => {
    it('exposes markStepComplete from tutorial store', () => {
      const { result } = renderHook(() => useHelpMenu('profile-1'))
      expect(result.current.markStepComplete).toBe(mockMarkStepComplete)
    })
  })
})
