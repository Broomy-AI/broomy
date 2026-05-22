// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import '../../../test/react-setup'

vi.mock('../../features/commands/actionExecutor', () => ({
  executeAction: vi.fn().mockResolvedValue({ success: true }),
}))

import { ActionButtons } from './ActionButtons'

const condState = {
  'has-changes': true, 'clean': false, 'merging': false, 'conflicts': false,
  'no-tracking': false, 'ahead': false, 'behind': false, 'behind-main': false,
  'on-main': false, 'in-progress': false, 'pushed': false, 'empty': false,
  'open': false, 'merged': false, 'closed': false, 'no-pr': true,
  'has-write-access': true, 'allow-approve-and-merge': true,
  'checks-passed': true, 'has-issue': false, 'no-devcontainer': false, 'review': false,
} as any

const ctx = { main: 'main', branch: 'b', directory: '/r', issueNumber: '' }

afterEach(() => {
  cleanup()
})

describe('ActionButtons', () => {
  it('renders the Setup CTA when actions is null/empty', () => {
    render(
      <ActionButtons
        actions={[]}
        conditionState={condState}
        templateVars={ctx}
        currentStage="new"
        directory="/r"
        onSetup={vi.fn()}
        onSetSessionStage={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: /set up commands/i })).toBeInTheDocument()
  })

  it('renders a button with two-line content (label + slash subtitle)', () => {
    render(
      <ActionButtons
        actions={[{ id: 'plan', label: 'Plan', template: '/plan' }]}
        conditionState={condState}
        templateVars={ctx}
        currentStage="new"
        directory="/r"
        onSetup={vi.fn()}
        onSetSessionStage={vi.fn()}
      />
    )
    expect(screen.getByText('Plan')).toBeInTheDocument()
    expect(screen.getByText('/plan')).toBeInTheDocument()
  })

  it('omits subtitle when template does not start with /', () => {
    render(
      <ActionButtons
        actions={[{ id: 'c', label: 'Commit', template: 'Commit this' }]}
        conditionState={condState}
        templateVars={ctx}
        currentStage="new"
        directory="/r"
        onSetup={vi.fn()}
        onSetSessionStage={vi.fn()}
      />
    )
    expect(screen.queryByText('/Commit')).toBeNull()
  })

  it('hides the stage pill when no action references stages or setStage', () => {
    render(
      <ActionButtons
        actions={[{ id: 'a', label: 'A', template: '/x' }]}
        conditionState={condState}
        templateVars={ctx}
        currentStage="new"
        directory="/r"
        onSetup={vi.fn()}
        onSetSessionStage={vi.fn()}
      />
    )
    expect(screen.queryByRole('button', { name: /stage:/i })).toBeNull()
  })

  it('shows the stage pill when any action references stages', () => {
    render(
      <ActionButtons
        actions={[{ id: 'a', label: 'A', template: '/x', stages: ['planning'] }]}
        conditionState={condState}
        templateVars={ctx}
        currentStage="new"
        directory="/r"
        onSetup={vi.fn()}
        onSetSessionStage={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: /stage:/i })).toBeInTheDocument()
  })

  it('runs action directly when template has no user args', async () => {
    const { executeAction } = await import('../../features/commands/actionExecutor')
    render(
      <ActionButtons
        actions={[{ id: 'a', label: 'A', template: '/x' }]}
        conditionState={condState}
        templateVars={ctx}
        currentStage="new"
        directory="/r"
        agentPtyId="pty-1"
        onSetup={vi.fn()}
        onSetSessionStage={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText('A'))
    expect(executeAction).toHaveBeenCalled()
  })

  it('opens ArgDialog when template has user args', async () => {
    render(
      <ActionButtons
        actions={[{ id: 'a', label: 'A', template: '/x {topic}' }]}
        conditionState={condState}
        templateVars={ctx}
        currentStage="new"
        directory="/r"
        agentPtyId="pty-1"
        onSetup={vi.fn()}
        onSetSessionStage={vi.fn()}
      />
    )
    // The button label gets a trailing ellipsis when it will open a dialog.
    fireEvent.click(screen.getByText('A…'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('shows stage pill when any action has setStage: null', () => {
    render(
      <ActionButtons
        actions={[{ id: 'a', label: 'A', template: '/x', setStage: null }]}
        conditionState={condState}
        templateVars={ctx}
        currentStage="new"
        directory="/r"
        onSetup={vi.fn()}
        onSetSessionStage={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: /stage:/i })).toBeInTheDocument()
  })

  it('pre-fills last-used arg values when reopening ArgDialog', async () => {
    render(
      <ActionButtons
        actions={[{ id: 'a', label: 'A', template: '/x {topic}' }]}
        conditionState={condState}
        templateVars={ctx}
        currentStage="new"
        directory="/r"
        agentPtyId="pty-1"
        onSetup={vi.fn()}
        onSetSessionStage={vi.fn()}
      />
    )
    // First open — type a value and run
    fireEvent.click(screen.getByText('A…', { selector: 'span' }))
    fireEvent.change(screen.getByLabelText(/topic/i), { target: { value: 'auth' } })
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    // Second open — value should be pre-filled (dialog closes, button re-enabled)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    fireEvent.click(screen.getByText('A…', { selector: 'span' }))
    expect(screen.getByLabelText(/topic/i)).toHaveValue('auth')
  })
})
