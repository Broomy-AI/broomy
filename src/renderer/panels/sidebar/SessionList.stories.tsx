import type { Meta, StoryObj } from '@storybook/react'
import SessionList from './SessionList'
import { makeSession, makeRepo } from '../../../../.storybook/mockData'
import { withSessionStore } from '../../../../.storybook/decorators'
import type { MainBehind } from '../../features/git/hooks/useMainSync'

const defaultRepo = makeRepo({ id: 'repo-1', name: 'my-app' })

const meta: Meta<typeof SessionList> = {
  title: 'SessionList/SessionList',
  component: SessionList,
  args: {
    repos: [defaultRepo],
    onSelectSession: () => {},
    onNewSession: () => {},
    onDeleteSession: () => {},
    onRefreshPrStatus: () => Promise.resolve(),
    onArchiveSession: () => {},
    onUnarchiveSession: () => {},
    mainBehindByRepoId: new Map<string, MainBehind>(),
    syncingRepoIds: new Set<string>(),
    onSyncMain: () => Promise.resolve({ success: true }),
  },
}
export default meta
type Story = StoryObj<typeof SessionList>

export const Empty: Story = {
  decorators: [
    withSessionStore({ activeSessionId: 'session-1', sessions: [] }),
  ],
}

export const WithSessions: Story = {
  decorators: [
    withSessionStore({
      activeSessionId: 'session-1',
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
    }),
  ],
}

/** The per-repo `main/` sync chip on the group header: behind (↓N), syncing, and unavailable (#170). */
export const MainSyncChipStates: Story = {
  args: {
    repos: [
      makeRepo({ id: 'repo-behind', name: 'behind-repo' }),
      makeRepo({ id: 'repo-syncing', name: 'syncing-repo' }),
      makeRepo({ id: 'repo-unavailable', name: 'unavailable-repo' }),
    ],
    mainBehindByRepoId: new Map<string, MainBehind>([
      ['repo-behind', { status: 'available', behind: 5 }],
      ['repo-syncing', { status: 'available', behind: 2 }],
      ['repo-unavailable', { status: 'unavailable', error: 'could not reach origin' }],
    ]),
    syncingRepoIds: new Set<string>(['repo-syncing']),
  },
  decorators: [
    withSessionStore({
      activeSessionId: 'b-1',
      sessions: [
        makeSession({ id: 'b-1', repoId: 'repo-behind', branch: 'feature/behind', name: 'behind-repo', lastMessage: 'main is 5 behind' }),
        makeSession({ id: 's-1', repoId: 'repo-syncing', branch: 'feature/syncing', name: 'syncing-repo', lastMessage: 'syncing main…' }),
        makeSession({ id: 'u-1', repoId: 'repo-unavailable', branch: 'feature/unavailable', name: 'unavailable-repo', lastMessage: 'could not check main' }),
      ],
    }),
  ],
}

export const MixedStates: Story = {
  decorators: [
    withSessionStore({
      activeSessionId: 'session-1',
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
    }),
  ],
}
