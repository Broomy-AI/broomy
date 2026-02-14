// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import '../../../test/react-setup'
import { useAgentStore } from '../../store/agents'
import { useRepoStore } from '../../store/repos'
import { AddExistingRepoView } from './AddExistingRepoView'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
  useAgentStore.setState({
    agents: [
      { id: 'agent-1', name: 'Claude', command: 'claude', color: '#4a9eff' },
    ],
  })
  useRepoStore.setState({
    repos: [],
    addRepo: vi.fn(),
  })
})

describe('AddExistingRepoView', () => {
  it('renders header and form elements', () => {
    const onBack = vi.fn()
    const onComplete = vi.fn()
    render(<AddExistingRepoView onBack={onBack} onComplete={onComplete} />)
    expect(screen.getByText('Add Existing Repository')).toBeTruthy()
    expect(screen.getByPlaceholderText('Select folder with worktrees...')).toBeTruthy()
    expect(screen.getByText('Browse')).toBeTruthy()
  })

  it('calls onBack when Cancel button is clicked', () => {
    const onBack = vi.fn()
    const onComplete = vi.fn()
    render(<AddExistingRepoView onBack={onBack} onComplete={onComplete} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(onBack).toHaveBeenCalled()
  })

  it('calls onBack when back arrow is clicked', () => {
    const onBack = vi.fn()
    const onComplete = vi.fn()
    const { container } = render(<AddExistingRepoView onBack={onBack} onComplete={onComplete} />)
    const backButton = container.querySelector('.px-4.py-3 button')
    fireEvent.click(backButton!)
    expect(onBack).toHaveBeenCalled()
  })

  it('Add Repository button is disabled initially', () => {
    const onBack = vi.fn()
    const onComplete = vi.fn()
    render(<AddExistingRepoView onBack={onBack} onComplete={onComplete} />)
    const addButton = screen.getByText('Add Repository')
    expect(addButton.hasAttribute('disabled')).toBe(true)
  })

  it('opens folder dialog when Browse is clicked', async () => {
    vi.mocked(window.dialog.openFolder).mockResolvedValue(null)
    const onBack = vi.fn()
    const onComplete = vi.fn()
    render(<AddExistingRepoView onBack={onBack} onComplete={onComplete} />)
    fireEvent.click(screen.getByText('Browse'))
    await waitFor(() => {
      expect(window.dialog.openFolder).toHaveBeenCalled()
    })
  })

  it('updates rootDir input when typing', () => {
    const onBack = vi.fn()
    const onComplete = vi.fn()
    render(<AddExistingRepoView onBack={onBack} onComplete={onComplete} />)
    const input = screen.getByPlaceholderText('Select folder with worktrees...')
    fireEvent.change(input, { target: { value: '/my/repo' } })
    expect((input as HTMLInputElement).value).toBe('/my/repo')
  })
})
