import type { Meta, StoryObj } from '@storybook/react'
import Terminal from './Terminal'

/**
 * Terminal wraps xterm.js which cannot render in Storybook. These stories
 * demonstrate the surrounding UI: banners for not-installed agents, restored
 * sessions, and the no-session placeholder.
 */
const meta: Meta<typeof Terminal> = {
  title: 'Layout/Terminal',
  component: Terminal,
  decorators: [
    (Story) => (
      <div className="bg-bg-primary text-text-primary" style={{ width: 800, height: 400 }}>
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof Terminal>

export const NoSession: Story = {
  args: {
    cwd: '/Users/test/projects/my-app',
  },
}

export const AgentNotInstalled: Story = {
  args: {
    sessionId: 'session-1',
    cwd: '/Users/test/projects/my-app',
    command: 'claude',
    isAgentTerminal: true,
    agentNotInstalled: true,
  },
}

export const AgentNotInstalledUnknown: Story = {
  args: {
    sessionId: 'session-1',
    cwd: '/Users/test/projects/my-app',
    command: 'my-custom-agent',
    isAgentTerminal: true,
    agentNotInstalled: true,
  },
}

export const AgentTerminal: Story = {
  args: {
    sessionId: 'session-1',
    cwd: '/Users/test/projects/my-app',
    command: 'claude',
    isAgentTerminal: true,
    agentNotInstalled: false,
  },
}

export const UserTerminal: Story = {
  args: {
    sessionId: 'session-1',
    cwd: '/Users/test/projects/my-app',
  },
}

export const RestoredAgentTerminal: Story = {
  args: {
    sessionId: 'session-1',
    cwd: '/Users/test/projects/my-app',
    command: 'claude',
    isAgentTerminal: true,
    agentNotInstalled: false,
    isRestored: true,
  },
}

export const IsolatedTerminal: Story = {
  args: {
    sessionId: 'session-1',
    cwd: '/Users/test/projects/my-app',
    isolated: true,
    repoRootDir: '/Users/test/projects/my-app',
  },
}
