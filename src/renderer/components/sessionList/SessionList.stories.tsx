import type { Meta, StoryObj } from '@storybook/react'
import SessionList from './index'
import { makeSession, makeRepo } from '../../../../.storybook/mockData'
import { withSessionStore } from '../../../../.storybook/decorators'

const defaultRepo = makeRepo({ id: 'repo-1', name: 'my-app' })

const meta: Meta<typeof SessionList> = {
  title: 'SessionList/SessionList',
  component: SessionList,
  decorators: [
    withSessionStore({ activeSessionId: 'session-1' }),
  ],
  args: {
    repos: [defaultRepo],
    onSelectSession: () => {},
    onNewSession: () => {},
    onDeleteSession: () => {},
    onRefreshPrStatus: () => Promise.resolve(),
    onArchiveSession: () => {},
    onUnarchiveSession: () => {},
  },
}
export default meta
type Story = StoryObj<typeof SessionList>

export const Empty: Story = {
  args: {
    sessions: [],
  },
}

export const WithSessions: Story = {
  args: {
    sessions: [
      makeSession({
        id: 'session-1',
        status: 'working',
        branch: 'feature/dashboard',
        name: 'my-app',
        lastMessage: 'Building components...',
      }),
      makeSession({
        id: 'session-2',
        status: 'idle',
        branch: 'feature/auth',
        name: 'my-app',
        branchStatus: 'pushed',
        lastMessage: 'Done implementing auth',
      }),
      makeSession({
        id: 'session-3',
        status: 'idle',
        branch: 'fix/bug-123',
        name: 'my-app',
        prNumber: 45,
        branchStatus: 'open',
      }),
    ],
  },
}

export const MixedStates: Story = {
  args: {
    sessions: [
      makeSession({
        id: 'session-1',
        status: 'working',
        branch: 'feature/active-work',
        name: 'my-app',
        lastMessage: 'Refactoring the store...',
      }),
      makeSession({
        id: 'session-4',
        status: 'idle',
        branch: 'feature/unread-result',
        name: 'my-app',
        isUnread: true,
        lastMessage: 'All tests pass!',
      }),
      makeSession({
        id: 'session-5',
        status: 'error',
        branch: 'fix/broken-build',
        name: 'my-app',
        lastMessage: 'Build failed: missing module',
      }),
      makeSession({
        id: 'session-6',
        status: 'idle',
        branch: 'feature/merged-pr',
        name: 'my-app',
        branchStatus: 'merged',
        prNumber: 99,
      }),
      makeSession({
        id: 'session-7',
        status: 'idle',
        branch: 'feature/old-work',
        name: 'my-app',
        isArchived: true,
        branchStatus: 'closed',
      }),
      makeSession({
        id: 'session-8',
        status: 'idle',
        branch: 'feature/archived-merged',
        name: 'my-app',
        isArchived: true,
        branchStatus: 'merged',
      }),
    ],
  },
}
