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
      <button data-testid="agent-tab-show-add-form" onClick={props.onShowAddForm as () => void}>Show Add</button>
      <button data-testid="agent-tab-cancel" onClick={props.onCancel as () => void}>Cancel</button>
    </div>
  ),
}))

vi.mock('./AgentSettingsRepoTab', () => ({
  AgentSettingsRepoTab: (props: Record<string, unknown>) => (
    <div data-testid="repo-tab">
      <span data-testid="repo-tab-editing-id">{String(props.editingRepoId ?? '')}</span>
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
  it('renders the Settings header', () => {
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

  it('renders the General section with default repo folder', () => {
    render(<AgentSettings onClose={vi.fn()} />)
    expect(screen.getByText('General')).toBeTruthy()
    expect(screen.getByText('Default Repo Folder')).toBeTruthy()
    expect(screen.getByText('/Users/test/repos')).toBeTruthy()
  })

  it('shows ~/repos when defaultCloneDir is empty', () => {
    useRepoStore.setState({ defaultCloneDir: '' })
    render(<AgentSettings onClose={vi.fn()} />)
    expect(screen.getByText('~/repos')).toBeTruthy()
  })

  it('renders Browse button that opens folder dialog', async () => {
    vi.mocked(window.dialog.openFolder).mockResolvedValue('/new/folder')
    render(<AgentSettings onClose={vi.fn()} />)
    const browseButton = screen.getByText('Browse')
    fireEvent.click(browseButton)
    expect(window.dialog.openFolder).toHaveBeenCalled()
  })

  it('renders the AgentSettingsAgentTab', () => {
    render(<AgentSettings onClose={vi.fn()} />)
    expect(screen.getByTestId('agent-tab')).toBeTruthy()
  })

  it('renders the AgentSettingsRepoTab', () => {
    render(<AgentSettings onClose={vi.fn()} />)
    expect(screen.getByTestId('repo-tab')).toBeTruthy()
  })

  it('passes showAddForm=false initially', () => {
    render(<AgentSettings onClose={vi.fn()} />)
    expect(screen.getByTestId('agent-tab-show-add').textContent).toBe('false')
  })

  it('sets showAddForm=true when onShowAddForm is called', () => {
    render(<AgentSettings onClose={vi.fn()} />)
    fireEvent.click(screen.getByTestId('agent-tab-show-add-form'))
    expect(screen.getByTestId('agent-tab-show-add').textContent).toBe('true')
  })

  it('resets showAddForm when cancel is called', () => {
    render(<AgentSettings onClose={vi.fn()} />)
    fireEvent.click(screen.getByTestId('agent-tab-show-add-form'))
    expect(screen.getByTestId('agent-tab-show-add').textContent).toBe('true')
    fireEvent.click(screen.getByTestId('agent-tab-cancel'))
    expect(screen.getByTestId('agent-tab-show-add').textContent).toBe('false')
  })
})
