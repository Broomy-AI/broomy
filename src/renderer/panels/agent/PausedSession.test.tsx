// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '../../../test/react-setup'
import PausedSession from './PausedSession'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PausedSession', () => {
  it('explains that the session is paused', () => {
    render(<PausedSession onResume={() => {}} />)
    expect(screen.getByText('Session paused')).toBeInTheDocument()
  })

  it('calls onResume when the button is clicked', async () => {
    const onResume = vi.fn()
    render(<PausedSession onResume={onResume} />)

    await userEvent.click(screen.getByRole('button', { name: 'Resume Session' }))

    expect(onResume).toHaveBeenCalledTimes(1)
  })
})
