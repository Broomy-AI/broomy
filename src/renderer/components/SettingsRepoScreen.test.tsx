// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../test/react-setup'
import { SettingsRepoScreen } from './SettingsRepoScreen'

vi.mock('./RepoSettingsEditor', () => ({
  RepoSettingsEditor: (props: Record<string, unknown>) => (
    <div data-testid="repo-settings-editor">
      <span data-testid="repo-name">{(props.repo as { name: string })?.name}</span>
    </div>
  ),
}))

afterEach(() => {
  cleanup()
})

const repo = { id: 'r1', name: 'My Repo', rootDir: '/path/my-repo', defaultBranch: 'main', remoteUrl: 'https://github.com/test/repo' }
const agents = [{ id: 'a1', name: 'Claude', command: 'claude' }]

describe('SettingsRepoScreen', () => {
  it('renders RepoSettingsEditor', () => {
    render(
      <SettingsRepoScreen
        repo={repo}
        agents={agents}
        onUpdateRepo={vi.fn()}
        onOpenCommandsEditor={vi.fn()}
        onBack={vi.fn()}
      />,
    )
    expect(screen.getByTestId('repo-settings-editor')).toBeTruthy()
    expect(screen.getByTestId('repo-name').textContent).toBe('My Repo')
  })

  it('renders Edit Commands link', () => {
    render(
      <SettingsRepoScreen
        repo={repo}
        agents={agents}
        onUpdateRepo={vi.fn()}
        onOpenCommandsEditor={vi.fn()}
        onBack={vi.fn()}
      />,
    )
    expect(screen.getByText('Edit Commands')).toBeTruthy()
  })

  it('calls onOpenCommandsEditor with repo rootDir when Edit Commands is clicked', () => {
    const onOpen = vi.fn()
    render(
      <SettingsRepoScreen
        repo={repo}
        agents={agents}
        onUpdateRepo={vi.fn()}
        onOpenCommandsEditor={onOpen}
        onBack={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByTestId('edit-commands-link'))
    expect(onOpen).toHaveBeenCalledWith('/path/my-repo')
  })
})
