import type { Meta, StoryObj } from '@storybook/react'
import TabbedTerminal from './TabbedTerminal'
import { withDarkTheme, withSessionStore } from '../../../.storybook/decorators'
import { makeSession } from '../../../.storybook/mockData'

/**
 * TabbedTerminal renders terminal instances via xterm.js which cannot run in Storybook.
 * These stories show the tab bar and surrounding UI structure. The terminal content
 * area will be blank.
 */
const meta: Meta<typeof TabbedTerminal> = {
  title: 'Layout/TabbedTerminal',
  component: TabbedTerminal,
  decorators: [
    withDarkTheme,
  ],
}
export default meta
type Story = StoryObj<typeof TabbedTerminal>

const session = makeSession({ id: 'storybook-session-1' })

export const SingleAgentTab: Story = {
  args: {
    sessionId: session.id,
    cwd: session.directory,
    agentCommand: 'claude',
    isolated: false,
  },
  decorators: [
    withSessionStore({
      sessions: [session],
    }),
  ],
}

const sessionWithTabs = makeSession({
  id: 'storybook-session-2',
  terminalTabs: {
    tabs: [
      { id: 'user-1', name: 'Shell' },
      { id: 'user-2', name: 'Logs' },
    ],
    activeTabId: 'user-1',
  },
})

export const WithUserTabs: Story = {
  args: {
    sessionId: sessionWithTabs.id,
    cwd: sessionWithTabs.directory,
    agentCommand: 'claude',
    isolated: false,
  },
  decorators: [
    withSessionStore({
      sessions: [sessionWithTabs],
    }),
  ],
}

export const IsolatedMode: Story = {
  args: {
    sessionId: session.id,
    cwd: session.directory,
    agentCommand: 'claude',
    isolated: true,
    repoRootDir: session.directory,
  },
  decorators: [
    withSessionStore({
      sessions: [session],
    }),
  ],
}

export const RestoredSession: Story = {
  args: {
    sessionId: session.id,
    cwd: session.directory,
    agentCommand: 'claude',
    isolated: false,
    isRestored: true,
  },
  decorators: [
    withSessionStore({
      sessions: [session],
    }),
  ],
}

export const NoAgentCommand: Story = {
  args: {
    sessionId: session.id,
    cwd: session.directory,
    isolated: false,
  },
  decorators: [
    withSessionStore({
      sessions: [session],
    }),
  ],
}
