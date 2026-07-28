// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import '../../../test/react-setup'
import { RepoSettingsEditor } from './RepoSettingsEditor'
import type { ManagedRepo } from '../../../preload/index'
import type { AgentConfig } from '../../store/agents'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(window.repos.getInitScript).mockResolvedValue('')
  vi.mocked(window.repos.saveInitScript).mockResolvedValue({ success: true })
  vi.mocked(window.gh.hasWriteAccess).mockResolvedValue(true)
})

const mockRepo: ManagedRepo = {
  id: 'repo-1',
  name: 'test-repo',
  rootDir: '/Users/test/repos/test-repo',
  remoteUrl: 'https://github.com/test/test-repo.git',
  defaultBranch: 'main',
}

const mockAgents: AgentConfig[] = [
  { id: 'agent-1', name: 'Claude', command: 'claude' },
  { id: 'agent-2', name: 'Cursor', command: 'cursor' },
]

function renderEditor(overrides: Record<string, unknown> = {}) {
  const defaultProps = {
    repo: mockRepo,
    agents: mockAgents,
    onUpdate: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  }

  return render(<RepoSettingsEditor {...defaultProps} />)
}

describe('RepoSettingsEditor', () => {
  it('renders repo name and path', async () => {
    renderEditor()
    await waitFor(() => {
      expect(screen.getByText('test-repo')).toBeTruthy()
      expect(screen.getByText('/Users/test/repos/test-repo')).toBeTruthy()
    })
  })

  it('renders default agent dropdown with agents', async () => {
    renderEditor()
    await waitFor(() => {
      expect(screen.getByText('No default (ask each time)')).toBeTruthy()
      expect(screen.getByText('Claude')).toBeTruthy()
      expect(screen.getByText('Cursor')).toBeTruthy()
    })
  })

  it('renders allow merge PR checkbox', async () => {
    renderEditor()
    await waitFor(() => {
      expect(screen.getByText('Allow "Merge PR" button')).toBeTruthy()
    })
  })

  it('loads init script on mount', async () => {
    vi.mocked(window.repos.getInitScript).mockResolvedValue('echo hello')
    renderEditor()
    await waitFor(() => {
      expect(screen.getByDisplayValue('echo hello')).toBeTruthy()
    })
    expect(window.repos.getInitScript).toHaveBeenCalledWith('repo-1')
  })

  it('shows loading state while script is loading', () => {
    // Make getInitScript never resolve immediately
    vi.mocked(window.repos.getInitScript).mockReturnValue(new Promise(() => {}))
    renderEditor()
    expect(screen.getByText('Loading...')).toBeTruthy()
  })

  it('calls onUpdate and onClose when Save is clicked', async () => {
    const onUpdate = vi.fn()
    const onClose = vi.fn()
    renderEditor({ onUpdate, onClose })
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).toBeNull()
    })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith({ defaultAgentId: undefined, allowApproveAndMerge: true, isolated: undefined, skipApproval: undefined, approvalPolicy: 'one' })
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('calls onClose when Cancel is clicked', async () => {
    const onClose = vi.fn()
    renderEditor({ onClose })
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).toBeNull()
    })
    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalled()
  })

  it('saves init script when Save is clicked', async () => {
    vi.mocked(window.repos.getInitScript).mockResolvedValue('old script')
    renderEditor()
    await waitFor(() => {
      expect(screen.getByDisplayValue('old script')).toBeTruthy()
    })
    fireEvent.change(screen.getByDisplayValue('old script'), { target: { value: 'new script' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => {
      expect(window.repos.saveInitScript).toHaveBeenCalledWith('repo-1', 'new script')
    })
  })

  it('saves selected default agent', async () => {
    const onUpdate = vi.fn()
    renderEditor({ onUpdate })
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).toBeNull()
    })
    // First combobox is the Default Agent select (the approvalPolicy select is second).
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'agent-1' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith({ defaultAgentId: 'agent-1', allowApproveAndMerge: true, isolated: undefined, skipApproval: undefined, approvalPolicy: 'one' })
    })
  })

  it('shows error when write access check fails for merge', async () => {
    vi.mocked(window.gh.hasWriteAccess).mockResolvedValue(false)
    renderEditor()
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).toBeNull()
    })
    const checkboxes = screen.getAllByRole('checkbox')
    // Checkbox defaults to checked; uncheck first, then re-check to trigger write access validation
    fireEvent.click(checkboxes[0])
    fireEvent.click(checkboxes[0])
    await waitFor(() => {
      expect(screen.getByText(/Write access check failed/)).toBeTruthy()
    })
  })

  it('shows error when write access check throws', async () => {
    vi.mocked(window.gh.hasWriteAccess).mockRejectedValue(new Error('gh not found'))
    renderEditor()
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).toBeNull()
    })
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])
    fireEvent.click(checkboxes[0])
    await waitFor(() => {
      expect(screen.getByText(/Could not check write access/)).toBeTruthy()
    })
  })

  it('enables merge when write access is confirmed', async () => {
    vi.mocked(window.gh.hasWriteAccess).mockResolvedValue(true)
    // Start with allowApproveAndMerge explicitly false so clicking checks it
    renderEditor({ repo: { ...mockRepo, allowApproveAndMerge: false } })
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).toBeNull()
    })
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])
    await waitFor(() => {
      expect(checkboxes[0]).toBeChecked()
    })
  })

  it('sets default agent from repo prop', async () => {
    renderEditor({
      repo: { ...mockRepo, defaultAgentId: 'agent-2' },
    })
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).toBeNull()
    })
    const select = screen.getAllByRole('combobox')[0]
    expect((select as HTMLSelectElement).value).toBe('agent-2')
  })

  it('reflects and saves the approval policy select', async () => {
    const onUpdate = vi.fn()
    renderEditor({ onUpdate, repo: { ...mockRepo, approvalPolicy: 'all' } })
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).toBeNull()
    })
    // Second combobox is the approvalPolicy select; it should reflect the repo value.
    const policySelect = screen.getAllByRole('combobox')[1] as HTMLSelectElement
    expect(policySelect.value).toBe('all')
    fireEvent.change(policySelect, { target: { value: 'one' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ approvalPolicy: 'one' }))
    })
  })

  it('renders isolation checkboxes', async () => {
    renderEditor()
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).toBeNull()
    })
    expect(screen.getByText('Run agent in isolated container')).toBeTruthy()
    expect(screen.getByText('Auto-approve agent commands')).toBeTruthy()
  })

  it('shows warning when skip-approval is on without isolation', async () => {
    renderEditor({ repo: { ...mockRepo, skipApproval: true } })
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).toBeNull()
    })
    expect(screen.getByText(/Auto-approving without container isolation/)).toBeTruthy()
  })

  it('saves isolation fields', async () => {
    const onUpdate = vi.fn()
    renderEditor({ onUpdate, repo: { ...mockRepo, isolated: true, skipApproval: true } })
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).toBeNull()
    })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
        isolated: true,
        skipApproval: true,
      }))
    })
  })

  it('toggles skip-approval and shows warning without isolation', async () => {
    renderEditor()
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).toBeNull()
    })
    const checkboxes = screen.getAllByRole('checkbox')
    // skip-approval checkbox is third
    const skipApprovalCheckbox = checkboxes[2]
    fireEvent.click(skipApprovalCheckbox)
    await waitFor(() => {
      expect(screen.getByText(/Auto-approving without container isolation/)).toBeTruthy()
    })
  })

  it('shows Saving... text while save is in progress', async () => {
    vi.mocked(window.repos.saveInitScript).mockReturnValue(new Promise(() => {}))
    renderEditor()
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).toBeNull()
    })
    fireEvent.click(screen.getByText('Save'))
    expect(screen.getByText('Saving...')).toBeTruthy()
  })
})

