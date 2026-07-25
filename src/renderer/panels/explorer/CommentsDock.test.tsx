// @vitest-environment jsdom
/**
 * Tests for the CommentsDock component that displays accumulated review comments,
 * allows navigation to each comment's file/line, resolution (removal), and
 * submission of the full comment block to the agent.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
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
    localStorage.clear()
    vi.mocked(window.pty.write).mockResolvedValue(undefined)
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

  it('edits a comment inline and saves it via the store', () => {
    useCommentsStore.setState({ commentsByDir: { [DIR]: [
      { id: 'c1', file: '/repo/src/a.ts', line: 42, quotedText: 'x', body: 'original', createdAt: 't' },
    ] } })
    render(<CommentsDock directory={DIR} agentPtyId="pty1" onNavigate={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /edit comment/i }))
    const textarea = screen.getByRole('textbox', { name: /edit comment/i })
    fireEvent.change(textarea, { target: { value: 'revised' } })
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }))

    expect(useCommentsStore.getState().commentsByDir[DIR]![0].body).toBe('revised')
    // The edit form is dismissed after saving.
    expect(screen.queryByRole('textbox', { name: /edit comment/i })).not.toBeInTheDocument()
  })

  it('saves an inline edit with Cmd+Enter and cancels with Escape', () => {
    useCommentsStore.setState({ commentsByDir: { [DIR]: [
      { id: 'c1', file: '/repo/src/a.ts', line: 42, quotedText: 'x', body: 'original', createdAt: 't' },
    ] } })
    render(<CommentsDock directory={DIR} agentPtyId="pty1" onNavigate={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /edit comment/i }))
    const ta = screen.getByRole('textbox', { name: /edit comment/i })
    fireEvent.change(ta, { target: { value: 'kbd revised' } })
    fireEvent.keyDown(ta, { key: 'Enter', metaKey: true })
    expect(useCommentsStore.getState().commentsByDir[DIR]![0].body).toBe('kbd revised')

    // Re-open, type, then Escape — the change is discarded.
    fireEvent.click(screen.getByRole('button', { name: /edit comment/i }))
    const ta2 = screen.getByRole('textbox', { name: /edit comment/i })
    fireEvent.change(ta2, { target: { value: 'discarded' } })
    fireEvent.keyDown(ta2, { key: 'Escape' })
    expect(useCommentsStore.getState().commentsByDir[DIR]![0].body).toBe('kbd revised')
    expect(screen.queryByRole('textbox', { name: /edit comment/i })).not.toBeInTheDocument()
  })

  it('expands and highlights a comment when it is touched (added/edited)', async () => {
    useCommentsStore.setState({
      commentsByDir: { [DIR]: [{ id: 'c1', file: '/repo/src/a.ts', line: 42, quotedText: 'x', body: 'b', createdAt: 't' }] },
      lastTouched: null,
    })
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    // Capture the rAF callback (don't run it inline) so we can fire it after the
    // dock has re-expanded and the row exists.
    let rafCb: FrameRequestCallback | null = null
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { rafCb = cb; return 1 })
    render(<CommentsDock directory={DIR} agentPtyId="pty1" onNavigate={vi.fn()} />)

    // Collapse the dock so the rows are hidden.
    fireEvent.click(screen.getByRole('button', { name: /^Comments/ }))
    expect(document.querySelector('[data-comment-id="c1"]')).toBeNull()

    // Touching the comment re-expands the dock and highlights the row.
    act(() => { useCommentsStore.setState({ lastTouched: { id: 'c1', seq: 1 } }) })
    const row = document.querySelector('[data-comment-id="c1"]')
    expect(row).not.toBeNull()
    expect(row!.className).toContain('bg-accent/20')

    // The scroll-into-view runs on the next frame, once the row is present.
    act(() => { rafCb?.(0) })
    expect(scrollIntoView).toHaveBeenCalled()
    raf.mockRestore()
  })

  it('cancels an inline edit without changing the comment', () => {
    useCommentsStore.setState({ commentsByDir: { [DIR]: [
      { id: 'c1', file: '/repo/src/a.ts', line: 42, quotedText: 'x', body: 'original', createdAt: 't' },
    ] } })
    render(<CommentsDock directory={DIR} agentPtyId="pty1" onNavigate={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /edit comment/i }))
    fireEvent.change(screen.getByRole('textbox', { name: /edit comment/i }), { target: { value: 'revised' } })
    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/ }))

    expect(useCommentsStore.getState().commentsByDir[DIR]![0].body).toBe('original')
    expect(screen.queryByRole('textbox', { name: /edit comment/i })).not.toBeInTheDocument()
  })

  it('collapses and expands when the header is clicked', () => {
    render(<CommentsDock directory={DIR} agentPtyId="pty1" onNavigate={vi.fn()} />)
    // The header button's accessible name starts with "Comments"; the submit
    // button ("Submit ... comments to agent") does not, so /^Comments/ targets it.
    const header = () => screen.getByRole('button', { name: /^Comments/ })
    expect(screen.getByText(/no comments/i)).toBeInTheDocument()
    fireEvent.click(header())
    // Collapsed: the body (and its empty state) is gone; the chevron flips to ▲.
    expect(screen.queryByText(/no comments/i)).not.toBeInTheDocument()
    expect(header()).toHaveTextContent('▲')
    fireEvent.click(header())
    expect(screen.getByText(/no comments/i)).toBeInTheDocument()
    expect(header()).toHaveTextContent('▼')
  })

  it('persists a dragged height to localStorage and applies it to the body', () => {
    const { container } = render(<CommentsDock directory={DIR} agentPtyId="pty1" onNavigate={vi.fn()} />)
    const handle = container.querySelector<HTMLElement>('.cursor-row-resize')!
    expect(handle).toBeTruthy()
    // Dragging up so the height-from-bottom is 200px (within the [80,420] clamp).
    fireEvent.mouseDown(handle)
    fireEvent.mouseMove(window, { clientY: window.innerHeight - 200 })
    fireEvent.mouseUp(window)
    expect(localStorage.getItem('broomy.commentsDock.height')).toBe('200')
    const body = container.querySelector<HTMLElement>('div[style*="height"]')!
    expect(body.style.height).toBe('200px')
  })

  it('clamps a dragged height to the maximum', () => {
    const { container } = render(<CommentsDock directory={DIR} agentPtyId="pty1" onNavigate={vi.fn()} />)
    const handle = container.querySelector<HTMLElement>('.cursor-row-resize')!
    fireEvent.mouseDown(handle)
    // Drag far past the top: from-bottom would be huge, must clamp to 420.
    fireEvent.mouseMove(window, { clientY: -10000 })
    fireEvent.mouseUp(window)
    expect(localStorage.getItem('broomy.commentsDock.height')).toBe('420')
  })

  it('initializes its height from a previously saved localStorage value', () => {
    localStorage.setItem('broomy.commentsDock.height', '250')
    const { container } = render(<CommentsDock directory={DIR} agentPtyId="pty1" onNavigate={vi.fn()} />)
    const body = container.querySelector<HTMLElement>('div[style*="height"]')!
    expect(body.style.height).toBe('250px')
  })
})
