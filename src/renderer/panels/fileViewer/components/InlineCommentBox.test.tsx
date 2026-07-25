// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../../../test/react-setup'
import InlineCommentBox from './InlineCommentBox'

afterEach(() => {
  cleanup()
})

describe('InlineCommentBox', () => {
  it('calls onAdd with the typed body', () => {
    const onAdd = vi.fn()
    render(<InlineCommentBox line={3} quotedText="const x = 1" onAdd={onAdd} onCancel={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('Add a comment...'), { target: { value: 'hi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add comment' }))
    expect(onAdd).toHaveBeenCalledWith('hi')
  })

  it('disables Add when empty and calls onCancel', () => {
    const onCancel = vi.fn()
    render(<InlineCommentBox line={3} quotedText="x" onAdd={vi.fn()} onCancel={onCancel} />)
    expect(screen.getByRole('button', { name: 'Add comment' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel comment' }))
    expect(onCancel).toHaveBeenCalled()
  })
})
