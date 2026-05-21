import type { Meta, StoryObj } from '@storybook/react'
import { ActionButtons } from './ActionButtons'

const defaultConditionState = {
  'has-changes': false,
  'clean': true,
  'merging': false,
  'conflicts': false,
  'no-tracking': false,
  'ahead': false,
  'behind': false,
  'behind-main': false,
  'on-main': false,
  'in-progress': true,
  'pushed': false,
  'empty': false,
  'open': false,
  'merged': false,
  'closed': false,
  'no-pr': true,
  'has-write-access': false,
  'allow-approve-and-merge': true,
  'checks-passed': false,
  'has-issue': false,
  'no-devcontainer': false,
  'review': false,
}

const meta: Meta<typeof ActionButtons> = {
  title: 'Explorer/ActionButtons',
  component: ActionButtons,
  args: {
    actions: null,
    conditionState: defaultConditionState,
    templateVars: { main: 'main', branch: 'feature/test', directory: '/Users/test/projects/my-app', issueNumber: '' },
    currentStage: 'planning',
    directory: '/Users/test/projects/my-app',
    onSetSessionStage: () => {},
    onSetup: () => {},
    onGitStatusRefresh: () => {},
  },
}
export default meta
type Story = StoryObj<typeof ActionButtons>

/** actions=null → renders SetupCta asking user to pick a pack or start blank. */
export const Empty: Story = {
  args: {
    actions: null,
  },
}

/** Single button with no stages — stage pill hidden. */
export const SingleButtonNoStages: Story = {
  args: {
    actions: [
      { id: 'lint', label: 'Run lint', template: '!npm run lint', showWhen: [], style: 'primary', surface: 'source-control' },
    ],
    conditionState: { ...defaultConditionState },
  },
}

/** Multiple buttons where at least one uses setStage — stage pill visible. */
export const MultiButtonWithStagePill: Story = {
  args: {
    actions: [
      { id: 'plan', label: 'Start planning', template: '/plan {topic}', showWhen: [], style: 'primary', surface: 'source-control', setStage: 'planning' },
      { id: 'build', label: 'Build it', template: '/build', showWhen: [], style: 'secondary', surface: 'source-control', stages: ['planning'], setStage: 'building' },
      { id: 'verify', label: 'Verify', template: '!npm test', showWhen: [], style: 'accent', surface: 'source-control', stages: ['building'], setStage: 'verifying' },
    ],
    currentStage: 'planning',
    conditionState: { ...defaultConditionState },
    onOpenCommandsEditor: () => {},
  },
}

export const Default: Story = {
  args: {},
}

export const WithCustomActions: Story = {
  args: {
    actions: [
      { id: 'push', label: 'Push to remote', template: '!git push', showWhen: ['has-changes'], style: 'primary', surface: 'source-control' },
      { id: 'lint', label: 'Run lint', template: '!npm run lint', showWhen: [], style: 'secondary', surface: 'source-control' },
    ],
    conditionState: { ...defaultConditionState, 'has-changes': true, 'clean': false },
  },
}

export const WithPR: Story = {
  args: {
    conditionState: { ...defaultConditionState, 'open': true, 'no-pr': false, 'has-write-access': true },
  },
}

export const WithCommandsEditor: Story = {
  args: {
    onOpenCommandsEditor: () => {},
  },
}

export const NoAgentTerminal: Story = {
  args: {
    actions: [
      { id: 'agent-task', label: 'Ask agent to fix', template: 'Fix the failing tests', showWhen: [], style: 'primary', surface: 'source-control' },
    ],
    agentPtyId: undefined,
  },
}
