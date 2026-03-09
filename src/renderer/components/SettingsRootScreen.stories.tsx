import type { Meta, StoryObj } from '@storybook/react'
import { SettingsRootScreen } from './SettingsRootScreen'
import { makeAgent, makeRepo } from '../../../.storybook/mockData'

const agents = [
  makeAgent({ id: 'agent-1', name: 'Claude Code', command: 'claude', color: '#4a9eff' }),
  makeAgent({ id: 'agent-2', name: 'Aider', command: 'aider', color: '#22c55e' }),
]

const repos = [
  makeRepo({ id: 'repo-1', name: 'my-app', rootDir: '/Users/test/repos/my-app', defaultBranch: 'main' }),
  makeRepo({ id: 'repo-2', name: 'backend', rootDir: '/Users/test/repos/backend', defaultBranch: 'main' }),
]

const noop = () => {}

const meta: Meta<typeof SettingsRootScreen> = {
  title: 'Settings/SettingsRootScreen',
  component: SettingsRootScreen,
}
export default meta
type Story = StoryObj<typeof SettingsRootScreen>

export const Default: Story = {
  args: {
    defaultCloneDir: '/Users/test/repos',
    defaultShell: '/bin/zsh',
    availableShells: [
      { path: '/bin/zsh', name: 'zsh', isDefault: true },
      { path: '/bin/bash', name: 'bash', isDefault: false },
      { path: '/usr/local/bin/fish', name: 'fish', isDefault: false },
    ],
    agents,
    repos,
    onSetDefaultCloneDir: async () => {},
    onSetDefaultShell: noop,
    onNavigateToAgents: noop,
    onNavigateToRepo: noop,
  },
}

export const NoRepos: Story = {
  args: {
    defaultCloneDir: '/Users/test/repos',
    defaultShell: null,
    availableShells: [
      { path: '/bin/zsh', name: 'zsh', isDefault: true },
    ],
    agents,
    repos: [],
    onSetDefaultCloneDir: async () => {},
    onSetDefaultShell: noop,
    onNavigateToAgents: noop,
    onNavigateToRepo: noop,
  },
}

export const DetectingShells: Story = {
  args: {
    defaultCloneDir: '/Users/test/repos',
    defaultShell: null,
    availableShells: [],
    agents,
    repos,
    onSetDefaultCloneDir: async () => {},
    onSetDefaultShell: noop,
    onNavigateToAgents: noop,
    onNavigateToRepo: noop,
  },
}
