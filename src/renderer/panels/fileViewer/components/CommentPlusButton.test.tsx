// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import '../../../../test/react-setup'
import CommentPlusButton from './CommentPlusButton'
import type { PlusPosition } from '../hooks/useCommentPlus'

afterEach(() => {
  cleanup()
})

const PLUS: PlusPosition = { line: 12, top: 240, height: 18, width: 64 }

describe('CommentPlusButton', () => {
  it('renders a button labeled with the hovered line number', () => {
    const { getByRole } = render(<CommentPlusButton plus={PLUS} onClick={vi.fn()} />)
    const button = getByRole('button', { name: 'Comment on line 12' })
    expect(button).toBeTruthy()
  })

  it('positions itself over the line via inline style', () => {
    const { getByRole } = render(<CommentPlusButton plus={PLUS} onClick={vi.fn()} />)
    const button = getByRole('button', { name: 'Comment on line 12' }) as HTMLButtonElement
    expect(button.style.top).toBe('240px')
    expect(button.style.left).toBe('0px')
    expect(button.style.width).toBe('64px')
    expect(button.style.height).toBe('18px')
  })

  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    const { getByRole } = render(<CommentPlusButton plus={PLUS} onClick={onClick} />)
    const button = getByRole('button', { name: 'Comment on line 12' })
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
