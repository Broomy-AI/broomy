// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../../test/react-setup'
import { CommitMessageDialog } from './CommitMessageDialog'

afterEach(() => {
  cleanup()
})

describe('CommitMessageDialog', () => {
  it('renders with textarea and buttons', () => {
    render(<CommitMessageDialog onCommit={vi.fn()} onClose={vi.fn()} hasStagedFiles={true} />)
    expect(screen.getByText('Commit Message')).toBeTruthy()
    expect(screen.getByPlaceholderText('Enter commit message...')).toBeTruthy()
    expect(screen.getByText('Cancel')).toBeTruthy()
    expect(screen.getByText('Commit')).toBeTruthy()
  })

  it('disables Commit button when message is empty', () => {
    render(<CommitMessageDialog onCommit={vi.fn()} onClose={vi.fn()} hasStagedFiles={true} />)
    const commitBtn = screen.getByText('Commit')
    expect(commitBtn.hasAttribute('disabled')).toBe(true)
  })

  it('enables Commit button when message is entered', () => {
    render(<CommitMessageDialog onCommit={vi.fn()} onClose={vi.fn()} hasStagedFiles={true} />)
    fireEvent.change(screen.getByPlaceholderText('Enter commit message...'), {
      target: { value: 'fix: something' },
    })
    const commitBtn = screen.getByText('Commit')
    expect(commitBtn.hasAttribute('disabled')).toBe(false)
  })

  it('calls onCommit with trimmed message and stageAll=false when files are staged', () => {
    const onCommit = vi.fn()
    const onClose = vi.fn()
    render(<CommitMessageDialog onCommit={onCommit} onClose={onClose} hasStagedFiles={true} />)
    fireEvent.change(screen.getByPlaceholderText('Enter commit message...'), {
      target: { value: '  fix: something  ' },
    })
    fireEvent.click(screen.getByText('Commit'))
    expect(onCommit).toHaveBeenCalledWith('fix: something', false)
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn()
    render(<CommitMessageDialog onCommit={vi.fn()} onClose={onClose} hasStagedFiles={true} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn()
    render(<CommitMessageDialog onCommit={vi.fn()} onClose={onClose} hasStagedFiles={true} />)
    fireEvent.keyDown(screen.getByPlaceholderText('Enter commit message...'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('submits on Cmd+Enter', () => {
    const onCommit = vi.fn()
    const onClose = vi.fn()
    render(<CommitMessageDialog onCommit={onCommit} onClose={onClose} hasStagedFiles={true} />)
    const textarea = screen.getByPlaceholderText('Enter commit message...')
    fireEvent.change(textarea, { target: { value: 'test commit' } })
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true })
    expect(onCommit).toHaveBeenCalledWith('test commit', false)
    expect(onClose).toHaveBeenCalled()
  })

  it('submits on Ctrl+Enter', () => {
    const onCommit = vi.fn()
    const onClose = vi.fn()
    render(<CommitMessageDialog onCommit={onCommit} onClose={onClose} hasStagedFiles={true} />)
    const textarea = screen.getByPlaceholderText('Enter commit message...')
    fireEvent.change(textarea, { target: { value: 'test commit' } })
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true })
    expect(onCommit).toHaveBeenCalledWith('test commit', false)
    expect(onClose).toHaveBeenCalled()
  })

  it('does not submit on plain Enter', () => {
    const onCommit = vi.fn()
    render(<CommitMessageDialog onCommit={onCommit} onClose={vi.fn()} hasStagedFiles={true} />)
    const textarea = screen.getByPlaceholderText('Enter commit message...')
    fireEvent.change(textarea, { target: { value: 'test commit' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('does not submit when message is only whitespace', () => {
    const onCommit = vi.fn()
    render(<CommitMessageDialog onCommit={onCommit} onClose={vi.fn()} hasStagedFiles={true} />)
    fireEvent.change(screen.getByPlaceholderText('Enter commit message...'), {
      target: { value: '   ' },
    })
    fireEvent.click(screen.getByText('Commit'))
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('closes when clicking backdrop', () => {
    const onClose = vi.fn()
    const { container } = render(<CommitMessageDialog onCommit={vi.fn()} onClose={onClose} hasStagedFiles={true} />)
    // Click the backdrop (outermost div)
    const backdrop = container.firstElementChild as HTMLElement
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalled()
  })

  it('does not close when clicking dialog content', () => {
    const onClose = vi.fn()
    render(<CommitMessageDialog onCommit={vi.fn()} onClose={onClose} hasStagedFiles={true} />)
    fireEvent.click(screen.getByText('Commit Message'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('shows warning and defaults stageAll=true when no files are staged', () => {
    const onCommit = vi.fn()
    const onClose = vi.fn()
    render(<CommitMessageDialog onCommit={onCommit} onClose={onClose} hasStagedFiles={false} />)
    expect(screen.getByText('No files are staged. All changes will be committed.')).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText('Enter commit message...'), {
      target: { value: 'commit all' },
    })
    fireEvent.click(screen.getByText('Commit'))
    expect(onCommit).toHaveBeenCalledWith('commit all', true)
  })

  it('shows stage-all checkbox when files are staged', () => {
    render(<CommitMessageDialog onCommit={vi.fn()} onClose={vi.fn()} hasStagedFiles={true} />)
    expect(screen.getByText('Stage all changes before committing')).toBeTruthy()
    expect(screen.queryByText('No files are staged. All changes will be committed.')).toBeNull()
  })

  it('allows toggling stage-all checkbox when files are staged', () => {
    const onCommit = vi.fn()
    render(<CommitMessageDialog onCommit={onCommit} onClose={vi.fn()} hasStagedFiles={true} />)
    const checkbox = screen.getByRole('checkbox')
    // Default is unchecked when files are already staged
    expect((checkbox as HTMLInputElement).checked).toBe(false)
    fireEvent.click(checkbox)
    expect((checkbox as HTMLInputElement).checked).toBe(true)
    fireEvent.change(screen.getByPlaceholderText('Enter commit message...'), {
      target: { value: 'commit all' },
    })
    fireEvent.click(screen.getByText('Commit'))
    expect(onCommit).toHaveBeenCalledWith('commit all', true)
  })
})
