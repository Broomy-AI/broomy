// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../test/react-setup'
import { NewSessionDialog } from './NewSessionDialog'
import { useRepoStore } from '../store/repos'

// Mock all the sub-views to isolate NewSessionDialog's routing logic
vi.mock('./newSession/HomeView', () => ({
  HomeView: (props: Record<string, unknown>) => (
    <div data-testid="home-view">
      <button data-testid="clone-btn" onClick={props.onClone as () => void}>Clone</button>
      <button data-testid="add-repo-btn" onClick={props.onAddExistingRepo as () => void}>Add Repo</button>
      <button data-testid="open-folder-btn" onClick={props.onOpenFolder as () => void}>Open Folder</button>
      <button data-testid="cancel-btn" onClick={props.onCancel as () => void}>Cancel</button>
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
  NewBranchView: () => <div data-testid="new-branch-view" />,
}))

vi.mock('./newSession/ExistingBranchView', () => ({
  ExistingBranchView: () => <div data-testid="existing-branch-view" />,
}))

vi.mock('./newSession/RepoSettingsView', () => ({
  RepoSettingsView: () => <div data-testid="repo-settings-view" />,
}))

vi.mock('./newSession/IssuesView', () => ({
  IssuesView: () => <div data-testid="issues-view" />,
}))

vi.mock('./newSession/ReviewPrsView', () => ({
  ReviewPrsView: () => <div data-testid="review-prs-view" />,
}))

vi.mock('./newSession/AgentPickerView', () => ({
  AgentPickerView: () => <div data-testid="agent-picker-view" />,
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

  it('calls onCancel when backdrop is clicked', () => {
    const onCancel = vi.fn()
    const { container } = render(<NewSessionDialog onComplete={vi.fn()} onCancel={onCancel} />)
    // Click the backdrop (outermost div)
    fireEvent.click(container.firstElementChild!)
    expect(onCancel).toHaveBeenCalled()
  })

  it('does not call onCancel when inner dialog is clicked', () => {
    const onCancel = vi.fn()
    render(<NewSessionDialog onComplete={vi.fn()} onCancel={onCancel} />)
    // Click the inner dialog content
    fireEvent.click(screen.getByTestId('home-view'))
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
})
