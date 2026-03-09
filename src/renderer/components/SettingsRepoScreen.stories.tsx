import type { Meta, StoryObj } from '@storybook/react'
import { SettingsRepoScreen } from './SettingsRepoScreen'
import { makeAgent, makeRepo } from '../../../.storybook/mockData'

const agents = [
  makeAgent({ id: 'agent-1', name: 'Claude Code', command: 'claude', color: '#4a9eff' }),
  makeAgent({ id: 'agent-2', name: 'Aider', command: 'aider', color: '#22c55e' }),
]

const repo = makeRepo({ id: 'repo-1', name: 'my-app', rootDir: '/Users/test/repos/my-app', defaultBranch: 'main' })

const meta: Meta<typeof SettingsRepoScreen> = {
  title: 'Settings/SettingsRepoScreen',
  component: SettingsRepoScreen,
}
export default meta
type Story = StoryObj<typeof SettingsRepoScreen>

export const Default: Story = {
  args: {
    repo,
    agents,
    onUpdateRepo: (repoId, updates) => console.log('Update repo:', repoId, updates),
    onOpenCommandsEditor: (dir) => console.log('Open commands editor:', dir),
    onBack: () => console.log('Back'),
  },
}
