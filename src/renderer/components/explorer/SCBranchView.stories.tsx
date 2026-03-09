import type { Meta, StoryObj } from '@storybook/react'
import { SCBranchView } from './SCBranchView'

const meta: Meta<typeof SCBranchView> = {
  title: 'Explorer/SCBranchView',
  component: SCBranchView,
  args: {
    directory: '/Users/test/projects/my-app',
    branchBaseName: 'main',
    branchMergeBase: 'abc1234',
    onFileSelect: () => {},
    isBranchLoading: false,
    branchChanges: [],
  },
}
export default meta
type Story = StoryObj<typeof SCBranchView>

export const NoChanges: Story = {
  args: {
    branchChanges: [],
  },
}

export const WithChanges: Story = {
  args: {
    branchChanges: [
      { path: 'src/App.tsx', status: 'modified' },
      { path: 'src/components/Dashboard.tsx', status: 'added' },
      { path: 'src/utils/old.ts', status: 'deleted' },
      { path: 'package.json', status: 'modified' },
    ],
  },
}

export const Loading: Story = {
  args: {
    isBranchLoading: true,
  },
}

export const ManyChanges: Story = {
  args: {
    branchChanges: [
      { path: 'src/App.tsx', status: 'modified' },
      { path: 'src/index.ts', status: 'modified' },
      { path: 'src/components/Header.tsx', status: 'added' },
      { path: 'src/components/Footer.tsx', status: 'added' },
      { path: 'src/components/Sidebar.tsx', status: 'added' },
      { path: 'src/utils/helpers.ts', status: 'modified' },
      { path: 'src/utils/format.ts', status: 'added' },
      { path: 'src/hooks/useAuth.ts', status: 'added' },
      { path: 'src/types.ts', status: 'modified' },
      { path: 'tests/App.test.tsx', status: 'added' },
    ],
  },
}
