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
}

describe('SCPrBanner', () => {
  it('shows loading state for PR', () => {
    render(<SCPrBanner {...defaultProps} isPrLoading={true} />)
    expect(screen.getByText('Loading PR status...')).toBeTruthy()
  })

  it('renders PR status with number and title', () => {
    const prStatus = { number: 42, title: 'Add feature', state: 'OPEN', url: 'https://github.com/test/pr/42' }
    render(<SCPrBanner {...defaultProps} prStatus={prStatus} />)
    expect(screen.getByText('OPEN')).toBeTruthy()
    expect(screen.getByText(/#42: Add feature/)).toBeTruthy()
  })

  it('opens PR URL in external browser when clicked', () => {
    const prStatus = { number: 42, title: 'Add feature', state: 'OPEN', url: 'https://github.com/test/pr/42' }
    render(<SCPrBanner {...defaultProps} prStatus={prStatus} />)
    fireEvent.click(screen.getByText(/#42: Add feature/))
    expect(window.shell.openExternal).toHaveBeenCalledWith('https://github.com/test/pr/42')
  })

  it('shows sync button when PR is open and no uncommitted changes', () => {
    const prStatus = { number: 42, title: 'Add feature', state: 'OPEN', url: 'https://github.com/test/pr/42' }
    const syncStatus = { current: 'feature/test', tracking: 'origin/feature/test', ahead: 0, behind: 0 }
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
    const prStatus = { number: 42, title: 'Add feature', state: 'OPEN', url: 'https://github.com/test/pr/42' }
    const syncStatus = { current: 'feature/test', tracking: 'origin/feature/test', ahead: 0, behind: 0 }
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
    const prStatus = { number: 42, title: 'Add feature', state: 'OPEN', url: 'https://github.com/test/pr/42' }
    const syncStatus = { current: 'feature/test', tracking: 'origin/feature/test', ahead: 0, behind: 0 }
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
})
