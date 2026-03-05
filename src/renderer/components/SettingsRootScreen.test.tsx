// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '../../test/react-setup'
import { SettingsRootScreen } from './SettingsRootScreen'
import type { AgentConfig } from '../store/agents'
import type { ManagedRepo } from '../../preload/index'

afterEach(() => {
  cleanup()
})

const defaultProps = {
  defaultCloneDir: '/Users/test/repos',
  defaultShell: '/bin/zsh',
  availableShells: [
    { name: 'zsh', path: '/bin/zsh', isDefault: true },
    { name: 'bash', path: '/bin/bash', isDefault: false },
  ],
  agents: [
    { id: 'a1', name: 'Claude', command: 'claude' },
    { id: 'a2', name: 'Aider', command: 'aider' },
  ] as AgentConfig[],
  repos: [
    { id: 'r1', name: 'My Repo', rootDir: '/path/my-repo', defaultBranch: 'main', remoteUrl: '' },
  ] as ManagedRepo[],
  onSetDefaultCloneDir: vi.fn().mockResolvedValue(undefined),
  onSetDefaultShell: vi.fn(),
  onNavigateToAgents: vi.fn(),
  onNavigateToRepo: vi.fn(),
}

describe('SettingsRootScreen', () => {
  it('renders General section with default repo folder', () => {
    render(<SettingsRootScreen {...defaultProps} />)
    expect(screen.getByText('General')).toBeTruthy()
    expect(screen.getByText('Default Repo Folder')).toBeTruthy()
    expect(screen.getByText('/Users/test/repos')).toBeTruthy()
  })

  it('shows ~/repos when defaultCloneDir is empty', () => {
    render(<SettingsRootScreen {...defaultProps} defaultCloneDir="" />)
    expect(screen.getByText('~/repos')).toBeTruthy()
  })

  it('renders Browse button', () => {
    render(<SettingsRootScreen {...defaultProps} />)
    expect(screen.getByText('Browse')).toBeTruthy()
  })

  it('renders shell selector with available shells', () => {
    render(<SettingsRootScreen {...defaultProps} />)
    expect(screen.getByText('Terminal Shell')).toBeTruthy()
    expect(screen.getByText('zsh (system default)')).toBeTruthy()
  })

  it('renders agents nav row with count badge', () => {
    render(<SettingsRootScreen {...defaultProps} />)
    expect(screen.getByText('Manage Agents')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
  })

  it('calls onNavigateToAgents when agents row is clicked', () => {
    render(<SettingsRootScreen {...defaultProps} />)
    fireEvent.click(screen.getByTestId('nav-agents'))
    expect(defaultProps.onNavigateToAgents).toHaveBeenCalledOnce()
  })

  it('renders repo nav rows', () => {
    render(<SettingsRootScreen {...defaultProps} />)
    expect(screen.getByText('My Repo')).toBeTruthy()
    expect(screen.getByText('/path/my-repo')).toBeTruthy()
  })

  it('calls onNavigateToRepo when repo row is clicked', () => {
    render(<SettingsRootScreen {...defaultProps} />)
    fireEvent.click(screen.getByTestId('nav-repo-r1'))
    expect(defaultProps.onNavigateToRepo).toHaveBeenCalledWith('r1')
  })

  it('hides repos section when no repos', () => {
    render(<SettingsRootScreen {...defaultProps} repos={[]} />)
    expect(screen.queryByText('Repositories')).toBeNull()
  })
})
