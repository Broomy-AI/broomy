import type { Meta, StoryObj } from '@storybook/react'
import ReviewPanel from './index'
import { makeSession } from '../../../../.storybook/mockData'

const meta: Meta<typeof ReviewPanel> = {
  title: 'Review/ReviewPanel',
  component: ReviewPanel,
  decorators: [
    (Story) => (
      <div className="bg-bg-primary text-text-primary" style={{ width: 400, height: 600 }}>
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof ReviewPanel>

const noop = () => {}

const baseSession = makeSession({
  id: 'review-session-1',
  sessionType: 'review',
  prNumber: 42,
  prTitle: 'Add authentication flow',
  prUrl: 'https://github.com/test/my-app/pull/42',
  prBaseBranch: 'main',
  directory: '/Users/test/projects/my-app',
})

export const Default: Story = {
  args: {
    session: baseSession,
    onSelectFile: noop,
  },
}

export const WithPrInfo: Story = {
  args: {
    session: baseSession,
    onSelectFile: noop,
    repo: {
      id: 'repo-1',
      name: 'my-app',
      remoteUrl: 'https://github.com/test/my-app.git',
      rootDir: '/Users/test/projects/my-app',
      defaultBranch: 'main',
    },
    branchStatus: 'open',
  },
}

export const NoPrTitle: Story = {
  args: {
    session: makeSession({
      id: 'review-session-2',
      sessionType: 'review',
      directory: '/Users/test/projects/my-app',
    }),
    onSelectFile: noop,
  },
}

export const WithGitStatus: Story = {
  args: {
    session: baseSession,
    onSelectFile: noop,
    gitStatus: [
      { path: 'src/auth.ts', status: 'modified', staged: true, indexStatus: 'M', workingDirStatus: ' ' },
      { path: 'src/login.tsx', status: 'added', staged: true, indexStatus: 'A', workingDirStatus: ' ' },
      { path: 'tests/auth.test.ts', status: 'added', staged: true, indexStatus: 'A', workingDirStatus: ' ' },
    ],
    syncStatus: {
      files: [],
      ahead: 2,
      behind: 0,
      tracking: 'origin/feature/auth',
      current: 'feature/auth',
      isMerging: false,
    },
    branchStatus: 'open',
    onGitStatusRefresh: noop,
  },
}
