// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../../test/react-setup'
import { SkillBanner } from './SkillBanner'

afterEach(() => { cleanup() })

describe('SkillBanner', () => {
  it('renders banner text', () => {
    render(<SkillBanner onOpenDialog={vi.fn()} onDismiss={vi.fn()} />)
    expect(screen.getByText(/Customize Broomy actions/)).toBeTruthy()
  })

  it('calls onOpenDialog when text is clicked', () => {
    const onOpen = vi.fn()
    render(<SkillBanner onOpenDialog={onOpen} onDismiss={vi.fn()} />)
    fireEvent.click(screen.getByText(/Customize Broomy actions/))
    expect(onOpen).toHaveBeenCalled()
  })

  it('calls onDismiss when dismiss button is clicked', () => {
    const onDismiss = vi.fn()
    render(<SkillBanner onOpenDialog={vi.fn()} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByLabelText('Dismiss skill banner'))
    expect(onDismiss).toHaveBeenCalled()
  })
})
