import type { Meta, StoryObj } from '@storybook/react'
import { SCCommitsView } from './SCCommitsView'

const meta: Meta<typeof SCCommitsView> = {
  title: 'Explorer/SCCommitsView',
  component: SCCommitsView,
  args: {
    directory: '/Users/test/projects/my-app',
    branchBaseName: 'main',
    expandedCommits: new Set<string>(),
    commitFilesByHash: {},
    loadingCommitFiles: new Set<string>(),
    onToggleCommit: () => {},
    onFileSelect: () => {},
    isCommitsLoading: false,
    branchCommits: [],
  },
}
export default meta
type Story = StoryObj<typeof SCCommitsView>

export const NoCommits: Story = {
  args: {
    branchCommits: [],
  },
}

export const Loading: Story = {
  args: {
    isCommitsLoading: true,
  },
}

export const WithCommits: Story = {
  args: {
    branchCommits: [
      { hash: 'aaa111', shortHash: 'aaa111', message: 'Add dashboard component', author: 'Dev', date: '2026-03-08T10:00:00Z', pushed: false },
      { hash: 'bbb222', shortHash: 'bbb222', message: 'Fix layout bug in sidebar', author: 'Dev', date: '2026-03-07T15:30:00Z', pushed: false },
      { hash: 'ccc333', shortHash: 'ccc333', message: 'Initial feature setup', author: 'Dev', date: '2026-03-07T09:00:00Z', pushed: true },
    ],
  },
}

export const WithExpandedCommit: Story = {
  args: {
    branchCommits: [
      { hash: 'aaa111', shortHash: 'aaa111', message: 'Add dashboard component', author: 'Dev', date: '2026-03-08T10:00:00Z', pushed: false },
      { hash: 'bbb222', shortHash: 'bbb222', message: 'Fix layout bug', author: 'Dev', date: '2026-03-07T15:30:00Z', pushed: true },
    ],
    expandedCommits: new Set(['aaa111']),
    commitFilesByHash: {
      aaa111: [
        { path: 'src/components/Dashboard.tsx', status: 'added' },
        { path: 'src/App.tsx', status: 'modified' },
      ],
    },
  },
}

export const LoadingCommitFiles: Story = {
  args: {
    branchCommits: [
      { hash: 'aaa111', shortHash: 'aaa111', message: 'Add dashboard component', author: 'Dev', date: '2026-03-08T10:00:00Z', pushed: false },
    ],
    expandedCommits: new Set(['aaa111']),
    loadingCommitFiles: new Set(['aaa111']),
  },
}

export const AllPushed: Story = {
  args: {
    branchCommits: [
      { hash: 'ccc333', shortHash: 'ccc333', message: 'Initial feature setup', author: 'Dev', date: '2026-03-07T09:00:00Z', pushed: true },
      { hash: 'ddd444', shortHash: 'ddd444', message: 'Add tests', author: 'Dev', date: '2026-03-06T14:00:00Z', pushed: true },
    ],
  },
}