describe('RepoSettingsEditor template variables', () => {
  it('inserts the $BROOMY_ form into the init script', async () => {
    render(<RepoSettingsEditor repo={mockRepo} agents={[]} onUpdate={vi.fn()} onClose={vi.fn()} />)
    const textarea = await screen.findByPlaceholderText(/Commands to run when starting a session/)
    fireEvent.change(textarea, { target: { value: 'echo ' } })
    ;(textarea as HTMLTextAreaElement).setSelectionRange(5, 5)
    fireEvent.click(screen.getByTestId('open-template-vars-init-script'))
    fireEvent.click(await screen.findByText('$BROOMY_BRANCH'))
    expect(textarea).toHaveValue('echo $BROOMY_BRANCH')
  })

  it('dims variables that are not set when the init script runs', async () => {
    render(<RepoSettingsEditor repo={mockRepo} agents={[]} onUpdate={vi.fn()} onClose={vi.fn()} />)
    await screen.findByPlaceholderText(/Commands to run when starting a session/)
    fireEvent.click(screen.getByTestId('open-template-vars-init-script'))
    expect(await screen.findByText('$BROOMY_PR_TITLE')).toBeInTheDocument()
    expect(screen.getAllByText('not set when the init script runs').length).toBeGreaterThan(0)
  })
})
