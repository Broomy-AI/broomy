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
})
