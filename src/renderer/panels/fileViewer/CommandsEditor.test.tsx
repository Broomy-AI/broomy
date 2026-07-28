// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import '../../../test/react-setup'
import { CommandsEditor } from './CommandsEditor'

// Mock getUserCommandsConfigPath so it doesn't call window.app.homedir (which is memoised)
vi.mock('../../features/commands/userConfigPath', () => ({
  getUserCommandsConfigPath: vi.fn().mockResolvedValue('/Users/test/.broomy/commands.json'),
  userCommandsDir: (home: string) => `${home}/.broomy`,
  _resetUserCommandsCacheForTest: vi.fn(),
}))

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(window.fs.exists).mockResolvedValue(false)
  vi.mocked(window.fs.readFile).mockRejectedValue(new Error('not found'))
  vi.mocked(window.fs.writeFile).mockResolvedValue({ success: true })
  vi.mocked(window.fs.mkdir).mockResolvedValue({ success: true })
})

describe('CommandsEditor', () => {
  it('shows User/Project tabs', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(false)
    render(<CommandsEditor directory="/repo" onClose={vi.fn()} />)
    expect(await screen.findByRole('tab', { name: /user/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /project/i })).toBeInTheDocument()
  })

  it('lists user commands on the left when User tab is selected', async () => {
    vi.mocked(window.fs.exists).mockImplementation(async (p: string) => p === '/Users/test/.broomy/commands.json')
    vi.mocked(window.fs.readFile).mockResolvedValue(JSON.stringify({
      version: 2, actions: [{ id: 'u', label: 'My Cmd', template: '/x' }],
    }))
    render(<CommandsEditor directory="/repo" onClose={vi.fn()} />)
    expect(await screen.findByText('My Cmd')).toBeInTheDocument()
    expect(screen.getByText('/x')).toBeInTheDocument()
  })

  it('selecting a row populates the right pane', async () => {
    vi.mocked(window.fs.exists).mockImplementation(async (p: string) => p === '/Users/test/.broomy/commands.json')
    vi.mocked(window.fs.readFile).mockResolvedValue(JSON.stringify({
      version: 2, actions: [{ id: 'u', label: 'My Cmd', template: '/x', description: 'help' }],
    }))
    render(<CommandsEditor directory="/repo" onClose={vi.fn()} />)
    fireEvent.click(await screen.findByText('My Cmd'))
    expect(screen.getByDisplayValue('My Cmd')).toBeInTheDocument()
    expect(screen.getByDisplayValue('help')).toBeInTheDocument()
    expect(screen.getByDisplayValue('/x')).toBeInTheDocument()
  })

  it('args table populates from template placeholders', async () => {
    vi.mocked(window.fs.exists).mockImplementation(async (p: string) => p === '/Users/test/.broomy/commands.json')
    vi.mocked(window.fs.readFile).mockResolvedValue(JSON.stringify({
      version: 2, actions: [{ id: 'u', label: 'L', template: '/plan {topic} --depth {depth}' }],
    }))
    render(<CommandsEditor directory="/repo" onClose={vi.fn()} />)
    fireEvent.click(await screen.findByText('L'))
    expect(screen.getByText('topic')).toBeInTheDocument()
    expect(screen.getByText('depth')).toBeInTheDocument()
    expect(screen.getAllByText(/optional/i).length).toBeGreaterThan(0)
  })

  it('Save writes the file', async () => {
    vi.mocked(window.fs.exists).mockImplementation(async (p: string) => p === '/Users/test/.broomy/commands.json')
    vi.mocked(window.fs.readFile).mockResolvedValue(JSON.stringify({
      version: 2, actions: [{ id: 'u', label: 'A', template: 't' }],
    }))
    render(<CommandsEditor directory="/repo" onClose={vi.fn()} />)
    fireEvent.click(await screen.findByText('A'))
    fireEvent.change(screen.getByDisplayValue('A'), { target: { value: 'B' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(vi.mocked(window.fs.writeFile)).toHaveBeenCalled())
  })

  it('switching to Project tab with no file shows Add CTA', async () => {
    vi.mocked(window.fs.exists).mockResolvedValue(false)
    render(<CommandsEditor directory="/repo" onClose={vi.fn()} />)
    fireEvent.click(await screen.findByRole('tab', { name: /project/i }))
    expect(screen.getByRole('button', { name: /add project commands/i })).toBeInTheDocument()
  })

  it('tab switch with dirty state shows Save/Discard/Cancel modal', async () => {
    vi.mocked(window.fs.exists).mockImplementation(async (p: string) => p === '/Users/test/.broomy/commands.json')
    vi.mocked(window.fs.readFile).mockResolvedValue(JSON.stringify({
      version: 2, actions: [{ id: 'u', label: 'A', template: '/x' }],
    }))
    render(<CommandsEditor directory="/repo" onClose={vi.fn()} />)
    // Make dirty by editing a field
    fireEvent.click(await screen.findByText('A'))
    fireEvent.change(screen.getByDisplayValue('A'), { target: { value: 'B' } })
    // Try to switch tab
    fireEvent.click(screen.getByRole('tab', { name: /project/i }))
    // Should show the modal with Discard and Cancel (Save may also be in the header)
    expect(screen.getByRole('button', { name: /^Discard$/i })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Cancel$/i })[0]).toBeInTheDocument()
    // Cancel keeps us on current tab
    fireEvent.click(screen.getAllByRole('button', { name: /^Cancel$/i })[0])
    expect(screen.getByRole('tab', { name: /user/i })).toHaveAttribute('aria-selected', 'true')
  })

  it('delete command requires two clicks', async () => {
    vi.mocked(window.fs.exists).mockImplementation(async (p: string) => p === '/Users/test/.broomy/commands.json')
    vi.mocked(window.fs.readFile).mockResolvedValue(JSON.stringify({
      version: 2, actions: [{ id: 'u', label: 'My Cmd', template: '/x' }],
    }))
    render(<CommandsEditor directory="/repo" onClose={vi.fn()} />)
    fireEvent.click(await screen.findByText('My Cmd'))
    // First click shows confirm
    fireEvent.click(screen.getByRole('button', { name: /delete command/i }))
    expect(screen.getByRole('button', { name: /confirm delete/i })).toBeInTheDocument()
    // Second click actually deletes
    fireEvent.click(screen.getByRole('button', { name: /confirm delete/i }))
    expect(screen.queryByText('My Cmd')).toBeNull()
  })

  it('save prunes stale arg metadata not in template', async () => {
    vi.mocked(window.fs.exists).mockImplementation(async (p: string) => p === '/Users/test/.broomy/commands.json')
    vi.mocked(window.fs.readFile).mockResolvedValue(JSON.stringify({
      version: 2,
      actions: [{
        id: 'u',
        label: 'A',
        template: '/x {topic}',
        args: [{ name: 'topic', description: 'desc' }, { name: 'stale', description: 'old' }],
      }],
    }))
    render(<CommandsEditor directory="/repo" onClose={vi.fn()} />)
    // Make dirty
    fireEvent.click(await screen.findByText('A'))
    fireEvent.change(screen.getByDisplayValue('A'), { target: { value: 'B' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(vi.mocked(window.fs.writeFile)).toHaveBeenCalled())
    const written = JSON.parse(vi.mocked(window.fs.writeFile).mock.calls[0][1])
    const savedArgs = written.actions[0].args
    expect(savedArgs).toHaveLength(1)
    expect(savedArgs[0].name).toBe('topic')
  })

  it('Expand link opens CommandExpandedEditor; typing updates the template', async () => {
    vi.mocked(window.fs.exists).mockImplementation(async (p: string) => p === '/Users/test/.broomy/commands.json')
    vi.mocked(window.fs.readFile).mockResolvedValue(JSON.stringify({
      version: 2, actions: [{ id: 'u', label: 'Cmd', template: '/do {thing}' }],
    }))
    render(<CommandsEditor directory="/repo" onClose={vi.fn()} />)
    fireEvent.click(await screen.findByText('Cmd'))
    // Click the Expand button
    fireEvent.click(screen.getByTestId('expand-command'))
    // The expanded editor should appear
    const textarea = screen.getByTestId('expanded-command-textarea')
    expect(textarea).toHaveValue('/do {thing}')
    // Type a new value in the expanded editor
    fireEvent.change(textarea, { target: { value: '/do {thing} --extra' } })
    // The expanded textarea itself should have the new value
    expect(textarea).toHaveValue('/do {thing} --extra')
    // Close the expanded editor, then the main input reflects the updated template
    fireEvent.click(screen.getByTestId('close-expanded-command'))
    expect(screen.getByDisplayValue('/do {thing} --extra')).toBeInTheDocument()
  })

  it('Set-stage dropdown: picking "(no change)" writes setStage: undefined', async () => {
    vi.mocked(window.fs.exists).mockImplementation(async (p: string) => p === '/Users/test/.broomy/commands.json')
    vi.mocked(window.fs.readFile).mockResolvedValue(JSON.stringify({
      version: 2, actions: [{ id: 'u', label: 'A', template: '/x', setStage: 'done' }],
    }))
    render(<CommandsEditor directory="/repo" onClose={vi.fn()} />)
    fireEvent.click(await screen.findByText('A'))
    // Pick "(no change)"
    const setStageSelect = screen.getAllByRole('combobox').find(s => {
      const opt = s.querySelector('option[value="__none"]')
      return opt !== null
    })!
    fireEvent.change(setStageSelect, { target: { value: '__none' } })
    // Save and verify setStage is not present
    fireEvent.change(screen.getByDisplayValue('A'), { target: { value: 'B' } }) // make dirty if not already
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(vi.mocked(window.fs.writeFile)).toHaveBeenCalled())
    const written = JSON.parse(vi.mocked(window.fs.writeFile).mock.calls[0][1])
    expect(written.actions[0].setStage).toBeUndefined()
  })

  it('Set-stage dropdown: picking "reset to planning" writes setStage: null', async () => {
    vi.mocked(window.fs.exists).mockImplementation(async (p: string) => p === '/Users/test/.broomy/commands.json')
    vi.mocked(window.fs.readFile).mockResolvedValue(JSON.stringify({
      version: 2, actions: [{ id: 'u', label: 'A', template: '/x', setStage: 'done' }],
    }))
    render(<CommandsEditor directory="/repo" onClose={vi.fn()} />)
    fireEvent.click(await screen.findByText('A'))
    const setStageSelect = screen.getAllByRole('combobox').find(s => {
      const opt = s.querySelector('option[value="__null"]')
      return opt !== null
    })!
    fireEvent.change(setStageSelect, { target: { value: '__null' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(vi.mocked(window.fs.writeFile)).toHaveBeenCalled())
    const written = JSON.parse(vi.mocked(window.fs.writeFile).mock.calls[0][1])
    expect(written.actions[0].setStage).toBeNull()
  })

  it('Set-stage dropdown: picking "+ New stage…" opens NewStageModal; submitting writes new stage', async () => {
    vi.mocked(window.fs.exists).mockImplementation(async (p: string) => p === '/Users/test/.broomy/commands.json')
    vi.mocked(window.fs.readFile).mockResolvedValue(JSON.stringify({
      version: 2, actions: [{ id: 'u', label: 'A', template: '/x' }],
    }))
    render(<CommandsEditor directory="/repo" onClose={vi.fn()} />)
    fireEvent.click(await screen.findByText('A'))
    const setStageSelect = screen.getAllByRole('combobox').find(s => {
      const opt = s.querySelector('option[value="__new"]')
      return opt !== null
    })!
    fireEvent.change(setStageSelect, { target: { value: '__new' } })
    // NewStageModal should appear
    expect(screen.getByTestId('new-stage-input')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('new-stage-input'), { target: { value: 'shipped' } })
    fireEvent.click(screen.getByTestId('new-stage-submit'))
    // Modal closes and value is set
    expect(screen.queryByTestId('new-stage-input')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(vi.mocked(window.fs.writeFile)).toHaveBeenCalled())
    const written = JSON.parse(vi.mocked(window.fs.writeFile).mock.calls[0][1])
    expect(written.actions[0].setStage).toBe('shipped')
  })

  it('surface checkboxes toggle correctly (add/remove from surface list)', async () => {
    vi.mocked(window.fs.exists).mockImplementation(async (p: string) => p === '/Users/test/.broomy/commands.json')
    vi.mocked(window.fs.readFile).mockResolvedValue(JSON.stringify({
      version: 2, actions: [{ id: 'u', label: 'A', template: '/x', surface: 'source-control' }],
    }))
    render(<CommandsEditor directory="/repo" onClose={vi.fn()} />)
    fireEvent.click(await screen.findByText('A'))
    // Find "Review" checkbox and check it to add
    const reviewCheckbox = screen.getByRole('checkbox', { name: /review/i })
    fireEvent.click(reviewCheckbox)
    // Now save
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(vi.mocked(window.fs.writeFile)).toHaveBeenCalled())
    const written = JSON.parse(vi.mocked(window.fs.writeFile).mock.calls[0][1])
    const surface = written.actions[0].surface
    expect(surface).toContain('review')
    expect(surface).toContain('source-control')
  })

  it('Switch tab dropdown sets switchTab value', async () => {
    vi.mocked(window.fs.exists).mockImplementation(async (p: string) => p === '/Users/test/.broomy/commands.json')
    vi.mocked(window.fs.readFile).mockResolvedValue(JSON.stringify({
      version: 2, actions: [{ id: 'u', label: 'A', template: '/x' }],
    }))
    render(<CommandsEditor directory="/repo" onClose={vi.fn()} />)
    fireEvent.click(await screen.findByText('A'))
    const switchTabSelect = screen.getAllByRole('combobox').find(s => {
      const opt = s.querySelector('option[value="review"]')
      return opt !== null
    })!
    fireEvent.change(switchTabSelect, { target: { value: 'review' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(vi.mocked(window.fs.writeFile)).toHaveBeenCalled())
    const written = JSON.parse(vi.mocked(window.fs.writeFile).mock.calls[0][1])
    expect(written.actions[0].switchTab).toBe('review')
  })
})

describe('CommandsEditor template variable picker', () => {
  async function renderWithCommand(template: string) {
    vi.mocked(window.fs.exists).mockImplementation(async (p: string) => p === '/Users/test/.broomy/commands.json')
    vi.mocked(window.fs.readFile).mockResolvedValue(JSON.stringify({
      version: 2, actions: [{ id: 'u', label: 'My Cmd', template }],
    }))
    render(<CommandsEditor directory="/repo" onClose={vi.fn()} />)
    fireEvent.click(await screen.findByText('My Cmd'))
  }

  it('opens the picker from the command field', async () => {
    await renderWithCommand('/fix now')
    fireEvent.click(screen.getByTestId('open-template-vars'))
    expect(await screen.findByRole('dialog', { name: 'Template variables' })).toBeInTheDocument()
    expect(screen.getByText('{branch}')).toBeInTheDocument()
  })

  it('inserts a variable at the caret in the command field', async () => {
    await renderWithCommand('/fix now')
    const field = screen.getByDisplayValue<HTMLInputElement>('/fix now')
    field.setSelectionRange(5, 5)
    fireEvent.click(screen.getByTestId('open-template-vars'))
    fireEvent.click(await screen.findByText('{branch}'))
    expect(await screen.findByDisplayValue('/fix {branch}now')).toBeInTheDocument()
  })

  it('inserts a variable from the expanded editor', async () => {
    await renderWithCommand('/fix now')
    fireEvent.click(screen.getByTestId('expand-command'))
    const textarea = await screen.findByTestId<HTMLTextAreaElement>('expanded-command-textarea')
    textarea.setSelectionRange(5, 5)
    fireEvent.click(await screen.findByTestId('open-template-vars-expanded'))
    fireEvent.click(await screen.findByText('{repoName}'))
    expect(await screen.findByTestId('expanded-command-textarea')).toHaveValue('/fix {repoName}now')
  })
})
