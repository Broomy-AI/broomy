import type { Meta, StoryObj } from '@storybook/react'
import ErrorDetailModal from './ErrorDetailModal'
import { useErrorStore } from '../store/errors'
import type { Decorator } from '@storybook/react'

const withErrorDetail: Decorator = (Story) => {
  useErrorStore.setState({
    detailError: {
      id: 'error-1',
      message: 'Command failed with exit code 128: git worktree add /path/to/worktree feature-branch',
      displayMessage: 'Failed to create worktree',
      detail: 'fatal: \'feature-branch\' is already checked out at \'/Users/test/projects/my-app\'\n\nStack trace:\n  at GitWorktreeManager.add (src/main/git.ts:142:5)\n  at IpcHandler.handle (src/main/ipc.ts:89:12)\n  at processTicksAndRejections (node:internal/process/task_queues:95:5)',
      scope: 'app',
      dismissed: false,
      timestamp: Date.now(),
    },
  })
  return <Story />
}

const withErrorNoDetail: Decorator = (Story) => {
  useErrorStore.setState({
    detailError: {
      id: 'error-2',
      message: 'Network connection lost',
      displayMessage: 'Network connection lost',
      scope: 'app',
      dismissed: false,
      timestamp: Date.now(),
    },
  })
  return <Story />
}

const meta: Meta<typeof ErrorDetailModal> = {
  title: 'UI/ErrorDetailModal',
  component: ErrorDetailModal,
}
export default meta
type Story = StoryObj<typeof ErrorDetailModal>

export const WithStackTrace: Story = {
  decorators: [withErrorDetail],
}

export const WithoutDetail: Story = {
  decorators: [withErrorNoDetail],
}
