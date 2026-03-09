import type { Meta, StoryObj } from '@storybook/react'
import { RepoSettingsView } from './RepoSettingsView'
import { useAgentStore } from '../../store/agents'
import { useRepoStore } from '../../store/repos'
import type { Decorator } from '@storybook/react'
import { makeAgent, makeRepo } from '../../../../.storybook/mockData'

const repo = makeRepo({ id: 'repo-1', name: 'my-app', rootDir: '/Users/test/repos/my-app', defaultBranch: 'main' })

const withStores: Decorator = (Story) => {
  useAgentStore.setState({
    agents: [
      makeAgent({ id: 'agent-1', name: 'Claude Code', command: 'claude' }),
      makeAgent({ id: 'agent-2', name: 'Aider', command: 'aider' }),
    ],
  })
  useRepoStore.setState({
    repos: [repo],
  })
  return <Story />
}

const meta: Meta<typeof RepoSettingsView> = {
  title: 'NewSession/RepoSettingsView',
  component: RepoSettingsView,
  decorators: [withStores],
}
export default meta
type Story = StoryObj<typeof RepoSettingsView>

export const Default: Story = {
  args: {
    repo,
    onBack: () => console.log('Back'),
  },
}
