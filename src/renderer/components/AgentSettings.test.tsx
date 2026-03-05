// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../test/react-setup'
import AgentSettings from './AgentSettings'
import { useAgentStore } from '../store/agents'
import { useRepoStore } from '../store/repos'

// Mock child components to keep tests focused on AgentSettings itself
vi.mock('./AgentSettingsAgentTab', () => ({
  AgentSettingsAgentTab: (props: Record<string, unknown>) => (
    <div data-testid="agent-tab">
      <span data-testid="agent-tab-editing-id">{String(props.editingId ?? '')}</span>
      <span data-testid="agent-tab-show-add">{String(props.showAddForm)}</span>
      <span data-testid="agent-tab-name">{String(props.name ?? '')}</span>
      <span data-testid="agent-tab-command">{String(props.command ?? '')}</span>
      <span data-testid="agent-tab-skip-flag">{String(props.skipApprovalFlag ?? '')}</span>
      <button data-testid="agent-tab-show-add-form" onClick={props.onShowAddForm as () => void}>Show Add</button>
      <button data-testid="agent-tab-cancel" onClick={props.onCancel as () => void}>Cancel</button>
      <button data-testid="agent-tab-add" onClick={props.onAdd as () => void}>Add</button>
      <button data-testid="agent-tab-update" onClick={props.onUpdate as () => void}>Update</button>
      <button data-testid="agent-tab-edit" onClick={() => (props.onEdit as (a: Record<string, unknown>) => void)({ id: 'agent-1', name: 'Claude', command: 'claude', skipApprovalFlag: '--flag' })}>Edit</button>
      <button data-testid="agent-tab-delete" onClick={() => (props.onDelete as (id: string) => void)('agent-1')}>Delete</button>
      <input data-testid="agent-tab-name-input" onChange={(e) => (props.onNameChange as (v: string) => void)(e.target.value)} />
      <input data-testid="agent-tab-cmd-input" onChange={(e) => (props.onCommandChange as (v: string) => void)(e.target.value)} />
      <input data-testid="agent-tab-flag-input" onChange={(e) => (props.onSkipApprovalFlagChange as (v: string) => void)(e.target.value)} />
    </div>
  ),
}))

vi.mock('./SettingsRootScreen', () => ({
  SettingsRootScreen: (props: Record<string, unknown>) => (
    <div data-testid="root-screen">
      <button data-testid="nav-agents" onClick={props.onNavigateToAgents as () => void}>Agents</button>
      <button data-testid="nav-repo" onClick={() => (props.onNavigateToRepo as (id: string) => void)('repo-1')}>Repo</button>
    </div>
  ),
}))

vi.mock('./SettingsRepoScreen', () => ({
  SettingsRepoScreen: (props: Record<string, unknown>) => (
    <div data-testid="repo-screen">
      <span data-testid="repo-screen-id">{(props.repo as { id: string })?.id}</span>
    </div>
  ),
}))

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
  useAgentStore.setState({
    agents: [],
    isLoading: false,
  })
  useRepoStore.setState({
    repos: [],
    defaultCloneDir: '/Users/test/repos',
  })
})

