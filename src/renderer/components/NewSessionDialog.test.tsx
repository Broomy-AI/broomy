// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../test/react-setup'
import { NewSessionDialog } from './NewSessionDialog'
import { useRepoStore } from '../store/repos'

// Mock all the sub-views to isolate NewSessionDialog's routing logic
const mockRepo = { id: 'r1', name: 'test-repo', remoteUrl: '', rootDir: '/repos/test-repo', defaultBranch: 'main' }

vi.mock('./newSession/HomeView', () => ({
  HomeView: (props: Record<string, unknown>) => (
    <div data-testid="home-view">
      <button data-testid="clone-btn" onClick={props.onClone as () => void}>Clone</button>
      <button data-testid="add-repo-btn" onClick={props.onAddExistingRepo as () => void}>Add Repo</button>
      <button data-testid="open-folder-btn" onClick={props.onOpenFolder as () => void}>Open Folder</button>
      <button data-testid="cancel-btn" onClick={props.onCancel as () => void}>Cancel</button>
      <button data-testid="new-branch-btn" onClick={() => (props.onNewBranch as (r: unknown) => void)(mockRepo)}>New Branch</button>
      <button data-testid="existing-branch-btn" onClick={() => (props.onExistingBranch as (r: unknown) => void)(mockRepo)}>Existing Branch</button>
      <button data-testid="repo-settings-btn" onClick={() => (props.onRepoSettings as (r: unknown) => void)(mockRepo)}>Repo Settings</button>
      <button data-testid="issues-btn" onClick={() => (props.onIssues as (r: unknown) => void)(mockRepo)}>Issues</button>
      <button data-testid="review-prs-btn" onClick={() => (props.onReviewPrs as (r: unknown) => void)(mockRepo)}>Review PRs</button>
      <button data-testid="open-main-btn" onClick={() => (props.onOpenMain as (r: unknown) => void)(mockRepo)}>Open Main</button>
    </div>
  ),
}))

vi.mock('./newSession/CloneView', () => ({
  CloneView: (props: Record<string, unknown>) => (
    <div data-testid="clone-view">
      <button data-testid="clone-back" onClick={props.onBack as () => void}>Back</button>
    </div>
  ),
}))

vi.mock('./newSession/AddExistingRepoView', () => ({
  AddExistingRepoView: (props: Record<string, unknown>) => (
    <div data-testid="add-existing-view">
      <button data-testid="add-existing-back" onClick={props.onBack as () => void}>Back</button>
    </div>
  ),
}))

vi.mock('./newSession/NewBranchView', () => ({
  NewBranchView: (props: Record<string, unknown>) => (
    <div data-testid="new-branch-view">
      <button data-testid="new-branch-back" onClick={props.onBack as () => void}>Back</button>
    </div>
  ),
}))

vi.mock('./newSession/ExistingBranchView', () => ({
  ExistingBranchView: (props: Record<string, unknown>) => (
    <div data-testid="existing-branch-view">
      <button data-testid="existing-branch-back" onClick={props.onBack as () => void}>Back</button>
    </div>
  ),
}))

vi.mock('./newSession/RepoSettingsView', () => ({
  RepoSettingsView: (props: Record<string, unknown>) => (
    <div data-testid="repo-settings-view">
      <button data-testid="repo-settings-back" onClick={props.onBack as () => void}>Back</button>
    </div>
  ),
}))

vi.mock('./newSession/IssuesView', () => ({
  IssuesView: (props: Record<string, unknown>) => (
    <div data-testid="issues-view">
      <button data-testid="issues-back" onClick={props.onBack as () => void}>Back</button>
      <button data-testid="issues-select" onClick={() => (props.onSelectIssue as (issue: unknown) => void)({ number: 1, title: 'Bug' })}>Select Issue</button>
    </div>
  ),
}))

vi.mock('./newSession/ReviewPrsView', () => ({
  ReviewPrsView: (props: Record<string, unknown>) => (
    <div data-testid="review-prs-view">
      <button data-testid="review-prs-back" onClick={props.onBack as () => void}>Back</button>
    </div>
  ),
}))

vi.mock('./newSession/AgentPickerView', () => ({
  AgentPickerView: (props: Record<string, unknown>) => (
    <div data-testid="agent-picker-view">
      <button data-testid="agent-picker-back" onClick={props.onBack as () => void}>Back</button>
    </div>
  ),
}))

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
  useRepoStore.setState({ repos: [], ghAvailable: true, gitAvailable: true })
})

