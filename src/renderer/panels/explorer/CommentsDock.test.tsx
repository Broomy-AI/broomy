// @vitest-environment jsdom
/**
 * Tests for the CommentsDock component that displays accumulated review comments,
 * allows navigation to each comment's file/line, resolution (removal), and
 * submission of the full comment block to the agent.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../../test/setup'
import CommentsDock from './CommentsDock'
import { useCommentsStore } from '../../store/comments'

afterEach(() => {
  cleanup()
})

const DIR = '/repo'

describe('CommentsDock', () => {
  beforeEach(() => {
    useCommentsStore.setState({ commentsByDir: { [DIR]: [] } })
    vi.clearAllMocks()
    vi.mocked(window.pty.write).mockResolvedValue(undefined as unknown as void)
  })

  it('shows an empty state when there are no comments', () => {
    render(<CommentsDock directory={DIR} agentPtyId="pty1" onNavigate={vi.fn()} />)
    expect(screen.getByText(/no comments/i)).toBeInTheDocument()
  })

  it('lists comment summaries and navigates on click', () => {
    useCommentsStore.setState({ commentsByDir: { [DIR]: [
      { id: 'c1', file: '/repo/src/a.ts', line: 42, quotedText: 'const x = 1', body: 'why 1?', createdAt: 't' },
    ] } })
    const onNavigate = vi.fn()
    render(<CommentsDock directory={DIR} agentPtyId="pty1" onNavigate={onNavigate} />)
    fireEvent.click(screen.getByText(/src\/a\.ts:42/))
    expect(onNavigate).toHaveBeenCalledWith('/repo/src/a.ts', 42)
  })

  it('submit sends the formatted block to the agent and clears comments', async () => {
    useCommentsStore.setState({ commentsByDir: { [DIR]: [
      { id: 'c1', file: '/repo/src/a.ts', line: 42, quotedText: 'const x = 1', body: 'why 1?', createdAt: 't' },
    ] } })
    render(<CommentsDock directory={DIR} agentPtyId="pty1" onNavigate={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /submit/i }))
    await vi.waitFor(() => {
      expect(window.pty.write).toHaveBeenCalled()
      expect(vi.mocked(window.pty.write).mock.calls[0][1]).toContain('1.) src/a.ts:42: "const x = 1"')
      expect(useCommentsStore.getState().commentsByDir[DIR]).toEqual([])
    })
  })

  it('disables submit when no agent is attached', () => {
    useCommentsStore.setState({ commentsByDir: { [DIR]: [
      { id: 'c1', file: '/repo/src/a.ts', line: 1, quotedText: 'x', body: 'b', createdAt: 't' },
    ] } })
    render(<CommentsDock directory={DIR} agentPtyId={undefined} onNavigate={vi.fn()} />)
    expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled()
  })

  it('resolve removes a comment from the list', () => {
    useCommentsStore.setState({ commentsByDir: { [DIR]: [
      { id: 'c1', file: '/repo/src/a.ts', line: 1, quotedText: 'x', body: 'b', createdAt: 't' },
    ] } })
    render(<CommentsDock directory={DIR} agentPtyId="pty1" onNavigate={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /resolve comment/i }))
    expect(useCommentsStore.getState().commentsByDir[DIR]).toEqual([])
  })
})
