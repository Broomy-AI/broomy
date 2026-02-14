// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import '../../test/react-setup'
import { RepoSettingsEditor } from './RepoSettingsEditor'
import type { ManagedRepo } from '../../preload/index'
import type { AgentConfig } from '../store/agents'

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

  it('renders allow push to main checkbox', async () => {
    renderEditor()
    await waitFor(() => {
      expect(screen.getByText('Allow "Push to main" button')).toBeTruthy()
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
      expect(onUpdate).toHaveBeenCalledWith({ defaultAgentId: undefined, allowPushToMain: false })
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
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'agent-1' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith({ defaultAgentId: 'agent-1', allowPushToMain: false })
    })
  })

  it('shows error when write access check fails for push to main', async () => {
    vi.mocked(window.gh.hasWriteAccess).mockResolvedValue(false)
    renderEditor()
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).toBeNull()
    })
    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)
    await waitFor(() => {
      expect(screen.getByText('Write access check failed')).toBeTruthy()
    })
  })

  it('shows error when write access check throws', async () => {
    vi.mocked(window.gh.hasWriteAccess).mockRejectedValue(new Error('gh not found'))
    renderEditor()
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).toBeNull()
    })
    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)
    await waitFor(() => {
      expect(screen.getByText('Failed to check write access')).toBeTruthy()
    })
  })

  it('enables push to main when write access is confirmed', async () => {
    vi.mocked(window.gh.hasWriteAccess).mockResolvedValue(true)
    renderEditor()
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).toBeNull()
    })
    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)
    await waitFor(() => {
      expect(checkbox).toBeChecked()
    })
  })

  it('dismisses error when x button is clicked', async () => {
    vi.mocked(window.gh.hasWriteAccess).mockResolvedValue(false)
    renderEditor()
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).toBeNull()
    })
    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)
    await waitFor(() => {
      expect(screen.getByText('Write access check failed')).toBeTruthy()
    })
    // Click the dismiss button
    fireEvent.click(screen.getByTitle('Dismiss'))
    expect(screen.queryByText('Write access check failed')).toBeNull()
  })

  it('shows error details popup when error banner is clicked', async () => {
    vi.mocked(window.gh.hasWriteAccess).mockResolvedValue(false)
    renderEditor()
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).toBeNull()
    })
    fireEvent.click(screen.getByRole('checkbox'))
    await waitFor(() => {
      expect(screen.getByText('Write access check failed')).toBeTruthy()
    })
    // Click the error banner (not the dismiss button)
    fireEvent.click(screen.getByTitle('Click to view full error'))
    expect(screen.getByText('Error Details')).toBeTruthy()
  })

  it('sets default agent from repo prop', async () => {
    renderEditor({
      repo: { ...mockRepo, defaultAgentId: 'agent-2' },
    })
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).toBeNull()
    })
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.value).toBe('agent-2')
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
