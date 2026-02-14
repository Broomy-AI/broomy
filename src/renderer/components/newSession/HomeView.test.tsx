// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../../test/react-setup'
import { useRepoStore } from '../../store/repos'
import { HomeView } from './HomeView'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
  useRepoStore.setState({
    repos: [],
    ghAvailable: true,
  })
})

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    onClone: vi.fn(),
    onAddExistingRepo: vi.fn(),
    onOpenFolder: vi.fn(),
    onNewBranch: vi.fn(),
    onExistingBranch: vi.fn(),
    onRepoSettings: vi.fn(),
    onIssues: vi.fn(),
    onReviewPrs: vi.fn(),
    onOpenMain: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  }
}

describe('HomeView', () => {
  it('renders header', () => {
    render(<HomeView {...makeProps()} />)
    expect(screen.getByText('New Session')).toBeTruthy()
  })

  it('renders Clone, Add Repo, and Folder buttons', () => {
    render(<HomeView {...makeProps()} />)
    expect(screen.getByText('Clone')).toBeTruthy()
    expect(screen.getByText('Add Repo')).toBeTruthy()
    expect(screen.getByText('Folder')).toBeTruthy()
  })

  it('calls onClone when Clone is clicked', () => {
    const props = makeProps()
    render(<HomeView {...props} />)
    fireEvent.click(screen.getByText('Clone'))
    expect(props.onClone).toHaveBeenCalled()
  })

  it('calls onAddExistingRepo when Add Repo is clicked', () => {
    const props = makeProps()
    render(<HomeView {...props} />)
    fireEvent.click(screen.getByText('Add Repo'))
    expect(props.onAddExistingRepo).toHaveBeenCalled()
  })

  it('calls onOpenFolder when Folder is clicked', () => {
    const props = makeProps()
    render(<HomeView {...props} />)
    fireEvent.click(screen.getByText('Folder'))
    expect(props.onOpenFolder).toHaveBeenCalled()
  })

  it('calls onCancel when Cancel is clicked', () => {
    const props = makeProps()
    render(<HomeView {...props} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(props.onCancel).toHaveBeenCalled()
  })

  it('shows empty state when no repos', () => {
    render(<HomeView {...makeProps()} />)
    expect(screen.getByText(/No managed repositories yet/)).toBeTruthy()
  })

  it('shows repos when available', () => {
    useRepoStore.setState({
      repos: [
        { id: 'repo-1', name: 'My Project', remoteUrl: '', rootDir: '/repos/my-project', defaultBranch: 'main' },
      ],
      ghAvailable: true,
    })
    render(<HomeView {...makeProps()} />)
    expect(screen.getByText('Your Repositories')).toBeTruthy()
    expect(screen.getByText('My Project')).toBeTruthy()
  })

  it('renders New, Existing, Open buttons for each repo', () => {
    useRepoStore.setState({
      repos: [
        { id: 'repo-1', name: 'My Project', remoteUrl: '', rootDir: '/repos/my-project', defaultBranch: 'main' },
      ],
      ghAvailable: true,
    })
    render(<HomeView {...makeProps()} />)
    expect(screen.getByText('New')).toBeTruthy()
    expect(screen.getByText('Existing')).toBeTruthy()
    expect(screen.getByText('Open')).toBeTruthy()
  })

  it('shows Issues and Review buttons when ghAvailable is true', () => {
    useRepoStore.setState({
      repos: [
        { id: 'repo-1', name: 'My Project', remoteUrl: '', rootDir: '/repos/my-project', defaultBranch: 'main' },
      ],
      ghAvailable: true,
    })
    render(<HomeView {...makeProps()} />)
    expect(screen.getByText('Issues')).toBeTruthy()
    expect(screen.getByText('Review')).toBeTruthy()
  })

  it('hides Issues and Review buttons when ghAvailable is false', () => {
    useRepoStore.setState({
      repos: [
        { id: 'repo-1', name: 'My Project', remoteUrl: '', rootDir: '/repos/my-project', defaultBranch: 'main' },
      ],
      ghAvailable: false,
    })
    render(<HomeView {...makeProps()} />)
    expect(screen.queryByText('Issues')).toBeNull()
    expect(screen.queryByText('Review')).toBeNull()
  })

  it('shows gh not found warning when ghAvailable is false with repos', () => {
    useRepoStore.setState({
      repos: [
        { id: 'repo-1', name: 'My Project', remoteUrl: '', rootDir: '/repos/my-project', defaultBranch: 'main' },
      ],
      ghAvailable: false,
    })
    render(<HomeView {...makeProps()} />)
    expect(screen.getByText(/GitHub CLI.*not found/)).toBeTruthy()
  })

  it('calls onNewBranch with repo when New is clicked', () => {
    const repo = { id: 'repo-1', name: 'My Project', remoteUrl: '', rootDir: '/repos/my-project', defaultBranch: 'main' }
    useRepoStore.setState({ repos: [repo], ghAvailable: true })
    const props = makeProps()
    render(<HomeView {...props} />)
    fireEvent.click(screen.getByText('New'))
    expect(props.onNewBranch).toHaveBeenCalledWith(repo)
  })

  it('calls onExistingBranch with repo when Existing is clicked', () => {
    const repo = { id: 'repo-1', name: 'My Project', remoteUrl: '', rootDir: '/repos/my-project', defaultBranch: 'main' }
    useRepoStore.setState({ repos: [repo], ghAvailable: true })
    const props = makeProps()
    render(<HomeView {...props} />)
    fireEvent.click(screen.getByText('Existing'))
    expect(props.onExistingBranch).toHaveBeenCalledWith(repo)
  })

  it('calls onOpenMain with repo when Open is clicked', () => {
    const repo = { id: 'repo-1', name: 'My Project', remoteUrl: '', rootDir: '/repos/my-project', defaultBranch: 'main' }
    useRepoStore.setState({ repos: [repo], ghAvailable: true })
    const props = makeProps()
    render(<HomeView {...props} />)
    fireEvent.click(screen.getByText('Open'))
    expect(props.onOpenMain).toHaveBeenCalledWith(repo)
  })
})
