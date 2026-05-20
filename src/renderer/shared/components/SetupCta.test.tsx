// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../../test/react-setup'
import { SetupCta } from './SetupCta'

afterEach(() => {
  cleanup()
})

describe('SetupCta', () => {
  it('renders primary button and secondary link', () => {
    render(<SetupCta onSetup={vi.fn()} onStartBlank={vi.fn()} />)
    expect(screen.getByRole('button', { name: /set up commands/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /start with an empty config/i })).toBeInTheDocument()
  })

  it('invokes onSetup', () => {
    const onSetup = vi.fn()
    render(<SetupCta onSetup={onSetup} onStartBlank={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /set up commands/i }))
    expect(onSetup).toHaveBeenCalled()
  })

  it('invokes onStartBlank', () => {
    const onStartBlank = vi.fn()
    render(<SetupCta onSetup={vi.fn()} onStartBlank={onStartBlank} />)
    fireEvent.click(screen.getByRole('button', { name: /start with an empty config/i }))
    expect(onStartBlank).toHaveBeenCalled()
  })
})
