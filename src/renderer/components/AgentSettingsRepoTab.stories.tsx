import type { Meta, StoryObj } from '@storybook/react'
import { AgentSettingsRepoTab } from './AgentSettingsRepoTab'
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

const meta: Meta<typeof AgentSettingsRepoTab> = {
  title: 'Settings/AgentSettingsRepoTab',
  component: AgentSettingsRepoTab,
}
export default meta
type Story = StoryObj<typeof AgentSettingsRepoTab>

export const Default: Story = {
  args: {
    repos,
    agents,
    editingRepoId: null,
    onEditRepo: noop,
    onUpdateRepo: noop,
    onCloseRepoEditor: noop,
  },
}

export const EditingRepo: Story = {
  args: {
    repos,
    agents,
    editingRepoId: 'repo-1',
    onEditRepo: noop,
    onUpdateRepo: noop,
    onCloseRepoEditor: noop,
  },
}

export const NoRepos: Story = {
  args: {
    repos: [],
    agents,
    editingRepoId: null,
    onEditRepo: noop,
    onUpdateRepo: noop,
    onCloseRepoEditor: noop,
  },
}
