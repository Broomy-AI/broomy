import type { Meta, StoryObj } from '@storybook/react'
import { PromptVariants } from './PromptVariants'
import type { ActionDefinition } from '../utils/commandsConfig'
import { useState } from 'react'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="block text-xs font-medium text-text-secondary mb-1">{label}</label>
      {children}
    </div>
  )
}

function PromptVariantsWrapper(props: { action: ActionDefinition; agentTypes: string[] }) {
  const [action, setAction] = useState(props.action)
  return (
    <div style={{ width: 500 }}>
      <PromptVariants
        action={action}
        onUpdate={(updates) => setAction({ ...action, ...updates })}
        fieldSlot={Field}
        agentTypes={props.agentTypes}
      />
    </div>
  )
}

const baseAction: ActionDefinition = {
  id: 'commit',
  label: 'Commit',
  type: 'agent',
  prompt: 'Review the changes and create a commit with a descriptive message.',
  showWhen: ['has-changes'],
}

const actionWithOverrides: ActionDefinition = {
  id: 'push',
  label: 'Push',
  type: 'agent',
  prompt: 'Push the current branch to origin.',
  showWhen: ['ahead'],
  agents: {
    claude: { prompt: 'Use git push to push the current branch.' },
    codex: { prompt: 'Push changes using the git CLI.' },
  },
}

const meta: Meta<typeof PromptVariants> = {
  title: 'UI/PromptVariants',
  component: PromptVariants,
}
export default meta
type Story = StoryObj<typeof PromptVariants>

export const WithBasePrompt: Story = {
  render: () => (
    <PromptVariantsWrapper
      action={baseAction}
      agentTypes={['claude', 'codex', 'gemini']}
    />
  ),
}

export const WithAgentOverrides: Story = {
  render: () => (
    <PromptVariantsWrapper
      action={actionWithOverrides}
      agentTypes={['claude', 'codex', 'gemini']}
    />
  ),
}
