import type { Meta, StoryObj } from '@storybook/react'
import { AgentSettingsAgentTab } from './AgentSettingsAgentTab'
import { makeAgent } from '../../../.storybook/mockData'
import { useRef } from 'react'
import type { EnvVarEditorRef } from './EnvVarEditor'

const agents = [
  makeAgent({ id: 'agent-1', name: 'Claude Code', command: 'claude', color: '#4a9eff' }),
  makeAgent({ id: 'agent-2', name: 'Aider', command: 'aider', color: '#22c55e' }),
]

const noop = () => {}

function AgentTabWrapper(args: React.ComponentProps<typeof AgentSettingsAgentTab>) {
  const ref = useRef<EnvVarEditorRef>(null)
  return <AgentSettingsAgentTab {...args} envEditorRef={ref} />
}

const meta: Meta<typeof AgentSettingsAgentTab> = {
  title: 'Settings/AgentSettingsAgentTab',
  component: AgentSettingsAgentTab,
}
export default meta
type Story = StoryObj<typeof AgentSettingsAgentTab>

export const WithAgents: Story = {
  args: {
    agents,
    editingId: null,
    showAddForm: false,
    name: '',
    command: '',
    color: '',
    env: {},
    skipApprovalFlag: '',
    onNameChange: noop,
    onCommandChange: noop,
    onColorChange: noop,
    onEnvChange: noop,
    onSkipApprovalFlagChange: noop,
    onEdit: noop,
    onUpdate: noop,
    onDelete: noop,
    onAdd: noop,
    onShowAddForm: noop,
    onCancel: noop,
  },
  render: (args) => <AgentTabWrapper {...args} />,
}

export const ShowingAddForm: Story = {
  args: {
    agents,
    editingId: null,
    showAddForm: true,
    name: '',
    command: '',
    color: '',
    env: {},
    skipApprovalFlag: '',
    onNameChange: noop,
    onCommandChange: noop,
    onColorChange: noop,
    onEnvChange: noop,
    onSkipApprovalFlagChange: noop,
    onEdit: noop,
    onUpdate: noop,
    onDelete: noop,
    onAdd: noop,
    onShowAddForm: noop,
    onCancel: noop,
  },
  render: (args) => <AgentTabWrapper {...args} />,
}

export const EditingAgent: Story = {
  args: {
    agents,
    editingId: 'agent-1',
    showAddForm: false,
    name: 'Claude Code',
    command: 'claude',
    color: '#4a9eff',
    env: {},
    skipApprovalFlag: '',
    onNameChange: noop,
    onCommandChange: noop,
    onColorChange: noop,
    onEnvChange: noop,
    onSkipApprovalFlagChange: noop,
    onEdit: noop,
    onUpdate: noop,
    onDelete: noop,
    onAdd: noop,
    onShowAddForm: noop,
    onCancel: noop,
  },
  render: (args) => <AgentTabWrapper {...args} />,
}

export const Empty: Story = {
  args: {
    agents: [],
    editingId: null,
    showAddForm: false,
    name: '',
    command: '',
    color: '',
    env: {},
    skipApprovalFlag: '',
    onNameChange: noop,
    onCommandChange: noop,
    onColorChange: noop,
    onEnvChange: noop,
    onSkipApprovalFlagChange: noop,
    onEdit: noop,
    onUpdate: noop,
    onDelete: noop,
    onAdd: noop,
    onShowAddForm: noop,
    onCancel: noop,
  },
  render: (args) => <AgentTabWrapper {...args} />,
}
