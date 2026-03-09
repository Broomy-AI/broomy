import type { Meta, StoryObj } from '@storybook/react'
import DeleteSessionDialog from './DeleteSessionDialog'
import { makeSession, makeRepo } from '../../../../.storybook/mockData'

const session = makeSession({
  name: 'Add login page',
  branch: 'feature/login',
  repoId: 'repo-1',
  branchStatus: 'in-progress',
})

const repos = [
  makeRepo({ id: 'repo-1', name: 'my-app', defaultBranch: 'main' }),
]

const meta: Meta<typeof DeleteSessionDialog> = {
  title: 'UI/DeleteSessionDialog',
  component: DeleteSessionDialog,
}
export default meta
type Story = StoryObj<typeof DeleteSessionDialog>

export const Default: Story = {
  args: {
    session,
    repos,
    deleteWorktree: false,
    setDeleteWorktree: () => {},
    onConfirm: () => console.log('Confirmed'),
    onCancel: () => console.log('Cancelled'),
  },
}

export const WithWorktreeDelete: Story = {
  args: {
    session,
    repos,
    deleteWorktree: true,
    setDeleteWorktree: () => {},
    onConfirm: () => console.log('Confirmed'),
    onCancel: () => console.log('Cancelled'),
  },
}

export const SafeToDelete: Story = {
  args: {
    session: makeSession({
      name: 'Merged feature',
      branch: 'feature/merged',
      repoId: 'repo-1',
      branchStatus: 'merged',
    }),
    repos,
    deleteWorktree: true,
    setDeleteWorktree: () => {},
    onConfirm: () => console.log('Confirmed'),
    onCancel: () => console.log('Cancelled'),
  },
}
