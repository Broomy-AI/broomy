import type { Meta, StoryObj, Decorator } from '@storybook/react'
import { CommandsEditor } from './CommandsEditor'
import { useAgentStore } from '../../store/agents'
import { makeAgent } from '../../../../.storybook/mockData'

const POPULATED_CONFIG = JSON.stringify({
  version: 2,
  actions: [
    { id: 'plan', label: 'Start planning', template: '/plan {topic}', showWhen: [], style: 'primary', surface: 'source-control', setStage: 'planning' },
    { id: 'build', label: 'Build it', template: '/build', showWhen: [], style: 'secondary', surface: 'source-control', stages: ['planning'], setStage: 'building' },
    { id: 'lint', label: 'Run lint', template: '!npm run lint', showWhen: [], style: 'accent', surface: 'source-control' },
  ],
})

const EMPTY_CONFIG = JSON.stringify({ version: 2, actions: [] })

const withAgents: Decorator = (Story) => {
  useAgentStore.setState({
    agents: [
      makeAgent({ id: 'agent-1', name: 'Claude Code', command: 'claude' }),
      makeAgent({ id: 'agent-2', name: 'Aider', command: 'aider' }),
    ],
  })
  return <Story />
}

/** Decorator: both user and project files return populated actions. */
const withPopulatedFiles: Decorator = (Story) => {
  const w = window as unknown as Record<string, unknown>
  const prevFs = w.fs as Record<string, unknown>
  w.fs = {
    ...prevFs,
    exists: () => Promise.resolve(true),
    readFile: () => Promise.resolve(POPULATED_CONFIG),
  }
  return <Story />
}

/** Decorator: both config files are absent (exists=false) → empty panes. */
const withNoFiles: Decorator = (Story) => {
  const w = window as unknown as Record<string, unknown>
  const prevFs = w.fs as Record<string, unknown>
  w.fs = {
    ...prevFs,
    exists: () => Promise.resolve(false),
    readFile: () => Promise.resolve(''),
  }
  return <Story />
}

/** Decorator: user file is empty config, project file absent. */
const withEmptyUserFile: Decorator = (Story) => {
  const w = window as unknown as Record<string, unknown>
  const prevFs = w.fs as Record<string, unknown>
  w.fs = {
    ...prevFs,
    exists: (path: string) => Promise.resolve(!path.includes('.broomy/commands.json') || path.includes('/Users/test')),
    readFile: (path: string) => Promise.resolve(
      path.includes('/Users/test') ? EMPTY_CONFIG : ''
    ),
  }
  return <Story />
}

const meta: Meta<typeof CommandsEditor> = {
  title: 'Settings/CommandsEditor',
  component: CommandsEditor,
  decorators: [withAgents],
  args: {
    directory: '/Users/test/repos/my-app/main',
    onClose: () => console.log('Close'),
  },
}
export default meta
type Story = StoryObj<typeof CommandsEditor>

/** Default: both config files present with populated commands (user tab active). */
export const Default: Story = {
  decorators: [withPopulatedFiles],
}

/** EmptyUserSide: user file exists but has no commands (shows empty list + Add command). */
export const EmptyUserSide: Story = {
  decorators: [withEmptyUserFile],
}

/** NoFilesAtAll: neither user nor project file exists (shows "No user commands." pane). */
export const NoFilesAtAll: Story = {
  decorators: [withNoFiles],
}
