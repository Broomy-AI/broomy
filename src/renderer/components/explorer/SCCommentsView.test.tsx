// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../../test/react-setup'
import { SCCommentsView } from './SCCommentsView'
import type { PrComment } from './types'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
})

function makeComment(overrides: Partial<PrComment> = {}): PrComment {
  return {
    id: 1,
    body: 'Test comment body',
    path: 'src/index.ts',
    line: 10,
    side: 'RIGHT',
    author: 'testuser',
    createdAt: '2024-01-15T10:00:00Z',
    url: 'https://github.com/test/test/pull/1#discussion_r1',
    ...overrides,
  }
}

const defaultProps = {
  directory: '/repos/project',
  prComments: [] as PrComment[],
  isCommentsLoading: false,
  replyText: {} as Record<number, string | undefined>,
  setReplyText: vi.fn(),
  isSubmittingReply: null as number | null,
  onReplyToComment: vi.fn(),
  onFileSelect: vi.fn(),
}

describe('SCCommentsView', () => {
  it('shows loading state', () => {
    render(<SCCommentsView {...defaultProps} isCommentsLoading={true} />)
    expect(screen.getByText('Loading comments...')).toBeTruthy()
  })

  it('shows empty state when no comments', () => {
    render(<SCCommentsView {...defaultProps} />)
    expect(screen.getByText('No review comments')).toBeTruthy()
  })

  it('renders comment with author and body', () => {
    const prComments = [makeComment({ id: 1, author: 'alice', body: 'Looks good!' })]
    render(<SCCommentsView {...defaultProps} prComments={prComments} />)
    expect(screen.getByText('alice')).toBeTruthy()
    expect(screen.getByText('Looks good!')).toBeTruthy()
  })

  it('shows file path and line number', () => {
    const prComments = [makeComment({ path: 'src/app.ts', line: 42 })]
    render(<SCCommentsView {...defaultProps} prComments={prComments} />)
    expect(screen.getByText('src/app.ts:42')).toBeTruthy()
  })

  it('shows file path without line when line is null', () => {
    const prComments = [makeComment({ path: 'src/app.ts', line: null })]
    render(<SCCommentsView {...defaultProps} prComments={prComments} />)
    expect(screen.getByText('src/app.ts')).toBeTruthy()
  })

  it('renders replies under the parent comment', () => {
    const prComments = [
      makeComment({ id: 1, author: 'alice', body: 'Original comment' }),
      makeComment({ id: 2, author: 'bob', body: 'Reply to alice', inReplyToId: 1 }),
    ]
    render(<SCCommentsView {...defaultProps} prComments={prComments} />)
    expect(screen.getByText('Original comment')).toBeTruthy()
    expect(screen.getByText('Reply to alice')).toBeTruthy()
    expect(screen.getByText('bob')).toBeTruthy()
  })

  it('calls onFileSelect when clicking a comment', () => {
    const onFileSelect = vi.fn()
    const prComments = [makeComment({ path: 'src/app.ts', line: 42 })]
    render(<SCCommentsView {...defaultProps} prComments={prComments} onFileSelect={onFileSelect} />)
    fireEvent.click(screen.getByText('Test comment body'))
    expect(onFileSelect).toHaveBeenCalledWith({
      filePath: '/repos/project/src/app.ts',
      openInDiffMode: true,
      scrollToLine: 42,
    })
  })

  it('shows reply textarea for each top-level comment', () => {
    const prComments = [makeComment({ id: 1 })]
    render(<SCCommentsView {...defaultProps} prComments={prComments} />)
    expect(screen.getByPlaceholderText('Write a reply...')).toBeTruthy()
  })

  it('calls onReplyToComment when reply button is clicked', () => {
    const onReplyToComment = vi.fn()
    const prComments = [makeComment({ id: 1 })]
    render(
      <SCCommentsView
        {...defaultProps}
        prComments={prComments}
        replyText={{ 1: 'My reply' }}
        onReplyToComment={onReplyToComment}
      />
    )
    fireEvent.click(screen.getByText('Reply'))
    expect(onReplyToComment).toHaveBeenCalledWith(1)
  })

  it('disables reply button when no text', () => {
    const prComments = [makeComment({ id: 1 })]
    render(<SCCommentsView {...defaultProps} prComments={prComments} replyText={{}} />)
    const replyBtn = screen.getByText('Reply')
    expect(replyBtn.hasAttribute('disabled')).toBe(true)
  })

  it('shows Sending... while submitting reply', () => {
    const prComments = [makeComment({ id: 1 })]
    render(
      <SCCommentsView
        {...defaultProps}
        prComments={prComments}
        replyText={{ 1: 'My reply' }}
        isSubmittingReply={1}
      />
    )
    expect(screen.getByText('Sending...')).toBeTruthy()
  })

  it('updates reply text on textarea change', () => {
    const setReplyText = vi.fn()
    const prComments = [makeComment({ id: 1 })]
    render(
      <SCCommentsView
        {...defaultProps}
        prComments={prComments}
        setReplyText={setReplyText}
      />
    )
    fireEvent.change(screen.getByPlaceholderText('Write a reply...'), { target: { value: 'Hello' } })
    expect(setReplyText).toHaveBeenCalled()
  })
})
