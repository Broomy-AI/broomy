import type { Meta, StoryObj } from '@storybook/react'
import { EnvVarEditor } from './EnvVarEditor'

const meta: Meta<typeof EnvVarEditor> = {
  title: 'Settings/EnvVarEditor',
  component: EnvVarEditor,
}
export default meta
type Story = StoryObj<typeof EnvVarEditor>

export const Empty: Story = {
  args: {
    env: {},
    onChange: (env) => console.log('Env changed:', env),
    command: 'claude',
  },
}

export const WithVariables: Story = {
  args: {
    env: {
      CLAUDE_CONFIG_DIR: '/Users/test/.claude',
      API_KEY: 'sk-12345',
    },
    onChange: (env) => console.log('Env changed:', env),
    command: 'claude',
  },
}

export const NonClaudeCommand: Story = {
  args: {
    env: { CUSTOM_VAR: 'value' },
    onChange: (env) => console.log('Env changed:', env),
    command: 'aider',
  },
}
