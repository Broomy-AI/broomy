// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../../test/react-setup'

afterEach(cleanup)
import { RepoGroupHeader } from './RepoGroupHeader'
import type { RepoGroup } from './repoGroups'
import type { Session } from '../../store/sessions'

function s(over: Partial<Session> = {}): Session {
  return { id: 'x', branch: 'b', status: 'idle', isArchived: false, isUnread: false, initError: null, ...over } as Session
}
function group(sessions: Session[], over: Partial<RepoGroup> = {}): RepoGroup {
  return { key: 'repo:r1', label: 'broomy', kind: 'repo', repoId: 'r1', sessions, ...over }
}

describe('RepoGroupHeader', () => {
  it('reflects collapsed via aria-expanded and an accessible name', () => {
    render(<RepoGroupHeader group={group([s(), s()])} collapsed={false} onToggle={() => {}} />)
    const btn = screen.getByRole('button')
    expect(btn.getAttribute('aria-expanded')).toBe('true')
    expect(btn.getAttribute('aria-label')).toContain('broomy')
    expect(btn.getAttribute('aria-label')).toContain('2 sessions')
    expect(btn.getAttribute('aria-label')).toContain('expanded')
  })

  it('rolls the highest-priority status onto a collapsed header', () => {
    const g = group([s({ status: 'idle' }), s({ status: 'error' })])
    render(<RepoGroupHeader group={g} collapsed={true} onToggle={() => {}} />)
    const btn = screen.getByRole('button')
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    expect(btn.getAttribute('aria-label')).toContain('1 error')
    expect(btn.querySelector('[role="img"][aria-label="error"]')).toBeTruthy()
  })

  it('shows no roll-up indicator for a fully-idle collapsed group', () => {
    render(<RepoGroupHeader group={group([s({ status: 'idle' })])} collapsed={true} onToggle={() => {}} />)
    expect(screen.getByRole('button').querySelector('[role="img"]')).toBeNull()
  })

  it('calls onToggle on click', () => {
    const onToggle = vi.fn()
    render(<RepoGroupHeader group={group([s()])} collapsed={false} onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['unread', { isUnread: true }, 'needs attention'],
    ['working', { status: 'working' }, 'working'],
    ['initializing', { status: 'initializing' }, 'setting up'],
  ] as const)('rolls up a collapsed group in status %s', (_label, override, label) => {
    const g = group([s(override)])
    render(<RepoGroupHeader group={g} collapsed={true} onToggle={() => {}} />)
    const btn = screen.getByRole('button')
    expect(btn.getAttribute('aria-label')).toContain(label)
  })

  describe('drag wiring', () => {
    it('is not draggable by default and becomes draggable when passed the prop', () => {
      const { rerender } = render(<RepoGroupHeader group={group([s()])} collapsed={false} onToggle={() => {}} />)
      expect(screen.getByRole('button')).toHaveAttribute('draggable', 'false')
      rerender(<RepoGroupHeader group={group([s()])} collapsed={false} onToggle={() => {}} draggable />)
      expect(screen.getByRole('button')).toHaveAttribute('draggable', 'true')
    })

    it('forwards drag start/over/leave/drop/end with the group key', () => {
      const onDragStart = vi.fn()
      const onDragOver = vi.fn()
      const onDragLeave = vi.fn()
      const onDrop = vi.fn()
      const onDragEnd = vi.fn()
      render(
        <RepoGroupHeader
          group={group([s()], { key: 'repo:r2' })}
          collapsed={false}
          onToggle={() => {}}
          draggable
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onDragEnd={onDragEnd}
        />,
      )
      const btn = screen.getByRole('button')
      fireEvent.dragStart(btn)
      expect(onDragStart).toHaveBeenCalledWith(expect.anything(), 'repo:r2')
      fireEvent.dragOver(btn)
      expect(onDragOver).toHaveBeenCalledWith(expect.anything(), 'repo:r2')
      fireEvent.dragLeave(btn)
      expect(onDragLeave).toHaveBeenCalledTimes(1)
      fireEvent.drop(btn)
      expect(onDrop).toHaveBeenCalledWith(expect.anything(), 'repo:r2')
      fireEvent.dragEnd(btn)
      expect(onDragEnd).toHaveBeenCalledTimes(1)
    })

    it('tolerates missing drag handlers (all optional)', () => {
      render(<RepoGroupHeader group={group([s()])} collapsed={false} onToggle={() => {}} draggable />)
      const btn = screen.getByRole('button')
      expect(() => {
        fireEvent.dragStart(btn)
        fireEvent.dragOver(btn)
        fireEvent.dragLeave(btn)
        fireEvent.drop(btn)
        fireEvent.dragEnd(btn)
      }).not.toThrow()
    })

    it('shows a top-edge indicator for dropEdge "before" and bottom-edge for "after"', () => {
      const { rerender } = render(
        <RepoGroupHeader group={group([s()])} collapsed={false} onToggle={() => {}} dropEdge="before" />,
      )
      expect(screen.getByRole('button').className).toContain('border-t-2')
      rerender(<RepoGroupHeader group={group([s()])} collapsed={false} onToggle={() => {}} dropEdge="after" />)
      expect(screen.getByRole('button').className).toContain('border-b-2')
    })
  })
})
