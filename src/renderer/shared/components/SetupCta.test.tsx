// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../../test/react-setup'
import { SetupCta } from './SetupCta'

afterEach(() => {
  cleanup()
})

describe('SetupCta', () => {
  it('renders primary button', () => {
    render(<SetupCta onSetup={vi.fn()} />)
    expect(screen.getByRole('button', { name: /set up commands/i })).toBeInTheDocument()
  })

  it('invokes onSetup', () => {
    const onSetup = vi.fn()
    render(<SetupCta onSetup={onSetup} />)
    fireEvent.click(screen.getByRole('button', { name: /set up commands/i }))
    expect(onSetup).toHaveBeenCalled()
  })
})