describe('NewSessionDialog', () => {
  it('renders home view by default', () => {
    render(<NewSessionDialog onComplete={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByTestId('home-view')).toBeTruthy()
  })

  it('does not call onCancel when backdrop is clicked', () => {
    const onCancel = vi.fn()
    const { container } = render(<NewSessionDialog onComplete={vi.fn()} onCancel={onCancel} />)
    // Click the backdrop (outermost div) — should NOT close
    fireEvent.click(container.firstElementChild!)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('navigates to clone view when Clone is clicked', () => {
    render(<NewSessionDialog onComplete={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByTestId('clone-btn'))
    expect(screen.getByTestId('clone-view')).toBeTruthy()
  })

  it('navigates back to home from clone view', () => {
    render(<NewSessionDialog onComplete={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByTestId('clone-btn'))
    expect(screen.getByTestId('clone-view')).toBeTruthy()
    fireEvent.click(screen.getByTestId('clone-back'))
    expect(screen.getByTestId('home-view')).toBeTruthy()
  })

  it('navigates to add existing repo view', () => {
    render(<NewSessionDialog onComplete={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByTestId('add-repo-btn'))
    expect(screen.getByTestId('add-existing-view')).toBeTruthy()
  })

  it('navigates back to home from add existing repo view', () => {
    render(<NewSessionDialog onComplete={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByTestId('add-repo-btn'))
    fireEvent.click(screen.getByTestId('add-existing-back'))
    expect(screen.getByTestId('home-view')).toBeTruthy()
  })

  it('calls onCancel from the cancel button in home view', () => {
    const onCancel = vi.fn()
    render(<NewSessionDialog onComplete={vi.fn()} onCancel={onCancel} />)
    fireEvent.click(screen.getByTestId('cancel-btn'))
    expect(onCancel).toHaveBeenCalled()
  })

  it('navigates to new-branch view', () => {
    render(<NewSessionDialog onComplete={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByTestId('new-branch-btn'))
    expect(screen.getByTestId('new-branch-view')).toBeTruthy()
  })

  it('navigates to existing-branch view', () => {
    render(<NewSessionDialog onComplete={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByTestId('existing-branch-btn'))
    expect(screen.getByTestId('existing-branch-view')).toBeTruthy()
  })

  it('navigates back from existing-branch to home', () => {
    render(<NewSessionDialog onComplete={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByTestId('existing-branch-btn'))
    fireEvent.click(screen.getByTestId('existing-branch-back'))
    expect(screen.getByTestId('home-view')).toBeTruthy()
  })

  it('navigates to repo-settings view', () => {
    render(<NewSessionDialog onComplete={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByTestId('repo-settings-btn'))
    expect(screen.getByTestId('repo-settings-view')).toBeTruthy()
  })

  it('navigates back from repo-settings to home', () => {
    render(<NewSessionDialog onComplete={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByTestId('repo-settings-btn'))
    fireEvent.click(screen.getByTestId('repo-settings-back'))
    expect(screen.getByTestId('home-view')).toBeTruthy()
  })

  it('navigates to issues view', () => {
    render(<NewSessionDialog onComplete={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByTestId('issues-btn'))
    expect(screen.getByTestId('issues-view')).toBeTruthy()
  })

  it('navigates back from issues to home', () => {
    render(<NewSessionDialog onComplete={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByTestId('issues-btn'))
    fireEvent.click(screen.getByTestId('issues-back'))
    expect(screen.getByTestId('home-view')).toBeTruthy()
  })

  it('navigates from issues to new-branch with issue', () => {
    render(<NewSessionDialog onComplete={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByTestId('issues-btn'))
    fireEvent.click(screen.getByTestId('issues-select'))
    expect(screen.getByTestId('new-branch-view')).toBeTruthy()
  })

  it('navigates back from new-branch with issue to issues view', () => {
    render(<NewSessionDialog onComplete={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByTestId('issues-btn'))
    fireEvent.click(screen.getByTestId('issues-select'))
    fireEvent.click(screen.getByTestId('new-branch-back'))
    expect(screen.getByTestId('issues-view')).toBeTruthy()
  })

  it('navigates back from new-branch without issue to home', () => {
    render(<NewSessionDialog onComplete={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByTestId('new-branch-btn'))
    fireEvent.click(screen.getByTestId('new-branch-back'))
    expect(screen.getByTestId('home-view')).toBeTruthy()
  })

  it('navigates to review-prs view', () => {
    render(<NewSessionDialog onComplete={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByTestId('review-prs-btn'))
    expect(screen.getByTestId('review-prs-view')).toBeTruthy()
  })

  it('navigates back from review-prs to home', () => {
    render(<NewSessionDialog onComplete={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByTestId('review-prs-btn'))
    fireEvent.click(screen.getByTestId('review-prs-back'))
    expect(screen.getByTestId('home-view')).toBeTruthy()
  })

  it('navigates to agent-picker on open folder', async () => {
    vi.mocked(window.dialog.openFolder).mockResolvedValue('/some/folder')
    render(<NewSessionDialog onComplete={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByTestId('open-folder-btn'))
    // Wait for the async dialog result
    await screen.findByTestId('agent-picker-view')
    expect(screen.getByTestId('agent-picker-view')).toBeTruthy()
  })

  it('stays on home when open folder returns null', async () => {
    vi.mocked(window.dialog.openFolder).mockResolvedValue(null)
    render(<NewSessionDialog onComplete={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByTestId('open-folder-btn'))
    // Give async callback a tick to settle
    await vi.waitFor(() => {
      expect(screen.getByTestId('home-view')).toBeTruthy()
    })
  })

  it('navigates to agent-picker on open main', () => {
    render(<NewSessionDialog onComplete={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByTestId('open-main-btn'))
    expect(screen.getByTestId('agent-picker-view')).toBeTruthy()
  })

  it('navigates back from agent-picker to home', () => {
    render(<NewSessionDialog onComplete={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByTestId('open-main-btn'))
    fireEvent.click(screen.getByTestId('agent-picker-back'))
    expect(screen.getByTestId('home-view')).toBeTruthy()
  })

  it('Escape key returns from sub-view to home', () => {
    render(<NewSessionDialog onComplete={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByTestId('clone-btn'))
    expect(screen.getByTestId('clone-view')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByTestId('home-view')).toBeTruthy()
  })

  it('Escape key does nothing when already on home view', () => {
    const onCancel = vi.fn()
    render(<NewSessionDialog onComplete={vi.fn()} onCancel={onCancel} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    // Should still be on home view (home view handles its own Escape)
    expect(screen.getByTestId('home-view')).toBeTruthy()
  })
})
