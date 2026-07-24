import type { Meta, StoryObj } from '@storybook/react'
import SessionCard from './SessionCard'
import { makeSession } from '../../../../.storybook/mockData'
import { withSessionStore } from '../../../../.storybook/decorators'

const allSessions = [
  makeSession({
    id: 'session-1',
    status: 'idle',
    branch: 'feature/add-login',
    name: 'my-app',
    lastMessage: null,
  }),
  makeSession({
    id: 'session-2',
    status: 'working',
    branch: 'feature/dashboard',
    name: 'my-app',
    lastMessage: 'Implementing the dashboard layout...',
  }),
  makeSession({
    id: 'session-3',
    status: 'error',
    branch: 'fix/crash-on-startup',
    name: 'my-app',
    lastMessage: 'Failed to compile',
  }),
  makeSession({
    id: 'session-4',
    status: 'idle',
    branch: 'feature/notifications',
    name: 'my-app',
    isUnread: true,
    lastMessage: 'All tests passing, ready for review',
  }),
  makeSession({
    id: 'session-5',
    status: 'idle',
    branch: 'feature/old-feature',
    name: 'my-app',
    isArchived: true,
    branchStatus: 'merged',
  }),
  makeSession({
    id: 'session-6',
    status: 'working',
    branch: 'fix/issue-42',
    name: 'my-app',
    issueNumber: 42,
    issueTitle: 'Fix authentication bug',
    lastMessage: 'Working on the auth flow...',
  }),
  makeSession({
    id: 'session-7',
    status: 'idle',
    branch: 'feature/new-api',
    name: 'my-app',
    prNumber: 123,
    branchStatus: 'open',
    lastMessage: 'PR created and ready for review',
  }),
  makeSession({
    id: 'session-8',
    status: 'idle',
    branch: 'feature/review-target',
    name: 'my-app',
    sessionType: 'review',
    reviewStatus: 'pending',
    prNumber: 456,
  }),
  makeSession({
    id: 'session-9',
    status: 'idle',
    branch: 'feature/reviewed-pr',
    name: 'my-app',
    sessionType: 'review',
    reviewStatus: 'reviewed',
    prNumber: 789,
  }),
  makeSession({
    id: 'session-active',
    status: 'working',
    branch: 'feature/current-work',
    name: 'my-app',
    lastMessage: 'Writing unit tests...',
  }),
  makeSession({
    id: 'session-10',
    status: 'idle',
    branch: 'feature/waiting-review',
    name: 'my-app',
    prNumber: 111,
    branchStatus: 'open',
    reviewState: 'waiting',
    statusChip: 'waiting',
    lastMessage: 'PR created and awaiting review',
  }),
  makeSession({
    id: 'session-11',
    status: 'idle',
    branch: 'feature/approved-pr',
    name: 'my-app',
    prNumber: 222,
    branchStatus: 'open',
    reviewState: 'approved',
    statusChip: 'approved',
    lastMessage: 'PR approved and ready to merge',
  }),
]

const meta: Meta<typeof SessionCard> = {
  title: 'SessionList/SessionCard',
  component: SessionCard,
  decorators: [
    withSessionStore({ activeSessionId: 'session-active', sessions: allSessions }),
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
  args: { sessionId: 'session-1' },
}

export const Working: Story = {
  args: { sessionId: 'session-2' },
}

export const Error: Story = {
  args: { sessionId: 'session-3' },
}

export const Unread: Story = {
  args: { sessionId: 'session-4' },
}

export const Archived: Story = {
  args: { sessionId: 'session-5' },
}

export const WithIssue: Story = {
  args: { sessionId: 'session-6' },
}

export const WithPR: Story = {
  args: { sessionId: 'session-7' },
}

export const ReviewSession: Story = {
  args: { sessionId: 'session-8' },
}

export const ReviewSessionReviewed: Story = {
  args: { sessionId: 'session-9' },
}

export const Active: Story = {
  args: { sessionId: 'session-active' },
}

export const WaitingChip: Story = {
  args: { sessionId: 'session-10' },
}

export const ApprovedChip: Story = {
  args: { sessionId: 'session-11' },
}