describe('AgentSettings', () => {
  it('renders the Settings header on root screen', () => {
    render(<AgentSettings onClose={vi.fn()} />)
    expect(screen.getByText('Settings')).toBeTruthy()
  })

  it('renders close button and calls onClose when clicked', () => {
    const onClose = vi.fn()
    render(<AgentSettings onClose={onClose} />)
    const closeButton = screen.getByTitle('Close settings')
    fireEvent.click(closeButton)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('renders the root screen by default', () => {
    render(<AgentSettings onClose={vi.fn()} />)
    expect(screen.getByTestId('root-screen')).toBeTruthy()
  })

  it('does not show back button on root screen', () => {
    render(<AgentSettings onClose={vi.fn()} />)
    expect(screen.queryByTestId('settings-back')).toBeNull()
  })

  it('navigates to agents screen and shows back button', () => {
    render(<AgentSettings onClose={vi.fn()} />)
    fireEvent.click(screen.getByTestId('nav-agents'))
    expect(screen.getByTestId('agent-tab')).toBeTruthy()
    expect(screen.getByText('Agents')).toBeTruthy()
    expect(screen.getByTestId('settings-back')).toBeTruthy()
  })

  it('navigates back from agents to root', () => {
    render(<AgentSettings onClose={vi.fn()} />)
    fireEvent.click(screen.getByTestId('nav-agents'))
    expect(screen.getByTestId('agent-tab')).toBeTruthy()
    fireEvent.click(screen.getByTestId('settings-back'))
    expect(screen.getByTestId('root-screen')).toBeTruthy()
    expect(screen.getByText('Settings')).toBeTruthy()
  })

  it('navigates to repo screen', () => {
    useRepoStore.setState({
      repos: [{ id: 'repo-1', name: 'My Repo', rootDir: '/path/repo', defaultBranch: 'main' }],
    } as unknown as Record<string, unknown>)
    render(<AgentSettings onClose={vi.fn()} />)
    fireEvent.click(screen.getByTestId('nav-repo'))
    expect(screen.getByTestId('repo-screen')).toBeTruthy()
    expect(screen.getByTestId('repo-screen-id').textContent).toBe('repo-1')
    expect(screen.getByText('My Repo')).toBeTruthy()
  })

  it('resets form state when navigating away from agents', () => {
    useAgentStore.setState({
      agents: [{ id: 'agent-1', name: 'Claude', command: 'claude', skipApprovalFlag: '--flag' }],
    } as unknown as Record<string, unknown>)
    render(<AgentSettings onClose={vi.fn()} />)
    // Navigate to agents and start editing
    fireEvent.click(screen.getByTestId('nav-agents'))
    fireEvent.click(screen.getByTestId('agent-tab-edit'))
    expect(screen.getByTestId('agent-tab-editing-id').textContent).toBe('agent-1')
    // Navigate back — should reset
    fireEvent.click(screen.getByTestId('settings-back'))
    // Navigate to agents again — form should be clean
    fireEvent.click(screen.getByTestId('nav-agents'))
    expect(screen.getByTestId('agent-tab-editing-id').textContent).toBe('')
    expect(screen.getByTestId('agent-tab-show-add').textContent).toBe('false')
  })

  describe('agents screen', () => {
    function navigateToAgents() {
      render(<AgentSettings onClose={vi.fn()} />)
      fireEvent.click(screen.getByTestId('nav-agents'))
    }

    it('passes showAddForm=false initially', () => {
      navigateToAgents()
      expect(screen.getByTestId('agent-tab-show-add').textContent).toBe('false')
    })

    it('sets showAddForm=true when onShowAddForm is called', () => {
      navigateToAgents()
      fireEvent.click(screen.getByTestId('agent-tab-show-add-form'))
      expect(screen.getByTestId('agent-tab-show-add').textContent).toBe('true')
    })

    it('resets showAddForm when cancel is called', () => {
      navigateToAgents()
      fireEvent.click(screen.getByTestId('agent-tab-show-add-form'))
      expect(screen.getByTestId('agent-tab-show-add').textContent).toBe('true')
      fireEvent.click(screen.getByTestId('agent-tab-cancel'))
      expect(screen.getByTestId('agent-tab-show-add').textContent).toBe('false')
    })

    it('calls addAgent when onAdd is triggered with valid form data', () => {
      const addAgent = vi.fn()
      useAgentStore.setState({ agents: [], addAgent } as unknown as Record<string, unknown>)
      navigateToAgents()
      fireEvent.change(screen.getByTestId('agent-tab-name-input'), { target: { value: 'New Agent' } })
      fireEvent.change(screen.getByTestId('agent-tab-cmd-input'), { target: { value: 'new-agent' } })
      fireEvent.change(screen.getByTestId('agent-tab-flag-input'), { target: { value: '--auto' } })
      fireEvent.click(screen.getByTestId('agent-tab-add'))
      expect(addAgent).toHaveBeenCalledWith(expect.objectContaining({
        name: 'New Agent',
        command: 'new-agent',
        skipApprovalFlag: '--auto',
      }))
    })

    it('does not call addAgent when name is empty', () => {
      const addAgent = vi.fn()
      useAgentStore.setState({ agents: [], addAgent } as unknown as Record<string, unknown>)
      navigateToAgents()
      fireEvent.click(screen.getByTestId('agent-tab-add'))
      expect(addAgent).not.toHaveBeenCalled()
    })

    it('sets form state when onEdit is triggered', () => {
      useAgentStore.setState({
        agents: [{ id: 'agent-1', name: 'Claude', command: 'claude', skipApprovalFlag: '--flag' }],
      } as unknown as Record<string, unknown>)
      navigateToAgents()
      fireEvent.click(screen.getByTestId('agent-tab-edit'))
      expect(screen.getByTestId('agent-tab-editing-id').textContent).toBe('agent-1')
      expect(screen.getByTestId('agent-tab-name').textContent).toBe('Claude')
      expect(screen.getByTestId('agent-tab-command').textContent).toBe('claude')
      expect(screen.getByTestId('agent-tab-skip-flag').textContent).toBe('--flag')
    })

    it('calls updateAgent when onUpdate is triggered', () => {
      const updateAgent = vi.fn()
      useAgentStore.setState({
        agents: [{ id: 'agent-1', name: 'Claude', command: 'claude' }],
        updateAgent,
      } as unknown as Record<string, unknown>)
      navigateToAgents()
      fireEvent.click(screen.getByTestId('agent-tab-edit'))
      fireEvent.click(screen.getByTestId('agent-tab-update'))
      expect(updateAgent).toHaveBeenCalledWith('agent-1', expect.objectContaining({
        name: 'Claude',
        command: 'claude',
      }))
    })

    it('calls removeAgent when onDelete is triggered', () => {
      const removeAgent = vi.fn()
      useAgentStore.setState({
        agents: [{ id: 'agent-1', name: 'Claude', command: 'claude' }],
        removeAgent,
      } as unknown as Record<string, unknown>)
      navigateToAgents()
      fireEvent.click(screen.getByTestId('agent-tab-delete'))
      expect(removeAgent).toHaveBeenCalledWith('agent-1')
    })

    it('resets editing when deleting the agent being edited', () => {
      const removeAgent = vi.fn()
      useAgentStore.setState({
        agents: [{ id: 'agent-1', name: 'Claude', command: 'claude' }],
        removeAgent,
      } as unknown as Record<string, unknown>)
      navigateToAgents()
      fireEvent.click(screen.getByTestId('agent-tab-edit'))
      expect(screen.getByTestId('agent-tab-editing-id').textContent).toBe('agent-1')
      fireEvent.click(screen.getByTestId('agent-tab-delete'))
      expect(screen.getByTestId('agent-tab-editing-id').textContent).toBe('')
    })
  })
})
