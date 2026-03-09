import type { Meta, StoryObj } from '@storybook/react'
import { RepoSettingsEditor } from './RepoSettingsEditor'
import { makeAgent, makeRepo } from '../../../.storybook/mockData'

const agents = [
  makeAgent({ id: 'agent-1', name: 'Claude Code', command: 'claude', color: '#4a9eff' }),
  makeAgent({ id: 'agent-2', name: 'Aider', command: 'aider', color: '#22c55e' }),
]

const repo = makeRepo({ id: 'repo-1', name: 'my-app', rootDir: '/Users/test/repos/my-app', defaultBranch: 'main' })

const meta: Meta<typeof RepoSettingsEditor> = {
  title: 'Settings/RepoSettingsEditor',
  component: RepoSettingsEditor,
}
export default meta
type Story = StoryObj<typeof RepoSettingsEditor>

export const Default: Story = {
  args: {
    repo,
    agents,
    onUpdate: (updates) => console.log('Update:', updates),
    onClose: () => console.log('Close'),
  },
}

export const WithDefaultAgent: Story = {
  args: {
    repo: { ...repo, defaultAgentId: 'agent-1' },
    agents,
    onUpdate: (updates) => console.log('Update:', updates),
    onClose: () => console.log('Close'),
  },
}

export const WithApproveAndMerge: Story = {
  args: {
    repo: { ...repo, allowApproveAndMerge: true },
    agents,
    onUpdate: (updates) => console.log('Update:', updates),
    onClose: () => console.log('Close'),
  },
}
