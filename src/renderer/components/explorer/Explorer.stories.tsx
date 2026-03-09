import type { Meta, StoryObj } from '@storybook/react'
import Explorer from './index'
import { makeSession } from '../../../../.storybook/mockData'

const meta: Meta<typeof Explorer> = {
  title: 'Explorer/Explorer',
  component: Explorer,
  args: {
    directory: '/Users/test/projects/my-app',
    onFileSelect: () => {},
    selectedFilePath: null,
    gitStatus: [],
    syncStatus: { files: [], ahead: 0, behind: 0, tracking: 'origin/main', current: 'feature/test', isMerging: false, hasConflicts: false },
    onFilterChange: () => {},
    onGitStatusRefresh: () => {},
    recentFiles: [],
    sessionId: 'session-1',
    branchStatus: 'in-progress',
  },
}
export default meta
type Story = StoryObj<typeof Explorer>

export const FilesView: Story = {
  args: {
    filter: 'files',
  },
}

export const SourceControlView: Story = {
  args: {
    filter: 'source-control',
    gitStatus: [
      { path: 'src/App.tsx', status: 'modified', staged: false, indexStatus: ' ', workingDirStatus: 'M' },
      { path: 'src/utils.ts', status: 'added', staged: true, indexStatus: 'A', workingDirStatus: ' ' },
    ],
  },
}

export const SearchView: Story = {
  args: {
    filter: 'search',
  },
}

export const RecentView: Story = {
  args: {
    filter: 'recent',
    recentFiles: [
      '/Users/test/projects/my-app/src/App.tsx',
      '/Users/test/projects/my-app/src/index.ts',
      '/Users/test/projects/my-app/package.json',
    ],
  },
}

export const NoDirectory: Story = {
  args: {
    directory: undefined,
    filter: 'files',
  },
}

export const WithPlanFile: Story = {
  args: {
    filter: 'files',
    planFilePath: '/Users/test/projects/my-app/.broomy/output/plan.md',
  },
}

export const WithIssuePlan: Story = {
  args: {
    filter: 'files',
    issuePlanExists: true,
    issueNumber: 42,
    issueTitle: 'Fix authentication bug',
  },
}

export const ReviewTab: Story = {
  args: {
    filter: 'review',
    session: makeSession({
      id: 'session-1',
      sessionType: 'review',
      prNumber: 123,
    }),
  },
}
