// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../../test/react-setup'
import { ArgDialog } from './ArgDialog'

const ctx = { main: 'main', branch: 'feat', directory: '/r', issueNumber: '' }

afterEach(() => {
  cleanup()
})

describe('ArgDialog', () => {
  it('renders one field per required arg', () => {
    render(
      <ArgDialog
        title="Plan"
        description="Plan a feature"
        template="/plan {topic}"
        argsMeta={[{ name: 'topic', description: 'The topic' }]}
        context={ctx}
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    expect(screen.getByLabelText(/topic/i)).toBeInTheDocument()
    expect(screen.getByText('The topic')).toBeInTheDocument()
  })

  it('disables Run while required args are empty', () => {
    render(
      <ArgDialog
        title="Plan"
        template="/plan {topic}"
        argsMeta={[]}
        context={ctx}
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled()
  })

  it('enables Run once required args have values', () => {
    render(
      <ArgDialog
        title="Plan"
        template="/plan {topic}"
        argsMeta={[]}
        context={ctx}
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    fireEvent.change(screen.getByLabelText(/topic/i), { target: { value: 'auth' } })
    expect(screen.getByRole('button', { name: 'Run' })).toBeEnabled()
  })

  it('toggles optional flag-group with a checkbox', () => {
    render(
      <ArgDialog
        title="Plan"
        template="/plan {topic} --depth {depth}"
        argsMeta={[]}
        context={ctx}
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    fireEvent.change(screen.getByLabelText(/topic/i), { target: { value: 'a' } })
    // Depth input should be hidden until checkbox is checked
    expect(screen.queryByLabelText(/depth/i)).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: /--depth/i }))
    expect(screen.getByLabelText(/depth/i)).toBeInTheDocument()
  })

  it('shows live resolved preview', () => {
    render(
      <ArgDialog
        title="Plan"
        template="/plan {topic}"
        argsMeta={[]}
        context={ctx}
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    fireEvent.change(screen.getByLabelText(/topic/i), { target: { value: 'auth' } })
    expect(screen.getByTestId('resolved-preview')).toHaveTextContent('/plan auth')
  })

  it('calls onRun with arg values map', () => {
    const onRun = vi.fn()
    render(
      <ArgDialog
        title="Plan"
        template="/plan {topic} --depth {depth}"
        argsMeta={[]}
        context={ctx}
        onRun={onRun}
        onCancel={vi.fn()}
      />
    )
    fireEvent.change(screen.getByLabelText(/topic/i), { target: { value: 'a' } })
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    expect(onRun).toHaveBeenCalledWith({
      topic: { value: 'a' },
      depth: { value: '', enabled: false },
    })
  })

  it('Cancel triggers onCancel', () => {
    const onCancel = vi.fn()
    render(
      <ArgDialog title="t" template="/x" argsMeta={[]} context={ctx} onRun={vi.fn()} onCancel={onCancel} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('renders a textarea for multi-line args', () => {
    render(
      <ArgDialog
        title="Brainstorm"
        template="Help me brainstorm: {goal}"
        argsMeta={[{ name: 'goal', description: 'The thing', multiline: true }]}
        context={ctx}
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    const field = screen.getByLabelText('goal')
    expect(field.tagName).toBe('TEXTAREA')
  })

  it('renders an input (not textarea) when multiline is false or undefined', () => {
    render(
      <ArgDialog
        title="Plan"
        template="/plan {topic}"
        argsMeta={[{ name: 'topic' }]}
        context={ctx}
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    expect(screen.getByLabelText('topic').tagName).toBe('INPUT')
  })

  it('multi-line value substitutes into the resolved preview', () => {
    render(
      <ArgDialog
        title="Brainstorm"
        template="Help me brainstorm: {goal}"
        argsMeta={[{ name: 'goal', multiline: true }]}
        context={ctx}
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    fireEvent.change(screen.getByLabelText('goal'), { target: { value: 'line one\nline two' } })
    const resolved = screen.getByTestId('resolved-preview')
    expect(resolved.textContent).toContain('line one')
    expect(resolved.textContent).toContain('line two')
  })
})
