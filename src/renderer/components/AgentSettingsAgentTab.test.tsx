// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../test/react-setup'
import { AgentSettingsAgentTab } from './AgentSettingsAgentTab'
import type { AgentConfig } from '../store/agents'
import { createRef } from 'react'
import type { EnvVarEditorRef } from './EnvVarEditor'

// Mock EnvVarEditor since it's a complex sub-component
vi.mock('./EnvVarEditor', () => ({
  EnvVarEditor: vi.fn(() => <div data-testid="env-editor">EnvVarEditor</div>),
}))

afterEach(() => {
  cleanup()
})

const mockAgents: AgentConfig[] = [
  { id: 'agent-1', name: 'Claude', command: 'claude', color: '#D97757' },
  { id: 'agent-2', name: 'Codex', command: 'codex' },
]

const defaultProps = {
  agents: mockAgents,
  editingId: null as string | null,
  showAddForm: false,
  name: '',
  command: '',
  color: '',
  env: {} as Record<string, string>,
  envEditorRef: createRef<EnvVarEditorRef>(),
  onNameChange: vi.fn(),
  onCommandChange: vi.fn(),
  onColorChange: vi.fn(),
  onEnvChange: vi.fn(),
  onEdit: vi.fn(),
  onUpdate: vi.fn(),
  onDelete: vi.fn(),
  onAdd: vi.fn(),
  onShowAddForm: vi.fn(),
  onCancel: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AgentSettingsAgentTab', () => {
  it('renders agent list with names and commands', () => {
    render(<AgentSettingsAgentTab {...defaultProps} />)
    expect(screen.getByText('Agents')).toBeTruthy()
    expect(screen.getByText('Claude')).toBeTruthy()
    expect(screen.getByText('claude')).toBeTruthy()
    expect(screen.getByText('Codex')).toBeTruthy()
    expect(screen.getByText('codex')).toBeTruthy()
  })

  it('renders color dot for agents with color', () => {
    const { container } = render(<AgentSettingsAgentTab {...defaultProps} />)
    const colorDot = container.querySelector('[style*="background-color"]')
    expect(colorDot).toBeTruthy()
    expect((colorDot as HTMLElement).style.backgroundColor).toBe('rgb(217, 119, 87)')
  })

  it('shows empty state when no agents', () => {
    render(<AgentSettingsAgentTab {...defaultProps} agents={[]} />)
    expect(screen.getByText(/No agents configured/)).toBeTruthy()
    expect(screen.getByText(/Add one to get started/)).toBeTruthy()
  })

  it('does not show empty state when showAddForm is true', () => {
    render(<AgentSettingsAgentTab {...defaultProps} agents={[]} showAddForm={true} />)
    expect(screen.queryByText('No agents configured.')).toBeNull()
  })

  it('shows "+ Add Agent" button when not editing and not adding', () => {
    render(<AgentSettingsAgentTab {...defaultProps} />)
    const addButton = screen.getByText('+ Add Agent')
    expect(addButton).toBeTruthy()
    fireEvent.click(addButton)
    expect(defaultProps.onShowAddForm).toHaveBeenCalledOnce()
  })

  it('hides "+ Add Agent" button when showAddForm is true', () => {
    render(<AgentSettingsAgentTab {...defaultProps} showAddForm={true} />)
    expect(screen.queryByText('+ Add Agent')).toBeNull()
  })

  it('hides "+ Add Agent" button when editing an agent', () => {
    render(<AgentSettingsAgentTab {...defaultProps} editingId="agent-1" />)
    expect(screen.queryByText('+ Add Agent')).toBeNull()
  })

  it('shows add form with input fields when showAddForm is true', () => {
    render(<AgentSettingsAgentTab {...defaultProps} showAddForm={true} />)
    expect(screen.getByPlaceholderText('Agent name')).toBeTruthy()
    expect(screen.getByPlaceholderText('Command (e.g., claude)')).toBeTruthy()
    expect(screen.getByPlaceholderText('Color (optional, e.g., #4a9eff)')).toBeTruthy()
    expect(screen.getByText('Add Agent')).toBeTruthy()
    expect(screen.getByText('Cancel')).toBeTruthy()
  })

  it('calls onAdd when Add Agent button is clicked', () => {
    render(<AgentSettingsAgentTab {...defaultProps} showAddForm={true} name="Test" command="test" />)
    fireEvent.click(screen.getByText('Add Agent'))
    expect(defaultProps.onAdd).toHaveBeenCalledOnce()
  })

  it('disables Add Agent button when name or command is empty', () => {
    render(<AgentSettingsAgentTab {...defaultProps} showAddForm={true} name="" command="" />)
    const addButton = screen.getByText('Add Agent')
    expect(addButton).toHaveProperty('disabled', true)
  })

  it('calls onCancel when Cancel is clicked in add form', () => {
    render(<AgentSettingsAgentTab {...defaultProps} showAddForm={true} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(defaultProps.onCancel).toHaveBeenCalledOnce()
  })

  it('calls onEdit when edit button is clicked', () => {
    render(<AgentSettingsAgentTab {...defaultProps} />)
    const editButtons = screen.getAllByTitle('Edit agent')
    fireEvent.click(editButtons[0])
    expect(defaultProps.onEdit).toHaveBeenCalledWith(mockAgents[0])
  })

  it('calls onDelete when delete button is clicked', () => {
    render(<AgentSettingsAgentTab {...defaultProps} />)
    const deleteButtons = screen.getAllByTitle('Delete agent')
    fireEvent.click(deleteButtons[0])
    expect(defaultProps.onDelete).toHaveBeenCalledWith('agent-1')
  })

  it('shows edit form when editingId matches an agent', () => {
    render(
      <AgentSettingsAgentTab
        {...defaultProps}
        editingId="agent-1"
        name="Claude"
        command="claude"
      />,
    )
    // Should show Save and Cancel in edit mode
    expect(screen.getByText('Save')).toBeTruthy()
    expect(screen.getByText('Cancel')).toBeTruthy()
  })

  it('calls onUpdate when Save is clicked in edit form', () => {
    render(
      <AgentSettingsAgentTab
        {...defaultProps}
        editingId="agent-1"
        name="Claude Updated"
        command="claude"
      />,
    )
    fireEvent.click(screen.getByText('Save'))
    expect(defaultProps.onUpdate).toHaveBeenCalledOnce()
  })

  it('fires onNameChange when name input changes in add form', () => {
    render(<AgentSettingsAgentTab {...defaultProps} showAddForm={true} />)
    const nameInput = screen.getByPlaceholderText('Agent name')
    fireEvent.change(nameInput, { target: { value: 'NewAgent' } })
    expect(defaultProps.onNameChange).toHaveBeenCalledWith('NewAgent')
  })

  it('fires onCommandChange when command input changes in add form', () => {
    render(<AgentSettingsAgentTab {...defaultProps} showAddForm={true} />)
    const commandInput = screen.getByPlaceholderText('Command (e.g., claude)')
    fireEvent.change(commandInput, { target: { value: 'new-cmd' } })
    expect(defaultProps.onCommandChange).toHaveBeenCalledWith('new-cmd')
  })
})
