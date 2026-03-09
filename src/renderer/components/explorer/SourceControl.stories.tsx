import type { Meta, StoryObj } from '@storybook/react'
import { SourceControl } from './SourceControl'

const meta: Meta<typeof SourceControl> = {
  title: 'Explorer/SourceControl',
  component: SourceControl,
  args: {
    directory: '/Users/test/projects/my-app',
    gitStatus: [],
    syncStatus: { files: [], ahead: 0, behind: 0, tracking: 'origin/main', current: 'feature/test', isMerging: false, hasConflicts: false },
    onFileSelect: () => {},
    onGitStatusRefresh: () => {},
    branchStatus: 'in-progress',
    onUpdatePrState: () => {},
  },
}
export default meta
type Story = StoryObj<typeof SourceControl>

export const Clean: Story = {
  args: {},
}

export const WithChanges: Story = {
  args: {
    gitStatus: [
      { path: 'src/App.tsx', status: 'modified', staged: false, indexStatus: ' ', workingDirStatus: 'M' },
      { path: 'src/utils.ts', status: 'modified', staged: true, indexStatus: 'M', workingDirStatus: ' ' },
      { path: 'src/new-file.ts', status: 'added', staged: true, indexStatus: 'A', workingDirStatus: ' ' },
      { path: 'README.md', status: 'untracked', staged: false, indexStatus: '?', workingDirStatus: '?' },
    ],
  },
}

export const WithIssue: Story = {
  args: {
    issueNumber: 42,
    issueTitle: 'Fix authentication bug',
    issueUrl: 'https://github.com/test/my-app/issues/42',
  },
}

export const Pushed: Story = {
  args: {
    branchStatus: 'pushed',
    syncStatus: { files: [], ahead: 0, behind: 0, tracking: 'origin/feature/test', current: 'feature/test', isMerging: false, hasConflicts: false },
  },
}
