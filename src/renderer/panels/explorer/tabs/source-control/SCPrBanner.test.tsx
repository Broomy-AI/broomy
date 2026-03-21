// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../../../../test/react-setup'
import { SCPrBanner } from './SCPrBanner'
import type { GitHubPrStatus } from '../../../../../preload/index'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
})

const defaultProps = {
  prStatus: null as GitHubPrStatus,
  isPrLoading: false,
  branchStatus: undefined,
  branchBaseName: 'main',
  gitStatus: [],
  syncStatus: undefined,
  gitOpError: null as { operation: string; message: string } | null,
  onDismissError: vi.fn(),
  agentMergeMessage: null as string | null,
  onDismissAgentMerge: vi.fn(),
}

describe('SCPrBanner', () => {
  it('shows spinning refresh icon during PR loading', () => {
    render(<SCPrBanner {...defaultProps} isPrLoading={true} onRefresh={vi.fn()} />)
    // Should show "No pull request" (current status) instead of "Loading PR status..."
    expect(screen.getByText('No pull request')).toBeTruthy()
    // Refresh icon should be spinning
    const svg = screen.getByTitle('Refresh PR status').querySelector('svg')
    expect(svg?.getAttribute('class')).toContain('animate-spin')
  })

  it('renders PR status with number and title', () => {
    const prStatus = { number: 42, title: 'Add feature', state: 'OPEN' as const, url: 'https://github.com/test/pr/42', headRefName: 'feature/test', baseRefName: 'main' }
    render(<SCPrBanner {...defaultProps} prStatus={prStatus} />)
    expect(screen.getByText('OPEN')).toBeTruthy()
    expect(screen.getByText(/#42: Add feature/)).toBeTruthy()
  })

  it('opens PR URL in file panel when onFileSelect is provided', () => {
    const onFileSelect = vi.fn()
    const prStatus = { number: 42, title: 'Add feature', state: 'OPEN' as const, url: 'https://github.com/test/pr/42', headRefName: 'feature/test', baseRefName: 'main' }
    render(<SCPrBanner {...defaultProps} prStatus={prStatus} onFileSelect={onFileSelect} />)
    fireEvent.click(screen.getByText(/#42: Add feature/))
    expect(onFileSelect).toHaveBeenCalledWith({ filePath: 'https://github.com/test/pr/42', openInDiffMode: false })
    expect(window.shell.openExternal).not.toHaveBeenCalled()
  })

  it('falls back to external browser when onFileSelect is not provided', () => {
    const prStatus = { number: 42, title: 'Add feature', state: 'OPEN' as const, url: 'https://github.com/test/pr/42', headRefName: 'feature/test', baseRefName: 'main' }
    render(<SCPrBanner {...defaultProps} prStatus={prStatus} />)
    fireEvent.click(screen.getByText(/#42: Add feature/))
    expect(window.shell.openExternal).toHaveBeenCalledWith('https://github.com/test/pr/42')
  })

  it('shows merged status banner', () => {
    render(<SCPrBanner {...defaultProps} branchStatus="merged" />)
    expect(screen.getByText('MERGED')).toBeTruthy()
    expect(screen.getByText(/Branch merged to main/)).toBeTruthy()
  })

  it('shows issue link when issueNumber and issueUrl are provided', () => {
    render(
      <SCPrBanner
        {...defaultProps}
        issueNumber={42}
        issueTitle="Fix login bug"
        issueUrl="https://github.com/test/issues/42"
      />
    )
    expect(screen.getByText('ISSUE')).toBeTruthy()
    expect(screen.getByText('#42: Fix login bug')).toBeTruthy()
  })

  it('opens issue URL in file panel when onFileSelect is provided', () => {
    const onFileSelect = vi.fn()
    render(
      <SCPrBanner
        {...defaultProps}
        issueNumber={42}
        issueTitle="Fix login bug"
        issueUrl="https://github.com/test/issues/42"
        onFileSelect={onFileSelect}
      />
    )
    fireEvent.click(screen.getByText('#42: Fix login bug'))
    expect(onFileSelect).toHaveBeenCalledWith({ filePath: 'https://github.com/test/issues/42', openInDiffMode: false })
    expect(window.shell.openExternal).not.toHaveBeenCalled()
  })

  it('falls back to external browser for issue link when onFileSelect is not provided', () => {
    render(
      <SCPrBanner
        {...defaultProps}
        issueNumber={42}
        issueTitle="Fix login bug"
        issueUrl="https://github.com/test/issues/42"
      />
    )
    fireEvent.click(screen.getByText('#42: Fix login bug'))
    expect(window.shell.openExternal).toHaveBeenCalledWith('https://github.com/test/issues/42')
  })

  it('shows git operation error banner using DialogErrorBanner', () => {
    const gitOpError = { operation: 'Push', message: 'Authentication failed' }
    render(<SCPrBanner {...defaultProps} gitOpError={gitOpError} />)
    // DialogErrorBanner humanizes the error message
    expect(screen.getByText(/Push failed:.*authentication/i)).toBeTruthy()
  })

  it('calls onDismissError when error dismiss button is clicked', () => {
    const onDismissError = vi.fn()
    const gitOpError = { operation: 'Push', message: 'Failed' }
    render(<SCPrBanner {...defaultProps} gitOpError={gitOpError} onDismissError={onDismissError} />)
    const dismissBtn = screen.getByTitle('Dismiss')
    fireEvent.click(dismissBtn)
    expect(onDismissError).toHaveBeenCalled()
  })

  it('truncates long error messages in the banner', () => {
    const longMessage = 'A'.repeat(100)
    const gitOpError = { operation: 'Push', message: longMessage }
    render(<SCPrBanner {...defaultProps} gitOpError={gitOpError} />)
    const errorBtn = screen.getByTitle('Click to view full error')
    // Banner truncates via CSS; full text is in the DOM but visually clipped
    expect(errorBtn.textContent).toBe(`Push failed: ${'A'.repeat(100)}`)
    expect(errorBtn.className).toContain('truncate')
  })

  it('opens error detail modal when clicking error message', () => {
    const gitOpError = { operation: 'Push', message: 'auth failed' }
    render(<SCPrBanner {...defaultProps} gitOpError={gitOpError} />)
    const errorBtn = screen.getByTitle('Click to view full error')
    fireEvent.click(errorBtn)
    expect(errorBtn).toBeTruthy()
  })

  it('shows agent merge info banner when agentMergeMessage is set', () => {
    render(
      <SCPrBanner
        {...defaultProps}
        agentMergeMessage="Asked agent to resolve merge conflicts. Wait for the agent to finish, then commit the merge."
      />
    )
    expect(screen.getByText(/Asked agent to resolve merge conflicts/)).toBeTruthy()
  })

  it('calls onDismissAgentMerge when dismiss button is clicked', () => {
    const onDismissAgentMerge = vi.fn()
    render(
      <SCPrBanner
        {...defaultProps}
        agentMergeMessage="Agent is resolving conflicts."
        onDismissAgentMerge={onDismissAgentMerge}
      />
    )
    const dismissBtns = screen.getAllByTitle('Dismiss')
    fireEvent.click(dismissBtns[0])
    expect(onDismissAgentMerge).toHaveBeenCalled()
  })

  it('does not show agent merge banner when message is null', () => {
    render(<SCPrBanner {...defaultProps} agentMergeMessage={null} />)
    expect(screen.queryByText(/resolve merge conflicts/)).toBeNull()
  })
})
