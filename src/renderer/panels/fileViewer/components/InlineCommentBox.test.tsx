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

  it('pre-fills the body and uses a custom submit label when editing', () => {
    const onAdd = vi.fn()
    render(<InlineCommentBox line={3} quotedText="x" initialBody="original text" submitLabel="Save" onAdd={onAdd} onCancel={vi.fn()} />)
    // Pre-filled, so the submit button is enabled immediately and labeled "Save".
    const save = screen.getByRole('button', { name: 'Add comment' })
    expect(save).toHaveTextContent('Save')
    expect(screen.getByDisplayValue('original text')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('Add a comment...'), { target: { value: 'edited text' } })
    fireEvent.click(save)
    expect(onAdd).toHaveBeenCalledWith('edited text')
  })
})
