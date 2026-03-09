import type { Meta, StoryObj } from '@storybook/react'
import SessionCard from './SessionCard'
import { makeSession } from '../../../../.storybook/mockData'
import { withSessionStore } from '../../../../.storybook/decorators'

const meta: Meta<typeof SessionCard> = {
  title: 'SessionList/SessionCard',
  component: SessionCard,
  decorators: [
    withSessionStore({ activeSessionId: 'session-active' }),
  ],
  args: {
    onSelect: () => {},
    onDelete: () => {},
    onArchive: () => {},
  },
}
export default meta
type Story = StoryObj<typeof SessionCard>

export const Idle: Story = {
  args: {
    session: makeSession({
      id: 'session-1',
      status: 'idle',
      branch: 'feature/add-login',
      name: 'my-app',
      lastMessage: null,
    }),
  },
}

export const Working: Story = {
  args: {
    session: makeSession({
      id: 'session-2',
      status: 'working',
      branch: 'feature/dashboard',
      name: 'my-app',
      lastMessage: 'Implementing the dashboard layout...',
    }),
  },
}

export const Error: Story = {
  args: {
    session: makeSession({
      id: 'session-3',
      status: 'error',
      branch: 'fix/crash-on-startup',
      name: 'my-app',
      lastMessage: 'Failed to compile',
    }),
  },
}

export const Unread: Story = {
  args: {
    session: makeSession({
      id: 'session-4',
      status: 'idle',
      branch: 'feature/notifications',
      name: 'my-app',
      isUnread: true,
      lastMessage: 'All tests passing, ready for review',
    }),
  },
}

export const Archived: Story = {
  args: {
    session: makeSession({
      id: 'session-5',
      status: 'idle',
      branch: 'feature/old-feature',
      name: 'my-app',
      isArchived: true,
      branchStatus: 'merged',
    }),
  },
}

export const WithIssue: Story = {
  args: {
    session: makeSession({
      id: 'session-6',
      status: 'working',
      branch: 'fix/issue-42',
      name: 'my-app',
      issueNumber: 42,
      issueTitle: 'Fix authentication bug',
      lastMessage: 'Working on the auth flow...',
    }),
  },
}

export const WithPR: Story = {
  args: {
    session: makeSession({
      id: 'session-7',
      status: 'idle',
      branch: 'feature/new-api',
      name: 'my-app',
      prNumber: 123,
      branchStatus: 'open',
      lastMessage: 'PR created and ready for review',
    }),
  },
}

export const ReviewSession: Story = {
  args: {
    session: makeSession({
      id: 'session-8',
      status: 'idle',
      branch: 'feature/review-target',
      name: 'my-app',
      sessionType: 'review',
      reviewStatus: 'pending',
      prNumber: 456,
    }),
  },
}

export const ReviewSessionReviewed: Story = {
  args: {
    session: makeSession({
      id: 'session-9',
      status: 'idle',
      branch: 'feature/reviewed-pr',
      name: 'my-app',
      sessionType: 'review',
      reviewStatus: 'reviewed',
      prNumber: 789,
    }),
  },
}

export const Active: Story = {
  args: {
    session: makeSession({
      id: 'session-active',
      status: 'working',
      branch: 'feature/current-work',
      name: 'my-app',
      lastMessage: 'Writing unit tests...',
    }),
  },
}
