// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../../test/react-setup'

afterEach(cleanup)
import { RepoGroupHeader } from './RepoGroupHeader'
import type { RepoGroup } from './repoGroups'
import type { Session } from '../../store/sessions'
import type { MainBehind } from '../../features/git/hooks/useMainSync'

function s(over: Partial<Session> = {}): Session {
  return { id: 'x', branch: 'b', status: 'idle', isArchived: false, isUnread: false, initError: null, ...over } as Session
}
function group(sessions: Session[], over: Partial<RepoGroup> = {}): RepoGroup {
  return { key: 'repo:r1', label: 'broomy', kind: 'repo', repoId: 'r1', sessions, ...over }
}

/** The collapse/drag toggle is the button whose accessible name carries the repo label. */
const toggle = () => screen.getByRole('button', { name: /broomy/ })
/** The wrapper `<div>` is the drop target + row focus ring; it's the toggle's parent. */
const wrapper = () => toggle().parentElement!

describe('RepoGroupHeader', () => {
  it('reflects collapsed via aria-expanded and an accessible name', () => {
    render(<RepoGroupHeader group={group([s(), s()])} collapsed={false} onToggle={() => {}} />)
    const btn = toggle()
    expect(btn.getAttribute('aria-expanded')).toBe('true')
    expect(btn.getAttribute('aria-label')).toContain('broomy')
    expect(btn.getAttribute('aria-label')).toContain('2 sessions')
    expect(btn.getAttribute('aria-label')).toContain('expanded')
  })

  it('rolls the highest-priority status onto a collapsed header', () => {
    const g = group([s({ status: 'idle' }), s({ status: 'error' })])
    render(<RepoGroupHeader group={g} collapsed={true} onToggle={() => {}} />)
    const btn = toggle()
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    expect(btn.getAttribute('aria-label')).toContain('1 error')
    expect(btn.querySelector('[role="img"][aria-label="error"]')).toBeTruthy()
  })

  it('shows no roll-up indicator for a fully-idle collapsed group', () => {
    render(<RepoGroupHeader group={group([s({ status: 'idle' })])} collapsed={true} onToggle={() => {}} />)
    expect(toggle().querySelector('[role="img"]')).toBeNull()
  })

  it('calls onToggle on click', () => {
    const onToggle = vi.fn()
    render(<RepoGroupHeader group={group([s()])} collapsed={false} onToggle={onToggle} />)
    fireEvent.click(toggle())
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['unread', { isUnread: true }, 'needs attention'],
    ['working', { status: 'working' }, 'working'],
    ['initializing', { status: 'initializing' }, 'setting up'],
  ] as const)('rolls up a collapsed group in status %s', (_label, override, label) => {
    const g = group([s(override)])
    render(<RepoGroupHeader group={g} collapsed={true} onToggle={() => {}} />)
    expect(toggle().getAttribute('aria-label')).toContain(label)
  })

  describe('drag wiring', () => {
    it('is not draggable by default and becomes draggable when passed the prop', () => {
      const { rerender } = render(<RepoGroupHeader group={group([s()])} collapsed={false} onToggle={() => {}} />)
      expect(toggle()).toHaveAttribute('draggable', 'false')
      rerender(<RepoGroupHeader group={group([s()])} collapsed={false} onToggle={() => {}} draggable />)
      expect(toggle()).toHaveAttribute('draggable', 'true')
    })

    it('forwards drag start/end from the toggle and over/leave/drop from the wrapper with the group key', () => {
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
      fireEvent.dragStart(toggle())
      expect(onDragStart).toHaveBeenCalledWith(expect.anything(), 'repo:r2')
      fireEvent.dragOver(wrapper())
      expect(onDragOver).toHaveBeenCalledWith(expect.anything(), 'repo:r2')
      fireEvent.dragLeave(wrapper())
      expect(onDragLeave).toHaveBeenCalledTimes(1)
      fireEvent.drop(wrapper())
      expect(onDrop).toHaveBeenCalledWith(expect.anything(), 'repo:r2')
      fireEvent.dragEnd(toggle())
      expect(onDragEnd).toHaveBeenCalledTimes(1)
    })

    it('tolerates missing drag handlers (all optional)', () => {
      render(<RepoGroupHeader group={group([s()])} collapsed={false} onToggle={() => {}} draggable />)
      expect(() => {
        fireEvent.dragStart(toggle())
        fireEvent.dragOver(wrapper())
        fireEvent.dragLeave(wrapper())
        fireEvent.drop(wrapper())
        fireEvent.dragEnd(toggle())
      }).not.toThrow()
    })

    it('shows a top-edge indicator on the wrapper for dropEdge "before" and bottom-edge for "after"', () => {
      const { rerender } = render(
        <RepoGroupHeader group={group([s()])} collapsed={false} onToggle={() => {}} dropEdge="before" />,
      )
      expect(wrapper().className).toContain('border-t-2')
      rerender(<RepoGroupHeader group={group([s()])} collapsed={false} onToggle={() => {}} dropEdge="after" />)
      expect(wrapper().className).toContain('border-b-2')
    })
  })

  describe('main sync chip (#170)', () => {
    const behind = (n: number): MainBehind => ({ status: 'available', behind: n })

    it('renders no chip without an onSyncMain handler', () => {
      render(<RepoGroupHeader group={group([s()])} collapsed={false} onToggle={() => {}} mainBehind={behind(3)} />)
      expect(screen.queryByRole('button', { name: /Sync main/ })).toBeNull()
    })

    it('renders no chip for a current (0-behind) repo', () => {
      render(<RepoGroupHeader group={group([s()])} collapsed={false} onToggle={() => {}} mainBehind={behind(0)} onSyncMain={vi.fn()} />)
      expect(screen.queryByRole('button', { name: /Sync main/ })).toBeNull()
    })

    it('renders a clickable chip when behind, and clicking syncs without toggling', async () => {
      const onToggle = vi.fn()
      const onSyncMain = vi.fn().mockResolvedValue({ success: true })
      render(
        <RepoGroupHeader group={group([s()])} collapsed={false} onToggle={onToggle} mainBehind={behind(4)} onSyncMain={onSyncMain} />,
      )
      const chip = screen.getByRole('button', { name: /Sync main — 4 commits behind/ })
      fireEvent.click(chip)
      expect(onSyncMain).toHaveBeenCalledWith('r1')
      expect(onToggle).not.toHaveBeenCalled()
    })

    it('singularizes the label at exactly one commit behind', () => {
      render(<RepoGroupHeader group={group([s()])} collapsed={false} onToggle={() => {}} mainBehind={behind(1)} onSyncMain={vi.fn()} />)
      expect(screen.getByRole('button', { name: /Sync main — 1 commit behind/ })).toBeTruthy()
    })

    it('shows a busy, non-interactive indicator while syncing', () => {
      render(<RepoGroupHeader group={group([s()])} collapsed={false} onToggle={() => {}} mainBehind={behind(4)} isSyncing onSyncMain={vi.fn()} />)
      expect(screen.queryByRole('button', { name: /Sync main/ })).toBeNull()
      expect(screen.getByLabelText('Syncing main').getAttribute('aria-busy')).toBe('true')
    })

    it('shows a muted, tooltipped status when the check is unavailable', () => {
      render(
        <RepoGroupHeader
          group={group([s()])}
          collapsed={false}
          onToggle={() => {}}
          mainBehind={{ status: 'unavailable', error: 'network down' }}
          onSyncMain={vi.fn()}
        />,
      )
      expect(screen.queryByRole('button', { name: /Sync main/ })).toBeNull()
      const dot = screen.getByLabelText('Main sync status unavailable')
      expect(dot.getAttribute('title')).toContain('network down')
    })
  })
})
