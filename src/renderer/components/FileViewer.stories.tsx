import type { Meta, StoryObj } from '@storybook/react'
import FileViewer from './FileViewer'
import { withDarkTheme } from '../../../.storybook/decorators'

const meta: Meta<typeof FileViewer> = {
  title: 'FileViewer/FileViewer',
  component: FileViewer,
  decorators: [
    withDarkTheme,
  ],
}
export default meta
type Story = StoryObj<typeof FileViewer>

export const NoFileSelected: Story = {
  args: {
    filePath: null,
  },
}

export const TextFile: Story = {
  args: {
    filePath: '/Users/test/projects/my-app/src/index.ts',
    position: 'top',
    directory: '/Users/test/projects/my-app',
    onClose: () => {},
    onPositionChange: () => {},
  },
}

export const ImageFile: Story = {
  args: {
    filePath: '/Users/test/projects/my-app/logo.png',
    position: 'top',
    directory: '/Users/test/projects/my-app',
    onClose: () => {},
  },
}

export const DiffMode: Story = {
  args: {
    filePath: '/Users/test/projects/my-app/src/utils.ts',
    position: 'top',
    directory: '/Users/test/projects/my-app',
    fileStatus: 'modified',
    initialViewMode: 'diff',
    diffBaseRef: 'origin/main',
    onClose: () => {},
  },
}

export const PositionLeft: Story = {
  args: {
    filePath: '/Users/test/projects/my-app/src/index.ts',
    position: 'left',
    directory: '/Users/test/projects/my-app',
    onClose: () => {},
    onPositionChange: () => {},
  },
}

export const DeletedFile: Story = {
  args: {
    filePath: '/Users/test/projects/my-app/src/removed.ts',
    position: 'top',
    directory: '/Users/test/projects/my-app',
    fileStatus: 'deleted',
    onClose: () => {},
  },
}

export const WithDiffLabel: Story = {
  args: {
    filePath: '/Users/test/projects/my-app/src/utils.ts',
    position: 'top',
    directory: '/Users/test/projects/my-app',
    fileStatus: 'modified',
    initialViewMode: 'diff',
    diffLabel: 'abc1234: Fix rendering bug',
    onClose: () => {},
  },
}

export const WithScrollToLine: Story = {
  args: {
    filePath: '/Users/test/projects/my-app/src/index.ts',
    position: 'top',
    directory: '/Users/test/projects/my-app',
    scrollToLine: 42,
    onClose: () => {},
  },
}
