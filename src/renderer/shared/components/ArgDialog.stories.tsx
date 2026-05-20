import type { Meta, StoryObj } from '@storybook/react'
import { ArgDialog } from './ArgDialog'

const meta: Meta<typeof ArgDialog> = {
  title: 'Commands/ArgDialog',
  component: ArgDialog,
  parameters: { layout: 'centered' },
}
export default meta
type Story = StoryObj<typeof ArgDialog>

const ctx = { main: 'main', branch: 'feature/x', directory: '/repo', issueNumber: '' }

export const SingleRequired: Story = {
  args: {
    title: 'Plan feature',
    description: 'Brainstorm and write a design spec',
    template: '/plan {topic}',
    argsMeta: [{ name: 'topic', description: 'The thing you want to plan.' }],
    context: ctx,
    onRun: () => undefined,
    onCancel: () => undefined,
  },
}

export const RequiredAndOptionalFlag: Story = {
  args: {
    ...SingleRequired.args,
    template: '/plan {topic} --depth {depth}',
    argsMeta: [
      { name: 'topic', description: 'What to plan.' },
      { name: 'depth', description: 'How deep to go.' },
    ],
  },
}
