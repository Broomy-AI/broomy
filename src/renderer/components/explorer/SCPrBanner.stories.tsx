import type { Meta, StoryObj } from '@storybook/react'
import { SCPrBanner } from './SCPrBanner'

const emptyPr = { number: 0, title: '', state: 'OPEN' as const, url: '', headRefName: '', baseRefName: '' }

const meta: Meta<typeof SCPrBanner> = {
  title: 'Explorer/SCPrBanner',
  component: SCPrBanner,
  args: {
    prStatus: emptyPr,
    isPrLoading: false,
    branchBaseName: 'main',
    gitStatus: [],
    syncStatus: { files: [], ahead: 0, behind: 0, tracking: 'origin/main', current: 'feature/test', isMerging: false, hasConflicts: false },
    isSyncingWithMain: false,
    onSyncWithMain: () => {},
    gitOpError: null,
    onDismissError: () => {},
    agentMergeMessage: null,
    onDismissAgentMerge: () => {},
    onFileSelect: () => {},
  },
}
export default meta
type Story = StoryObj<typeof SCPrBanner>

export const Loading: Story = {
  args: {
    isPrLoading: true,
  },
}

export const NoPR: Story = {
  args: {
    prStatus: emptyPr,
  },
}

export const OpenPR: Story = {
  args: {
    prStatus: {
      number: 123,
      title: 'Add authentication flow',
      state: 'OPEN',
      url: 'https://github.com/test/my-app/pull/123',
      headRefName: 'feature/auth',
      baseRefName: 'main',
    },
    branchStatus: 'open',
  },
}

export const MergedPR: Story = {
  args: {
    prStatus: {
      number: 100,
      title: 'Fix login bug',
      state: 'MERGED',
      url: 'https://github.com/test/my-app/pull/100',
      headRefName: 'fix/login',
      baseRefName: 'main',
    },
    branchStatus: 'merged',
  },
}

export const MergedBranchNoPR: Story = {
  args: {
    prStatus: emptyPr,
    branchStatus: 'merged',
  },
}

export const WithIssue: Story = {
  args: {
    prStatus: emptyPr,
    issueNumber: 42,
    issueTitle: 'Fix authentication bug',
    issueUrl: 'https://github.com/test/my-app/issues/42',
  },
}

export const WithGitError: Story = {
  args: {
    prStatus: {
      number: 123,
      title: 'Add feature',
      state: 'OPEN',
      url: 'https://github.com/test/my-app/pull/123',
      headRefName: 'feature/test',
      baseRefName: 'main',
    },
    gitOpError: { operation: 'Push', message: 'Failed to push: remote rejected' },
  },
}

export const WithAgentMergeMessage: Story = {
  args: {
    prStatus: {
      number: 123,
      title: 'Add feature',
      state: 'OPEN',
      url: 'https://github.com/test/my-app/pull/123',
      headRefName: 'feature/test',
      baseRefName: 'main',
    },
    agentMergeMessage: 'Agent is merging changes from main branch',
  },
}

export const SyncingWithMain: Story = {
  args: {
    prStatus: {
      number: 123,
      title: 'Add feature',
      state: 'OPEN',
      url: 'https://github.com/test/my-app/pull/123',
      headRefName: 'feature/test',
      baseRefName: 'main',
    },
    branchStatus: 'open',
    isSyncingWithMain: true,
  },
}
