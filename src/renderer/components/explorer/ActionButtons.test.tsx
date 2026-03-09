// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import '../../../test/react-setup'

vi.mock('../../utils/actionExecutor', () => ({
  executeAction: vi.fn().mockResolvedValue({ success: true }),
}))

import { ActionButtons } from './ActionButtons'
import { executeAction } from '../../utils/actionExecutor'
import type { ActionDefinition, ConditionState, TemplateVars } from '../../utils/commandsConfig'

beforeEach(() => { vi.clearAllMocks() })
afterEach(() => { cleanup() })

const BASE_STATE: ConditionState = {
  'has-changes': true, clean: false, merging: false, conflicts: false,
  'no-tracking': false, ahead: false, behind: false, 'behind-main': false,
  'on-main': false, 'in-progress': true, pushed: false, empty: false,
  open: false, merged: false, closed: false, 'no-pr': true,
  'has-write-access': true, 'allow-approve-and-merge': false, 'checks-passed': false, 'has-issue': false, 'no-devcontainer': false, review: false,
}
const VARS: TemplateVars = { main: 'main', branch: 'feature/test', directory: '/repo' }

const ACTIONS: ActionDefinition[] = [
  { id: 'commit', label: 'Commit', type: 'agent', prompt: 'commit', showWhen: ['has-changes'] },
  { id: 'push', label: 'Push to {main}', type: 'shell', command: 'git push', showWhen: ['clean'] },
]

describe('ActionButtons', () => {
  it('renders visible actions based on showWhen', () => {
    render(
      <ActionButtons actions={ACTIONS} conditionState={BASE_STATE} templateVars={VARS}
        directory="/repo" agentPtyId="pty-1" />
    )
    expect(screen.getByText('Commit')).toBeTruthy()
    expect(screen.queryByText('Push to main')).toBeNull() // clean is false
  })

  it('resolves template vars in labels', () => {
    render(
      <ActionButtons actions={ACTIONS} conditionState={{ ...BASE_STATE, clean: true }} templateVars={VARS}
        directory="/repo" agentPtyId="pty-1" />
    )
    expect(screen.getByText('Push to main')).toBeTruthy()
  })

  it('returns null when no actions are visible', () => {
    const { container } = render(
      <ActionButtons actions={ACTIONS} conditionState={{ ...BASE_STATE, 'has-changes': false }} templateVars={VARS}
        directory="/repo" agentPtyId="pty-1" />
    )
    expect(container.firstChild).toBeNull()
  })

  it('disables agent buttons when no agentPtyId', () => {
    render(
      <ActionButtons actions={ACTIONS} conditionState={BASE_STATE} templateVars={VARS}
        directory="/repo" />
    )
    const btn = screen.getByText('Commit')
    expect(btn.hasAttribute('disabled')).toBe(true)
  })

  it('calls executeAction on click', async () => {
    render(
      <ActionButtons actions={ACTIONS} conditionState={BASE_STATE} templateVars={VARS}
        directory="/repo" agentPtyId="pty-1" />
    )
    await act(async () => {
      fireEvent.click(screen.getByText('Commit'))
    })
    expect(executeAction).toHaveBeenCalled()
  })

  it('shows error when action fails', async () => {
    vi.mocked(executeAction).mockResolvedValueOnce({ success: false, error: 'Something failed' })
    render(
      <ActionButtons actions={ACTIONS} conditionState={BASE_STATE} templateVars={VARS}
        directory="/repo" agentPtyId="pty-1" />
    )
    await act(async () => {
      fireEvent.click(screen.getByText('Commit'))
    })
    expect(screen.getByText('Something failed')).toBeTruthy()
  })

  it('uses default actions when actions is null', () => {
    render(
      <ActionButtons actions={null} conditionState={BASE_STATE} templateVars={VARS}
        directory="/repo" agentPtyId="pty-1" />
    )
    // Default config has a "Commit with AI" action for has-changes
    expect(screen.getByText('Commit with AI')).toBeTruthy()
  })

  it('filters actions by surface', () => {
    const actions: ActionDefinition[] = [
      { id: 'commit', label: 'Commit', type: 'agent', prompt: 'commit', showWhen: ['has-changes'] },
      { id: 'review', label: 'Review', type: 'agent', prompt: 'review', showWhen: ['has-changes'], surface: 'review' },
      { id: 'both', label: 'Both', type: 'agent', prompt: 'both', showWhen: ['has-changes'], surface: ['source-control', 'review'] },
    ]
    render(
      <ActionButtons actions={actions} conditionState={BASE_STATE} templateVars={VARS}
        directory="/repo" agentPtyId="pty-1" surface="source-control" />
    )
    expect(screen.getByText('Commit')).toBeTruthy()
    expect(screen.queryByText('Review')).toBeNull()
    expect(screen.getByText('Both')).toBeTruthy()

    cleanup()
    render(
      <ActionButtons actions={actions} conditionState={BASE_STATE} templateVars={VARS}
        directory="/repo" agentPtyId="pty-1" surface="review" />
    )
    expect(screen.queryByText('Commit')).toBeNull()
    expect(screen.getByText('Review')).toBeTruthy()
    expect(screen.getByText('Both')).toBeTruthy()
  })

  it('calls onSwitchTab when action has switchTab', async () => {
    const onSwitchTab = vi.fn()
    const actions: ActionDefinition[] = [
      { id: 'review', label: 'Review', type: 'agent', prompt: 'review', showWhen: ['has-changes'], switchTab: 'review' },
    ]
    render(
      <ActionButtons actions={actions} conditionState={BASE_STATE} templateVars={VARS}
        directory="/repo" agentPtyId="pty-1" onSwitchTab={onSwitchTab} />
    )
    await act(async () => {
      fireEvent.click(screen.getByText('Review'))
    })
    expect(onSwitchTab).toHaveBeenCalledWith('review')
  })
})
