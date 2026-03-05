// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../../test/react-setup'
import { GitignoreModal } from './GitignoreModal'

afterEach(() => {
  cleanup()
})

describe('GitignoreModal', () => {
  it('renders modal with title and description', () => {
    render(
      <GitignoreModal
        onAddToGitignore={vi.fn()}
        onContinueWithout={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    expect(screen.getByText('Set up .broomy/.gitignore?')).toBeTruthy()
    expect(screen.getByText(/Review data/)).toBeTruthy()
  })

  it('calls onAddToGitignore when Add to .gitignore button is clicked', () => {
    const onAdd = vi.fn()
    render(
      <GitignoreModal
        onAddToGitignore={onAdd}
        onContinueWithout={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText('Create .gitignore'))
    expect(onAdd).toHaveBeenCalled()
  })

  it('calls onContinueWithout when Continue without button is clicked', () => {
    const onContinue = vi.fn()
    render(
      <GitignoreModal
        onAddToGitignore={vi.fn()}
        onContinueWithout={onContinue}
        onCancel={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText('Continue without'))
    expect(onContinue).toHaveBeenCalled()
  })

  it('calls onCancel when Cancel button is clicked', () => {
    const onCancel = vi.fn()
    render(
      <GitignoreModal
        onAddToGitignore={vi.fn()}
        onContinueWithout={vi.fn()}
        onCancel={onCancel}
      />
    )
    fireEvent.click(screen.getByText('Cancel'))
    expect(onCancel).toHaveBeenCalled()
  })

  it('calls onCancel when backdrop is clicked', () => {
    const onCancel = vi.fn()
    const { container } = render(
      <GitignoreModal
        onAddToGitignore={vi.fn()}
        onContinueWithout={vi.fn()}
        onCancel={onCancel}
      />
    )
    const backdrop = container.querySelector('.fixed.inset-0')!
    fireEvent.click(backdrop)
    expect(onCancel).toHaveBeenCalled()
  })

  it('does not call onCancel when dialog content is clicked', () => {
    const onCancel = vi.fn()
    render(
      <GitignoreModal
        onAddToGitignore={vi.fn()}
        onContinueWithout={vi.fn()}
        onCancel={onCancel}
      />
    )
    fireEvent.click(screen.getByText('Set up .broomy/.gitignore?'))
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('mentions .broomy/output/ and .broomy/.gitignore in the description', () => {
    render(
      <GitignoreModal
        onAddToGitignore={vi.fn()}
        onContinueWithout={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    expect(screen.getByText('.broomy/output/')).toBeTruthy()
    expect(screen.getByText('.broomy/.gitignore')).toBeTruthy()
  })
})
