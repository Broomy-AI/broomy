// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../test/react-setup'
import WelcomeScreen from './WelcomeScreen'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('WelcomeScreen', () => {
  it('renders welcome heading', () => {
    render(<WelcomeScreen onNewSession={vi.fn()} />)
    expect(screen.getByText('Welcome to Broomy')).toBeTruthy()
  })

  it('renders description text', () => {
    render(<WelcomeScreen onNewSession={vi.fn()} />)
    expect(screen.getByText(/Lead a team of agents/)).toBeTruthy()
  })

  it('renders New Session button', () => {
    render(<WelcomeScreen onNewSession={vi.fn()} />)
    expect(screen.getByText('+ New Session')).toBeTruthy()
  })

  it('calls onNewSession when button is clicked', () => {
    const onNewSession = vi.fn()
    render(<WelcomeScreen onNewSession={onNewSession} />)
    fireEvent.click(screen.getByText('+ New Session'))
    expect(onNewSession).toHaveBeenCalledTimes(1)
  })

  it('shows tutorial hint text', () => {
    render(<WelcomeScreen onNewSession={vi.fn()} />)
    expect(screen.getByText(/button in the toolbar to open the step-by-step tutorial/)).toBeTruthy()
  })

  it('shows help menu hint', () => {
    render(<WelcomeScreen onNewSession={vi.fn()} />)
    expect(screen.getByText(/Check the/)).toBeTruthy()
    expect(screen.getByText('Help')).toBeTruthy()
  })

  it('opens GitHub issues link on click', () => {
    render(<WelcomeScreen onNewSession={vi.fn()} />)
    fireEvent.click(screen.getByText('let us know'))
    expect(window.shell.openExternal).toHaveBeenCalledWith('https://github.com/Broomy-AI/broomy/issues')
  })
})
