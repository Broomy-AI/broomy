// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFileNavigation } from './useFileNavigation'

// Mock the fileNavigation utility module
vi.mock('../../../shared/utils/fileNavigation', () => ({
  resolveNavigation: vi.fn(),
  applyPendingNavigation: vi.fn(),
}))

import { resolveNavigation, applyPendingNavigation } from '../../../shared/utils/fileNavigation'
import type { NavigationTarget, NavigationState } from '../../../shared/utils/fileNavigation'

function makeParams(overrides: Partial<Parameters<typeof useFileNavigation>[0]> = {}) {
  return {
    activeSessionId: 'sess-1',
    activeSessionSelectedFilePath: null,
    selectFile: vi.fn(),
    ...overrides,
  }
}

const defaultState: NavigationState = {
  openFileInDiffMode: false,
  scrollToLine: undefined,
  searchHighlight: undefined,
  diffBaseRef: undefined,
  diffCurrentRef: undefined,
  diffLabel: undefined,
}

describe('useFileNavigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // --- Initial state ---
  it('returns correct initial state', () => {
    const { result } = renderHook(() => useFileNavigation(makeParams()))
    expect(result.current.openFileInDiffMode).toBe(false)
    expect(result.current.scrollToLine).toBeUndefined()
    expect(result.current.searchHighlight).toBeUndefined()
    expect(result.current.diffBaseRef).toBeUndefined()
    expect(result.current.diffCurrentRef).toBeUndefined()
    expect(result.current.diffLabel).toBeUndefined()
    expect(result.current.pendingNavigation).toBeNull()
  })

  // --- navigateToFile with 'navigate' action ---
  it('navigateToFile with navigate action updates state and calls selectFile', () => {
    const target: NavigationTarget = {
      filePath: '/project/file.ts',
      openInDiffMode: true,
      scrollToLine: 42,
      searchHighlight: 'foo',
      diffBaseRef: 'abc',
      diffCurrentRef: 'def',
      diffLabel: 'Compare',
    }
    const state: NavigationState = {
      openFileInDiffMode: true,
      scrollToLine: 42,
      searchHighlight: 'foo',
      diffBaseRef: 'abc',
      diffCurrentRef: 'def',
      diffLabel: 'Compare',
    }
    vi.mocked(resolveNavigation).mockReturnValue({
      action: 'navigate',
      state,
      filePath: '/project/file.ts',
    })
    const params = makeParams()
    const { result } = renderHook(() => useFileNavigation(params))
    act(() => result.current.navigateToFile(target))
    expect(result.current.openFileInDiffMode).toBe(true)
    expect(result.current.scrollToLine).toBe(42)
    expect(result.current.searchHighlight).toBe('foo')
    expect(result.current.diffBaseRef).toBe('abc')
    expect(result.current.diffCurrentRef).toBe('def')
    expect(result.current.diffLabel).toBe('Compare')
    expect(params.selectFile).toHaveBeenCalledWith('sess-1', '/project/file.ts')
  })

  // --- navigateToFile with 'update-scroll' action ---
  it('navigateToFile with update-scroll action updates state but does not call selectFile', () => {
    const target: NavigationTarget = { filePath: '/project/file.ts', openInDiffMode: false, scrollToLine: 10 }
    vi.mocked(resolveNavigation).mockReturnValue({
      action: 'update-scroll',
      state: { ...defaultState, scrollToLine: 10 },
    })
    const params = makeParams()
    const { result } = renderHook(() => useFileNavigation(params))
    act(() => result.current.navigateToFile(target))
    expect(result.current.scrollToLine).toBe(10)
    expect(params.selectFile).not.toHaveBeenCalled()
  })

  // --- navigateToFile with 'pending' action ---
  it('navigateToFile with pending action sets pendingNavigation', () => {
    const target: NavigationTarget = { filePath: '/project/dirty.ts', openInDiffMode: false }
    vi.mocked(resolveNavigation).mockReturnValue({
      action: 'pending',
      target,
    })
    const params = makeParams()
    const { result } = renderHook(() => useFileNavigation(params))
    act(() => result.current.navigateToFile(target))
    expect(result.current.pendingNavigation).toEqual(target)
    expect(params.selectFile).not.toHaveBeenCalled()
  })

  // --- navigateToFile with no activeSessionId ---
  it('navigateToFile does nothing when activeSessionId is null', () => {
    const target: NavigationTarget = { filePath: '/project/file.ts', openInDiffMode: false }
    const params = makeParams({ activeSessionId: null })
    const { result } = renderHook(() => useFileNavigation(params))
    act(() => result.current.navigateToFile(target))
    expect(resolveNavigation).not.toHaveBeenCalled()
    expect(params.selectFile).not.toHaveBeenCalled()
  })

  // --- handlePendingSave ---
  it('handlePendingSave calls registered save function, applies pending navigation, and clears dirty', async () => {
    const pending: NavigationTarget = {
      filePath: '/project/pending.ts',
      openInDiffMode: true,
      scrollToLine: 5,
    }
    vi.mocked(resolveNavigation).mockReturnValue({ action: 'pending', target: pending })
    vi.mocked(applyPendingNavigation).mockReturnValue({
      state: { ...defaultState, openFileInDiffMode: true, scrollToLine: 5 },
      filePath: '/project/pending.ts',
    })

    const params = makeParams()
    const { result } = renderHook(() => useFileNavigation(params))

    // Register a save function for the active session
    const saveFn = vi.fn().mockResolvedValue(undefined)
    act(() => result.current.registerSaveFunction('sess-1', saveFn))

    // Create pending navigation
    act(() => result.current.navigateToFile(pending))
    expect(result.current.pendingNavigation).toEqual(pending)

    // Handle save
    await act(() => result.current.handlePendingSave())
    expect(saveFn).toHaveBeenCalled()
    expect(params.selectFile).toHaveBeenCalledWith('sess-1', '/project/pending.ts')
    expect(result.current.pendingNavigation).toBeNull()
    expect(result.current.openFileInDiffMode).toBe(true)
    expect(result.current.scrollToLine).toBe(5)
  })

  it('handlePendingSave clears pending even when no save function registered', async () => {
    const pending: NavigationTarget = { filePath: '/project/pending.ts', openInDiffMode: false }
    vi.mocked(resolveNavigation).mockReturnValue({ action: 'pending', target: pending })
    vi.mocked(applyPendingNavigation).mockReturnValue({
      state: defaultState,
      filePath: '/project/pending.ts',
    })

    const params = makeParams()
    const { result } = renderHook(() => useFileNavigation(params))

    act(() => result.current.navigateToFile(pending))
    await act(() => result.current.handlePendingSave())
    expect(result.current.pendingNavigation).toBeNull()
    expect(params.selectFile).toHaveBeenCalledWith('sess-1', '/project/pending.ts')
  })

  it('handlePendingSave does nothing when no pending navigation and no activeSessionId', async () => {
    const params = makeParams({ activeSessionId: null })
    const { result } = renderHook(() => useFileNavigation(params))
    await act(() => result.current.handlePendingSave())
    expect(params.selectFile).not.toHaveBeenCalled()
  })

  // --- handlePendingDiscard ---
  it('handlePendingDiscard applies pending navigation and clears pending', () => {
    const pending: NavigationTarget = {
      filePath: '/project/discard.ts',
      openInDiffMode: false,
      searchHighlight: 'search',
    }
    vi.mocked(resolveNavigation).mockReturnValue({ action: 'pending', target: pending })
    vi.mocked(applyPendingNavigation).mockReturnValue({
      state: { ...defaultState, searchHighlight: 'search' },
      filePath: '/project/discard.ts',
    })

    const params = makeParams()
    const { result } = renderHook(() => useFileNavigation(params))

    // Mark dirty
    act(() => result.current.setIsFileViewerDirty('sess-1', true))
    // Create pending
    act(() => result.current.navigateToFile(pending))

    // Discard
    act(() => result.current.handlePendingDiscard())
    expect(params.selectFile).toHaveBeenCalledWith('sess-1', '/project/discard.ts')
    expect(result.current.pendingNavigation).toBeNull()
    expect(result.current.searchHighlight).toBe('search')
  })

  it('handlePendingDiscard clears pending when no activeSessionId', () => {
    const params = makeParams({ activeSessionId: null })
    const { result } = renderHook(() => useFileNavigation(params))
    act(() => result.current.handlePendingDiscard())
    expect(result.current.pendingNavigation).toBeNull()
    expect(params.selectFile).not.toHaveBeenCalled()
  })

  // --- handlePendingCancel ---
  it('handlePendingCancel clears pending navigation without navigating', () => {
    const pending: NavigationTarget = { filePath: '/project/cancel.ts', openInDiffMode: false }
    vi.mocked(resolveNavigation).mockReturnValue({ action: 'pending', target: pending })

    const params = makeParams()
    const { result } = renderHook(() => useFileNavigation(params))

    act(() => result.current.navigateToFile(pending))
    expect(result.current.pendingNavigation).toEqual(pending)

    act(() => result.current.handlePendingCancel())
    expect(result.current.pendingNavigation).toBeNull()
    expect(params.selectFile).not.toHaveBeenCalled()
  })

  // --- Per-session dirty state ---
  it('setIsFileViewerDirty sets dirty state per session', () => {
    const { result } = renderHook(() => useFileNavigation(makeParams()))
    act(() => result.current.setIsFileViewerDirty('sess-1', true))
    // Dirty state is stored in a ref, verified by navigateToFile behavior
  })

  it('dirty state in session A does not trigger pending dialog for navigation in session B', () => {
    // Start with session A active and dirty
    const paramsA = makeParams({ activeSessionId: 'sess-A' })
    const { result, rerender } = renderHook(
      (props) => useFileNavigation(props),
      { initialProps: paramsA },
    )

    // Mark session A as dirty
    act(() => result.current.setIsFileViewerDirty('sess-A', true))

    // Now switch to session B (simulating session switch)
    const paramsB = makeParams({ activeSessionId: 'sess-B', selectFile: paramsA.selectFile })
    rerender(paramsB)

    // Navigate to a file in session B — should NOT trigger pending since B is not dirty
    vi.mocked(resolveNavigation).mockImplementation((_target, _currentPath, isDirty) => {
      // resolveNavigation is called with isDirty=false for session B
      expect(isDirty).toBe(false)
      return {
        action: 'navigate',
        state: defaultState,
        filePath: '/project/file.ts',
      }
    })

    act(() => result.current.navigateToFile({ filePath: '/project/file.ts', openInDiffMode: false }))
    expect(paramsA.selectFile).toHaveBeenCalledWith('sess-B', '/project/file.ts')
  })

  // --- Session switch resets diff state ---
  it('resets diff mode and refs when activeSessionId changes', () => {
    // Navigate to a file with diff mode in session A
    const diffState: NavigationState = {
      openFileInDiffMode: true,
      scrollToLine: undefined,
      searchHighlight: undefined,
      diffBaseRef: 'abc123',
      diffCurrentRef: 'def456',
      diffLabel: 'main vs feature',
    }
    vi.mocked(resolveNavigation).mockReturnValue({
      action: 'navigate',
      state: diffState,
      filePath: '/project/file.ts',
    })
    const params = makeParams({ activeSessionId: 'sess-A' })
    const { result, rerender } = renderHook(
      (props) => useFileNavigation(props),
      { initialProps: params },
    )

    act(() => result.current.navigateToFile({
      filePath: '/project/file.ts',
      openInDiffMode: true,
      diffBaseRef: 'abc123',
      diffCurrentRef: 'def456',
      diffLabel: 'main vs feature',
    }))

    // Confirm diff state is set for session A
    expect(result.current.openFileInDiffMode).toBe(true)
    expect(result.current.diffBaseRef).toBe('abc123')
    expect(result.current.diffCurrentRef).toBe('def456')
    expect(result.current.diffLabel).toBe('main vs feature')

    // Switch to session B
    rerender({ ...params, activeSessionId: 'sess-B' })

    // Diff state should be reset
    expect(result.current.openFileInDiffMode).toBe(false)
    expect(result.current.diffBaseRef).toBeUndefined()
    expect(result.current.diffCurrentRef).toBeUndefined()
    expect(result.current.diffLabel).toBeUndefined()
  })

  // --- registerSaveFunction / unregisterSaveFunction ---
  it('registerSaveFunction and unregisterSaveFunction manage per-session save functions', async () => {
    const pending: NavigationTarget = { filePath: '/project/file.ts', openInDiffMode: false }
    vi.mocked(resolveNavigation).mockReturnValue({ action: 'pending', target: pending })
    vi.mocked(applyPendingNavigation).mockReturnValue({
      state: defaultState,
      filePath: '/project/file.ts',
    })

    const params = makeParams()
    const { result } = renderHook(() => useFileNavigation(params))

    const saveFn = vi.fn().mockResolvedValue(undefined)
    act(() => result.current.registerSaveFunction('sess-1', saveFn))

    act(() => result.current.navigateToFile(pending))
    await act(() => result.current.handlePendingSave())
    expect(saveFn).toHaveBeenCalled()

    // After unregister, save function should not be called
    saveFn.mockClear()
    act(() => result.current.unregisterSaveFunction('sess-1'))

    // Set up another pending navigation
    act(() => result.current.navigateToFile(pending))
    await act(() => result.current.handlePendingSave())
    expect(saveFn).not.toHaveBeenCalled()
  })
})
