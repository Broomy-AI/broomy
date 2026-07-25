// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import '../../../../test/react-setup'
import CommentMarkerButton from './CommentMarkerButton'
import type { PlusPosition } from '../hooks/useCommentPlus'

afterEach(() => {
  cleanup()
})

const POS: PlusPosition = { line: 7, top: 120, height: 18, width: 64 }

describe('CommentMarkerButton', () => {
  it('renders an "edit" button labeled with the line number', () => {
    const { getByRole } = render(<CommentMarkerButton pos={POS} onClick={vi.fn()} />)
    expect(getByRole('button', { name: 'Edit comment on line 7' })).toBeTruthy()
  })

  it('positions itself over the line via inline style', () => {
    const { getByRole } = render(<CommentMarkerButton pos={POS} onClick={vi.fn()} />)
    const button = getByRole('button', { name: 'Edit comment on line 7' }) as HTMLButtonElement
    expect(button.style.top).toBe('120px')
    expect(button.style.left).toBe('0px')
    expect(button.style.width).toBe('64px')
    expect(button.style.height).toBe('18px')
  })

  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    const { getByRole } = render(<CommentMarkerButton pos={POS} onClick={onClick} />)
    fireEvent.click(getByRole('button', { name: 'Edit comment on line 7' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
