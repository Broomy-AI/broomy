// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../../test/react-setup'
import {
  NewStageModal,
  CommandExpandedEditor,
  ArgsTable,
  StageChips,
  DeleteButton,
  UnsavedChangesModal,
} from './CommandsEditorParts'

afterEach(() => {
  cleanup()
})

// ---- NewStageModal ----

describe('NewStageModal', () => {
  it('renders title, input, and Add button', () => {
    render(<NewStageModal title="Add a stage" onCancel={vi.fn()} onSubmit={vi.fn()} />)
    expect(screen.getByText('Add a stage')).toBeInTheDocument()
    expect(screen.getByTestId('new-stage-input')).toBeInTheDocument()
    expect(screen.getByTestId('new-stage-submit')).toBeInTheDocument()
  })

  it('Add button is disabled when input is empty', () => {
    render(<NewStageModal title="New stage" onCancel={vi.fn()} onSubmit={vi.fn()} />)
    expect(screen.getByTestId('new-stage-submit')).toBeDisabled()
  })

  it('Add button is enabled after typing', () => {
    render(<NewStageModal title="New stage" onCancel={vi.fn()} onSubmit={vi.fn()} />)
    fireEvent.change(screen.getByTestId('new-stage-input'), { target: { value: 'ready' } })
    expect(screen.getByTestId('new-stage-submit')).not.toBeDisabled()
  })

  it('clicking Add button calls onSubmit with the typed value', () => {
    const onSubmit = vi.fn()
    render(<NewStageModal title="New stage" onCancel={vi.fn()} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByTestId('new-stage-input'), { target: { value: 'shipped' } })
    fireEvent.click(screen.getByTestId('new-stage-submit'))
    expect(onSubmit).toHaveBeenCalledWith('shipped')
  })

  it('Enter key submits when input is non-empty', () => {
    const onSubmit = vi.fn()
    render(<NewStageModal title="New stage" onCancel={vi.fn()} onSubmit={onSubmit} />)
    const input = screen.getByTestId('new-stage-input')
    fireEvent.change(input, { target: { value: 'done' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSubmit).toHaveBeenCalledWith('done')
  })

  it('Enter key does nothing when input is empty', () => {
    const onSubmit = vi.fn()
    render(<NewStageModal title="New stage" onCancel={vi.fn()} onSubmit={onSubmit} />)
    fireEvent.keyDown(screen.getByTestId('new-stage-input'), { key: 'Enter' })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('Escape key calls onCancel', () => {
    const onCancel = vi.fn()
    render(<NewStageModal title="New stage" onCancel={onCancel} onSubmit={vi.fn()} />)
    fireEvent.keyDown(screen.getByTestId('new-stage-input'), { key: 'Escape' })
    expect(onCancel).toHaveBeenCalled()
  })

  it('clicking Cancel button calls onCancel', () => {
    const onCancel = vi.fn()
    render(<NewStageModal title="New stage" onCancel={onCancel} onSubmit={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('clicking the backdrop (outside the dialog) calls onCancel', () => {
    const onCancel = vi.fn()
    render(<NewStageModal title="New stage" onCancel={onCancel} onSubmit={vi.fn()} />)
    // The outer div has role="dialog" and the onClick for backdrop
    fireEvent.click(screen.getByRole('dialog'))
    expect(onCancel).toHaveBeenCalled()
  })
})

// ---- CommandExpandedEditor ----

describe('CommandExpandedEditor', () => {
  it('renders textarea with initial value', () => {
    render(<CommandExpandedEditor varInput={{ directory: "" }} value="/plan {topic}" onChange={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByTestId('expanded-command-textarea')).toHaveValue('/plan {topic}')
  })

  it('typing in textarea fires onChange', () => {
    const onChange = vi.fn()
    render(<CommandExpandedEditor varInput={{ directory: "" }} value="/plan" onChange={onChange} onClose={vi.fn()} />)
    fireEvent.change(screen.getByTestId('expanded-command-textarea'), { target: { value: '/plan updated' } })
    expect(onChange).toHaveBeenCalledWith('/plan updated')
  })

  it('close button calls onClose', () => {
    const onClose = vi.fn()
    render(<CommandExpandedEditor varInput={{ directory: "" }} value="x" onChange={vi.fn()} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('close-expanded-command'))
    expect(onClose).toHaveBeenCalled()
  })

  it('clicking the backdrop calls onClose', () => {
    const onClose = vi.fn()
    render(<CommandExpandedEditor varInput={{ directory: "" }} value="x" onChange={vi.fn()} onClose={onClose} />)
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalled()
  })

  it('Escape key on the dialog calls onClose', () => {
    const onClose = vi.fn()
    render(<CommandExpandedEditor varInput={{ directory: "" }} value="x" onChange={vi.fn()} onClose={onClose} />)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})

// ---- ArgsTable ----

describe('ArgsTable', () => {
  const parsedArgs = [
    { name: 'topic', optional: false, flag: null },
    { name: 'depth', optional: true, flag: '--depth' },
  ]

  it('renders a row per detected arg with name', () => {
    render(<ArgsTable parsedArgs={parsedArgs} argsMeta={[]} updateArgMeta={vi.fn()} />)
    expect(screen.getByText('topic')).toBeInTheDocument()
    expect(screen.getByText('depth')).toBeInTheDocument()
  })

  it('shows "optional" badge for optional args', () => {
    render(<ArgsTable parsedArgs={parsedArgs} argsMeta={[]} updateArgMeta={vi.fn()} />)
    expect(screen.getByText('optional')).toBeInTheDocument()
  })

  it('toggling multi-line checkbox calls updateArgMeta with multiline: true', () => {
    const updateArgMeta = vi.fn()
    render(<ArgsTable parsedArgs={parsedArgs} argsMeta={[]} updateArgMeta={updateArgMeta} />)
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0]) // topic checkbox
    expect(updateArgMeta).toHaveBeenCalledWith('topic', { multiline: true })
  })

  it('typing in description input calls updateArgMeta with description', () => {
    const updateArgMeta = vi.fn()
    render(<ArgsTable parsedArgs={[{ name: 'topic', optional: false, flag: null }]} argsMeta={[]} updateArgMeta={updateArgMeta} />)
    const inputs = screen.getAllByRole('textbox')
    fireEvent.change(inputs[0], { target: { value: 'The topic to plan' } })
    expect(updateArgMeta).toHaveBeenCalledWith('topic', { description: 'The topic to plan' })
  })

  it('shows existing meta description and checked state', () => {
    render(
      <ArgsTable
        parsedArgs={[{ name: 'topic', optional: false, flag: null }]}
        argsMeta={[{ name: 'topic', description: 'existing desc', multiline: true }]}
        updateArgMeta={vi.fn()}
      />
    )
    expect(screen.getByDisplayValue('existing desc')).toBeInTheDocument()
    expect(screen.getByRole('checkbox')).toBeChecked()
  })
})

// ---- StageChips ----

describe('StageChips', () => {
  it('renders chips for each option', () => {
    render(
      <StageChips
        selected={['planning']}
        options={['planning', 'building', 'done']}
        onChange={vi.fn()}
      />
    )
    expect(screen.getByText('planning')).toBeInTheDocument()
    expect(screen.getByText('building')).toBeInTheDocument()
    expect(screen.getByText('done')).toBeInTheDocument()
  })

  it('renders a "+ New stage…" button', () => {
    render(<StageChips selected={[]} options={[]} onChange={vi.fn()} />)
    expect(screen.getByTestId('add-new-stage')).toBeInTheDocument()
  })

  it('clicking "+ New stage…" opens the NewStageModal', () => {
    render(<StageChips selected={[]} options={[]} onChange={vi.fn()} />)
    fireEvent.click(screen.getByTestId('add-new-stage'))
    expect(screen.getByTestId('new-stage-input')).toBeInTheDocument()
  })

  it('submitting NewStageModal adds the new stage to selected and closes modal', () => {
    const onChange = vi.fn()
    render(<StageChips selected={['planning']} options={['planning']} onChange={onChange} />)
    fireEvent.click(screen.getByTestId('add-new-stage'))
    fireEvent.change(screen.getByTestId('new-stage-input'), { target: { value: 'shipped' } })
    fireEvent.click(screen.getByTestId('new-stage-submit'))
    expect(onChange).toHaveBeenCalledWith(['planning', 'shipped'])
    // Modal should be gone
    expect(screen.queryByTestId('new-stage-input')).toBeNull()
  })

  it('toggling a selected chip removes it from selected', () => {
    const onChange = vi.fn()
    render(
      <StageChips
        selected={['planning', 'done']}
        options={['planning', 'done']}
        onChange={onChange}
      />
    )
    fireEvent.click(screen.getByText('planning'))
    expect(onChange).toHaveBeenCalledWith(['done'])
  })

  it('toggling an unselected chip adds it to selected', () => {
    const onChange = vi.fn()
    render(
      <StageChips
        selected={[]}
        options={['planning', 'done']}
        onChange={onChange}
      />
    )
    fireEvent.click(screen.getByText('planning'))
    expect(onChange).toHaveBeenCalledWith(['planning'])
  })

  it('cancelling NewStageModal closes without calling onChange', () => {
    const onChange = vi.fn()
    render(<StageChips selected={[]} options={[]} onChange={onChange} />)
    fireEvent.click(screen.getByTestId('add-new-stage'))
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.queryByTestId('new-stage-input')).toBeNull()
  })
})

// ---- DeleteButton ----

describe('DeleteButton', () => {
  it('shows "Delete command" on first render', () => {
    render(<DeleteButton id="cmd-1" onDelete={vi.fn()} />)
    expect(screen.getByRole('button', { name: /delete command/i })).toBeInTheDocument()
  })

  it('clicking once shows confirmation prompt', () => {
    render(<DeleteButton id="cmd-1" onDelete={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /delete command/i }))
    expect(screen.getByRole('button', { name: /confirm delete/i })).toBeInTheDocument()
  })

  it('clicking "Confirm delete" calls onDelete', () => {
    const onDelete = vi.fn()
    render(<DeleteButton id="cmd-1" onDelete={onDelete} />)
    fireEvent.click(screen.getByRole('button', { name: /delete command/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm delete/i }))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('clicking Cancel in confirmation goes back to initial state', () => {
    render(<DeleteButton id="cmd-1" onDelete={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /delete command/i }))
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(screen.getByRole('button', { name: /delete command/i })).toBeInTheDocument()
  })
})

// ---- UnsavedChangesModal ----

describe('UnsavedChangesModal', () => {
  it('renders with correct tab name in description', () => {
    render(
      <UnsavedChangesModal
        tabName="User"
        onSave={vi.fn()}
        onDiscard={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    expect(screen.getByText(/You have unsaved changes to User commands/)).toBeInTheDocument()
  })

  it('clicking Save calls onSave', () => {
    const onSave = vi.fn()
    render(
      <UnsavedChangesModal tabName="Project" onSave={onSave} onDiscard={vi.fn()} onCancel={vi.fn()} />
    )
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(onSave).toHaveBeenCalled()
  })

  it('clicking Discard calls onDiscard', () => {
    const onDiscard = vi.fn()
    render(
      <UnsavedChangesModal tabName="Project" onSave={vi.fn()} onDiscard={onDiscard} onCancel={vi.fn()} />
    )
    fireEvent.click(screen.getByRole('button', { name: /^discard$/i }))
    expect(onDiscard).toHaveBeenCalled()
  })

  it('clicking Cancel calls onCancel', () => {
    const onCancel = vi.fn()
    render(
      <UnsavedChangesModal tabName="Project" onSave={vi.fn()} onDiscard={vi.fn()} onCancel={onCancel} />
    )
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(onCancel).toHaveBeenCalled()
  })
})
