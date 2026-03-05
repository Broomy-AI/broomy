// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import '../../../test/react-setup'

vi.mock('../review/useReviewActions', () => ({
  checkLegacyBroomyGitignore: vi.fn().mockResolvedValue(false),
  removeLegacyBroomyGitignore: vi.fn().mockResolvedValue(undefined),
}))

import { CommandsSetupDialog } from './CommandsSetupDialog'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(window.fs.mkdir).mockResolvedValue({ success: true })
  vi.mocked(window.fs.writeFile).mockResolvedValue({ success: true })
  vi.mocked(window.fs.exists).mockResolvedValue(false)
})
afterEach(() => { cleanup() })

describe('CommandsSetupDialog', () => {
  it('renders dialog title and description', () => {
    render(<CommandsSetupDialog directory="/repo" onClose={vi.fn()} onCreated={vi.fn()} />)
    expect(screen.getByText('Set up Broomy Actions')).toBeTruthy()
    expect(screen.getByText(/defines the action buttons/)).toBeTruthy()
  })

  it('renders Cancel and Create buttons', () => {
    render(<CommandsSetupDialog directory="/repo" onClose={vi.fn()} onCreated={vi.fn()} />)
    expect(screen.getByText('Cancel')).toBeTruthy()
    expect(screen.getByText('Create default commands.json')).toBeTruthy()
  })

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn()
    render(<CommandsSetupDialog directory="/repo" onClose={onClose} onCreated={vi.fn()} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalled()
  })

  it('creates files and calls onCreated when Create is clicked', async () => {
    const onClose = vi.fn()
    const onCreated = vi.fn()

    render(<CommandsSetupDialog directory="/repo" onClose={onClose} onCreated={onCreated} />)

    await act(async () => {
      fireEvent.click(screen.getByText('Create default commands.json'))
    })

    // Should have created commands.json
    expect(window.fs.writeFile).toHaveBeenCalledWith(
      '/repo/.broomy/commands.json',
      expect.any(String)
    )
    expect(onCreated).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('shows legacy gitignore warning when detected', async () => {
    const mod = await import('../review/useReviewActions')
    vi.mocked(mod.checkLegacyBroomyGitignore).mockResolvedValue(true)

    const { unmount } = render(<CommandsSetupDialog directory="/repo" onClose={vi.fn()} onCreated={vi.fn()} />)

    // The effect runs async, wait for re-render
    await act(async () => {
      await new Promise(r => setTimeout(r, 10))
    })

    expect(screen.getByText(/currently ignores/)).toBeTruthy()
    unmount()
  })
})
