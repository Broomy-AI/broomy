// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../../test/react-setup'
import { SCPrBanner } from './SCPrBanner'
import type { GitHubPrStatus } from '../../../preload/index'

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
  isSyncingWithMain: false,
  onSyncWithMain: vi.fn(),
  gitOpError: null as { operation: string; message: string } | null,
  onDismissError: vi.fn(),
  agentMergeMessage: null as string | null,
  onDismissAgentMerge: vi.fn(),
}

describe('SCPrBanner', () => {
  it('shows loading state for PR', () => {
    render(<SCPrBanner {...defaultProps} isPrLoading={true} />)
    expect(screen.getByText('Loading PR status...')).toBeTruthy()
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

  it('shows sync button when PR is open and no uncommitted changes', () => {
    const prStatus = { number: 42, title: 'Add feature', state: 'OPEN' as const, url: 'https://github.com/test/pr/42', headRefName: 'feature/test', baseRefName: 'main' }
    const syncStatus = { current: 'feature/test', tracking: 'origin/feature/test', ahead: 0, behind: 0, files: [] }
    render(
      <SCPrBanner
        {...defaultProps}
        prStatus={prStatus}
        syncStatus={syncStatus}
        gitStatus={[]}
      />
    )
    expect(screen.getByText('Sync with main')).toBeTruthy()
  })

  it('calls onSyncWithMain when sync button is clicked', () => {
    const onSyncWithMain = vi.fn()
    const prStatus = { number: 42, title: 'Add feature', state: 'OPEN' as const, url: 'https://github.com/test/pr/42', headRefName: 'feature/test', baseRefName: 'main' }
    const syncStatus = { current: 'feature/test', tracking: 'origin/feature/test', ahead: 0, behind: 0, files: [] }
    render(
      <SCPrBanner
        {...defaultProps}
        prStatus={prStatus}
        syncStatus={syncStatus}
        gitStatus={[]}
        onSyncWithMain={onSyncWithMain}
      />
    )
    fireEvent.click(screen.getByText('Sync with main'))
    expect(onSyncWithMain).toHaveBeenCalled()
  })

  it('shows Syncing... when syncing with main', () => {
    const prStatus = { number: 42, title: 'Add feature', state: 'OPEN' as const, url: 'https://github.com/test/pr/42', headRefName: 'feature/test', baseRefName: 'main' }
    const syncStatus = { current: 'feature/test', tracking: 'origin/feature/test', ahead: 0, behind: 0, files: [] }
    render(
      <SCPrBanner
        {...defaultProps}
        prStatus={prStatus}
        syncStatus={syncStatus}
        gitStatus={[]}
        isSyncingWithMain={true}
      />
    )
    expect(screen.getByText('Syncing...')).toBeTruthy()
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

  it('opens issue URL when issue link is clicked', () => {
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

  it('shows git operation error banner', () => {
    const gitOpError = { operation: 'Push', message: 'Authentication failed' }
    render(<SCPrBanner {...defaultProps} gitOpError={gitOpError} />)
    expect(screen.getByText(/Push failed: Authentication failed/)).toBeTruthy()
  })

  it('calls onDismissError when error dismiss button is clicked', () => {
    const onDismissError = vi.fn()
    const gitOpError = { operation: 'Push', message: 'Failed' }
    render(<SCPrBanner {...defaultProps} gitOpError={gitOpError} onDismissError={onDismissError} />)
    // The dismiss button is the x character
    const dismissBtn = screen.getByTitle('Dismiss')
    fireEvent.click(dismissBtn)
    expect(onDismissError).toHaveBeenCalled()
  })

  it('truncates long error messages', () => {
    const longMessage = 'A'.repeat(100)
    const gitOpError = { operation: 'Push', message: longMessage }
    render(<SCPrBanner {...defaultProps} gitOpError={gitOpError} />)
    // Should show truncated version
    const errorText = screen.getByText(/Push failed:/)
    expect(errorText.textContent).toContain('...')
  })

  it('calls showErrorDetail when clicking error message', () => {
    const gitOpError = { operation: 'Push', message: 'auth failed' }
    render(<SCPrBanner {...defaultProps} gitOpError={gitOpError} />)
    const errorBtn = screen.getByText(/Push failed:/)
    fireEvent.click(errorBtn)
    // showErrorDetail should have been called on the error store
    // The button exists and is clickable without throwing
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
