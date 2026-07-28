// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSidebarDrag } from './useSidebarDrag'
import { useSessionStore } from '../../store/sessions'

/** Minimal stand-in for a React.DragEvent over a 100px-tall card at y=0. */
const dragEvent = (clientY: number) =>
  ({
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    clientY,
    dataTransfer: { effectAllowed: '', dropEffect: '', setData: vi.fn() },
    currentTarget: {
      getBoundingClientRect: () => ({ top: 0, height: 100 }),
      style: {},
    },
  }) as unknown as React.DragEvent

describe('useSidebarDrag', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('marks the drop target as before when the cursor is in the top half', () => {
    const { result } = renderHook(() => useSidebarDrag(true, []))
    act(() => result.current.sessionDrag.onDragStart(dragEvent(0), 'a'))
    act(() => result.current.sessionDrag.onDragOver(dragEvent(20), 'b'))
    expect(result.current.dropTarget).toEqual({ id: 'b', kind: 'session', before: true })
  })

  it('marks the drop target as after when the cursor is in the bottom half', () => {
    const { result } = renderHook(() => useSidebarDrag(true, []))
    act(() => result.current.sessionDrag.onDragStart(dragEvent(0), 'a'))
    act(() => result.current.sessionDrag.onDragOver(dragEvent(80), 'b'))
    expect(result.current.dropTarget).toEqual({ id: 'b', kind: 'session', before: false })
  })

  it('never targets the dragged item itself', () => {
    const { result } = renderHook(() => useSidebarDrag(true, []))
    act(() => result.current.sessionDrag.onDragStart(dragEvent(0), 'a'))
    act(() => result.current.sessionDrag.onDragOver(dragEvent(20), 'a'))
    expect(result.current.dropTarget).toBeNull()
  })

  it('does nothing at all when disabled', () => {
    const reorderSession = vi.fn()
    useSessionStore.setState({ reorderSession })
    const { result } = renderHook(() => useSidebarDrag(false, []))
    act(() => result.current.sessionDrag.onDragStart(dragEvent(0), 'a'))
    act(() => result.current.sessionDrag.onDragOver(dragEvent(20), 'b'))
    act(() => result.current.sessionDrag.onDrop(dragEvent(20), 'b'))
    expect(result.current.dropTarget).toBeNull()
    expect(reorderSession).not.toHaveBeenCalled()
  })

  it('calls reorderSession on drop and clears the drop target', () => {
    const reorderSession = vi.fn()
    useSessionStore.setState({ reorderSession })
    const { result } = renderHook(() => useSidebarDrag(true, []))
    act(() => result.current.sessionDrag.onDragStart(dragEvent(0), 'a'))
    act(() => result.current.sessionDrag.onDragOver(dragEvent(20), 'b'))
    act(() => result.current.sessionDrag.onDrop(dragEvent(20), 'b'))
    expect(reorderSession).toHaveBeenCalledWith('a', 'b', true)
    expect(result.current.dropTarget).toBeNull()
  })

  it('calls reorderRepoGroup with the rendered keys on a group drop', () => {
    const reorderRepoGroup = vi.fn()
    useSessionStore.setState({ reorderRepoGroup })
    const keys = ['repo:r1', 'repo:r2']
    const { result } = renderHook(() => useSidebarDrag(true, keys))
    act(() => result.current.groupDrag.onDragStart(dragEvent(0), 'repo:r1'))
    act(() => result.current.groupDrag.onDragOver(dragEvent(80), 'repo:r2'))
    act(() => result.current.groupDrag.onDrop(dragEvent(80), 'repo:r2'))
    expect(reorderRepoGroup).toHaveBeenCalledWith('repo:r1', 'repo:r2', keys, false)
  })

  it('marks a group drop target as before when the cursor is in the top half', () => {
    const { result } = renderHook(() => useSidebarDrag(true, ['repo:r1', 'repo:r2']))
    act(() => result.current.groupDrag.onDragStart(dragEvent(0), 'repo:r1'))
    act(() => result.current.groupDrag.onDragOver(dragEvent(20), 'repo:r2'))
    expect(result.current.dropTarget).toEqual({ id: 'repo:r2', kind: 'group', before: true })
  })

  it('does not mix a session drag with a group drop target', () => {
    const { result } = renderHook(() => useSidebarDrag(true, ['repo:r1']))
    act(() => result.current.sessionDrag.onDragStart(dragEvent(0), 'a'))
    act(() => result.current.groupDrag.onDragOver(dragEvent(20), 'repo:r1'))
    expect(result.current.dropTarget).toBeNull()
  })

  it('does not mix a group drag with a session drop target, and does not call reorderSession', () => {
    const reorderSession = vi.fn()
    useSessionStore.setState({ reorderSession })
    const { result } = renderHook(() => useSidebarDrag(true, ['repo:r1']))
    act(() => result.current.groupDrag.onDragStart(dragEvent(0), 'repo:r1'))
    act(() => result.current.sessionDrag.onDragOver(dragEvent(20), 'b'))
    act(() => result.current.sessionDrag.onDrop(dragEvent(20), 'b'))
    expect(result.current.dropTarget).toBeNull()
    expect(reorderSession).not.toHaveBeenCalled()
  })

  it('does not call reorderSession when dropping an item onto itself', () => {
    const reorderSession = vi.fn()
    useSessionStore.setState({ reorderSession })
    const { result } = renderHook(() => useSidebarDrag(true, []))
    act(() => result.current.sessionDrag.onDragStart(dragEvent(0), 'a'))
    act(() => result.current.sessionDrag.onDrop(dragEvent(20), 'a'))
    expect(reorderSession).not.toHaveBeenCalled()
    expect(result.current.dropTarget).toBeNull()
  })

  it('clears the drop target on drag leave', () => {
    const { result } = renderHook(() => useSidebarDrag(true, []))
    act(() => result.current.sessionDrag.onDragStart(dragEvent(0), 'a'))
    act(() => result.current.sessionDrag.onDragOver(dragEvent(20), 'b'))
    expect(result.current.dropTarget).not.toBeNull()
    act(() => result.current.sessionDrag.onDragLeave())
    expect(result.current.dropTarget).toBeNull()
  })

  it('clears drag and drop state on drag end without calling the store', () => {
    const reorderSession = vi.fn()
    useSessionStore.setState({ reorderSession })
    const { result } = renderHook(() => useSidebarDrag(true, []))
    act(() => result.current.sessionDrag.onDragStart(dragEvent(0), 'a'))
    act(() => result.current.sessionDrag.onDragOver(dragEvent(20), 'b'))
    act(() => result.current.sessionDrag.onDragEnd(dragEvent(20)))
    expect(result.current.dropTarget).toBeNull()
    // A drop after drag end must be a no-op — there is no active drag anymore.
    act(() => result.current.sessionDrag.onDrop(dragEvent(20), 'b'))
    expect(reorderSession).not.toHaveBeenCalled()
  })

  it('does not call the store when dropping while disabled mid-drag', () => {
    const reorderSession = vi.fn()
    const reorderRepoGroup = vi.fn()
    useSessionStore.setState({ reorderSession, reorderRepoGroup })
    const { result, rerender } = renderHook(
      ({ enabled }) => useSidebarDrag(enabled, []),
      { initialProps: { enabled: true } },
    )
    act(() => result.current.sessionDrag.onDragStart(dragEvent(0), 'a'))
    rerender({ enabled: false })
    act(() => result.current.sessionDrag.onDrop(dragEvent(20), 'b'))
    expect(reorderSession).not.toHaveBeenCalled()
    expect(reorderRepoGroup).not.toHaveBeenCalled()
  })

  it('rejects a session dropped onto a card in a different group: no drop target is set', () => {
    const canDropSession = vi.fn((draggedId: string, targetId: string) => draggedId === 'a' && targetId === 'b')
    const { result } = renderHook(() => useSidebarDrag(true, [], canDropSession))
    act(() => result.current.sessionDrag.onDragStart(dragEvent(0), 'a'))
    act(() => result.current.sessionDrag.onDragOver(dragEvent(20), 'c'))
    expect(result.current.dropTarget).toBeNull()
    expect(canDropSession).toHaveBeenCalledWith('a', 'c')
  })

  it('shows a drop target when canDropSession allows it', () => {
    const canDropSession = vi.fn(() => true)
    const { result } = renderHook(() => useSidebarDrag(true, [], canDropSession))
    act(() => result.current.sessionDrag.onDragStart(dragEvent(0), 'a'))
    act(() => result.current.sessionDrag.onDragOver(dragEvent(20), 'b'))
    expect(result.current.dropTarget).toEqual({ id: 'b', kind: 'session', before: true })
  })

  it('does not call canDropSession for group dragovers', () => {
    const canDropSession = vi.fn(() => false)
    const { result } = renderHook(() => useSidebarDrag(true, ['repo:r1', 'repo:r2'], canDropSession))
    act(() => result.current.groupDrag.onDragStart(dragEvent(0), 'repo:r1'))
    act(() => result.current.groupDrag.onDragOver(dragEvent(20), 'repo:r2'))
    expect(canDropSession).not.toHaveBeenCalled()
    expect(result.current.dropTarget).toEqual({ id: 'repo:r2', kind: 'group', before: true })
  })

  it('does not reject cross-group drops when canDropSession is omitted (opt-in behavior)', () => {
    const { result } = renderHook(() => useSidebarDrag(true, []))
    act(() => result.current.sessionDrag.onDragStart(dragEvent(0), 'a'))
    act(() => result.current.sessionDrag.onDragOver(dragEvent(20), 'b'))
    expect(result.current.dropTarget).toEqual({ id: 'b', kind: 'session', before: true })
  })

  it('keeps sessionDrag and groupDrag handlers referentially stable across a re-render with unchanged inputs', () => {
    // A stable `keys` reference, reused verbatim across the re-render below — mirrors
    // the real caller (Task 6), which `useMemo`s this array. Handler identity is only
    // guaranteed when the caller holds up their end of that contract. Same for
    // `canDropSession`, which SessionList also memoizes.
    const keys: string[] = []
    const canDropSession = () => true
    const { result, rerender } = renderHook(
      ({ enabled }) => useSidebarDrag(enabled, keys, canDropSession),
      { initialProps: { enabled: true } },
    )
    const before = {
      sessionDrag: { ...result.current.sessionDrag },
      groupDrag: { ...result.current.groupDrag },
    }
    rerender({ enabled: true })
    const after = {
      sessionDrag: { ...result.current.sessionDrag },
      groupDrag: { ...result.current.groupDrag },
    }
    expect(after.sessionDrag.onDragStart).toBe(before.sessionDrag.onDragStart)
    expect(after.sessionDrag.onDragOver).toBe(before.sessionDrag.onDragOver)
    expect(after.sessionDrag.onDrop).toBe(before.sessionDrag.onDrop)
    expect(after.sessionDrag.onDragLeave).toBe(before.sessionDrag.onDragLeave)
    expect(after.sessionDrag.onDragEnd).toBe(before.sessionDrag.onDragEnd)
    expect(after.groupDrag.onDragStart).toBe(before.groupDrag.onDragStart)
    expect(after.groupDrag.onDragOver).toBe(before.groupDrag.onDragOver)
    expect(after.groupDrag.onDrop).toBe(before.groupDrag.onDrop)
    expect(after.groupDrag.onDragLeave).toBe(before.groupDrag.onDragLeave)
    expect(after.groupDrag.onDragEnd).toBe(before.groupDrag.onDragEnd)
  })
})
