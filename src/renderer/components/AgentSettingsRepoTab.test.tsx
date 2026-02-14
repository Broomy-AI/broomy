// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../test/react-setup'
import { AgentSettingsRepoTab } from './AgentSettingsRepoTab'
import type { AgentConfig } from '../store/agents'
import type { ManagedRepo } from '../../preload/index'

// Mock RepoSettingsEditor to keep tests focused
vi.mock('./RepoSettingsEditor', () => ({
  RepoSettingsEditor: (props: { repo: ManagedRepo; onClose: () => void }) => (
    <div data-testid="repo-editor">
      <span data-testid="repo-editor-name">{props.repo.name}</span>
      <button data-testid="repo-editor-close" onClick={props.onClose}>Close Editor</button>
    </div>
  ),
}))

afterEach(() => {
  cleanup()
})

const mockAgents: AgentConfig[] = [
  { id: 'agent-1', name: 'Claude', command: 'claude' },
  { id: 'agent-2', name: 'Codex', command: 'codex' },
]

const mockRepos: ManagedRepo[] = [
  { id: 'repo-1', name: 'my-app', remoteUrl: 'https://github.com/user/my-app', rootDir: '/Users/test/repos/my-app', defaultBranch: 'main', defaultAgentId: 'agent-1' },
  { id: 'repo-2', name: 'other-repo', remoteUrl: 'https://github.com/user/other-repo', rootDir: '/Users/test/repos/other-repo', defaultBranch: 'main' },
]

const defaultProps = {
  repos: mockRepos,
  agents: mockAgents,
  editingRepoId: null as string | null,
  onEditRepo: vi.fn(),
  onUpdateRepo: vi.fn(),
  onCloseRepoEditor: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AgentSettingsRepoTab', () => {
  it('renders null when repos is empty', () => {
    const { container } = render(<AgentSettingsRepoTab {...defaultProps} repos={[]} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders Repositories header', () => {
    render(<AgentSettingsRepoTab {...defaultProps} />)
    expect(screen.getByText('Repositories')).toBeTruthy()
  })

  it('renders repo names and root directories', () => {
    render(<AgentSettingsRepoTab {...defaultProps} />)
    expect(screen.getByText('my-app')).toBeTruthy()
    expect(screen.getByText('/Users/test/repos/my-app')).toBeTruthy()
    expect(screen.getByText('other-repo')).toBeTruthy()
    expect(screen.getByText('/Users/test/repos/other-repo')).toBeTruthy()
  })

  it('shows default agent name when repo has defaultAgentId', () => {
    render(<AgentSettingsRepoTab {...defaultProps} />)
    expect(screen.getByText('Default: Claude')).toBeTruthy()
  })

  it('shows "Unknown" when default agent is not found', () => {
    const reposWithUnknownAgent: ManagedRepo[] = [
      { id: 'repo-1', name: 'my-app', remoteUrl: '', rootDir: '/test', defaultBranch: 'main', defaultAgentId: 'nonexistent' },
    ]
    render(<AgentSettingsRepoTab {...defaultProps} repos={reposWithUnknownAgent} />)
    expect(screen.getByText('Default: Unknown')).toBeTruthy()
  })

  it('calls onEditRepo when settings button is clicked', () => {
    render(<AgentSettingsRepoTab {...defaultProps} />)
    const editButtons = screen.getAllByTitle('Edit repo settings')
    fireEvent.click(editButtons[0])
    expect(defaultProps.onEditRepo).toHaveBeenCalledWith('repo-1')
  })

  it('shows RepoSettingsEditor when editingRepoId matches', () => {
    render(<AgentSettingsRepoTab {...defaultProps} editingRepoId="repo-1" />)
    expect(screen.getByTestId('repo-editor')).toBeTruthy()
    expect(screen.getByTestId('repo-editor-name').textContent).toBe('my-app')
  })

  it('calls onCloseRepoEditor when editor close is clicked', () => {
    render(<AgentSettingsRepoTab {...defaultProps} editingRepoId="repo-1" />)
    fireEvent.click(screen.getByTestId('repo-editor-close'))
    expect(defaultProps.onCloseRepoEditor).toHaveBeenCalledOnce()
  })

  it('still renders non-editing repos normally alongside the editor', () => {
    render(<AgentSettingsRepoTab {...defaultProps} editingRepoId="repo-1" />)
    // repo-2 is not being edited so should show normally
    expect(screen.getByText('other-repo')).toBeTruthy()
  })
})
