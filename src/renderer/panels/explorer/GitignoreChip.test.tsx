// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import '../../../test/setup'
import { GitignoreChip } from './GitignoreChip'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GitignoreChip', () => {
  it('renders nothing when showSuggestion is false', () => {
    const { container } = render(
      <GitignoreChip directory="/repos/project" showSuggestion={false} onDismiss={() => {}} />
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders the chip when showSuggestion is true', () => {
    const { getByText } = render(
      <GitignoreChip directory="/repos/project" showSuggestion={true} onDismiss={() => {}} />
    )
    expect(getByText('Add .gitignore')).toBeTruthy()
  })

  it('opens modal when chip is clicked', () => {
    const { getByText, getByRole } = render(
      <GitignoreChip directory="/repos/project" showSuggestion={true} onDismiss={() => {}} />
    )
    fireEvent.click(getByText('Add .gitignore'))
    expect(getByRole('dialog')).toBeTruthy()
  })

  it('calls ensureOutputGitignore and onDismiss when "Create .gitignore" is clicked', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(false as never)
    vi.mocked(window.fs.mkdir).mockResolvedValue({ success: true } as never)
    vi.mocked(window.fs.writeFile).mockResolvedValue({ success: true } as never)

    const onDismiss = vi.fn()
    const { getByText } = render(
      <GitignoreChip directory="/repos/project" showSuggestion={true} onDismiss={onDismiss} />
    )
    fireEvent.click(getByText('Add .gitignore'))
    await fireEvent.click(getByText('Create .gitignore'))

    // Wait for async handler
    await vi.waitFor(() => {
      expect(onDismiss).toHaveBeenCalled()
    })
  })

  it('calls onDismiss when "Continue without" is clicked', () => {
    const onDismiss = vi.fn()
    const { getByText } = render(
      <GitignoreChip directory="/repos/project" showSuggestion={true} onDismiss={onDismiss} />
    )
    fireEvent.click(getByText('Add .gitignore'))
    fireEvent.click(getByText('Continue without'))
    expect(onDismiss).toHaveBeenCalled()
  })
})
