import type { Meta, StoryObj } from '@storybook/react'
import { TemplateVarsModal } from './TemplateVarsModal'
import type { TemplateVarInput } from '../../features/commands/templateVars'

const varInput = {
  directory: '/Users/rob/repos/broomy/wt/fix-login',
  repo: {
    id: 'r1', name: 'broomy', remoteUrl: 'git@github.com:broomy/broomy.git',
    rootDir: '/Users/rob/repos/broomy', defaultBranch: 'main',
  },
  session: {
    name: 'Fix login redirect', branch: 'fix/login', stage: 'coding',
    prNumber: 42, prTitle: 'Fix the login redirect', prUrl: 'https://github.com/x/y/pull/42',
    issueNumber: 7, issueTitle: 'Login redirect loops', issueUrl: 'https://github.com/x/y/issues/7',
  },
} as unknown as TemplateVarInput

const meta: Meta<typeof TemplateVarsModal> = {
  title: 'Shared/TemplateVarsModal',
  component: TemplateVarsModal,
  args: {
    varInput,
    onInsert: (text: string) => console.log('Insert:', text),
    onClose: () => console.log('Close'),
  },
}
export default meta
type Story = StoryObj<typeof TemplateVarsModal>

/** commands.json templates — {name} syntax, every variable available. */
export const CommandSurface: Story = { args: { surface: 'command' } }

/** Agent command line — $BROOMY_ syntax so titles are never spliced into a shell. */
export const AgentSurface: Story = {
  args: { surface: 'agent', footerNote: 'Pull request values are empty until the branch has a PR.' },
}

/** Repo init script — PR and session variables dimmed, they do not exist yet. */
export const InitScriptSurface: Story = { args: { surface: 'init' } }

/** No session in scope, as when configuring settings — every value reads as a dash. */
export const NoSessionValues: Story = {
  args: { surface: 'command', varInput: { directory: '' } },
}
