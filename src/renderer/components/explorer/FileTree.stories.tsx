import type { Meta, StoryObj } from '@storybook/react'
import { FileTree } from './FileTree'

const meta: Meta<typeof FileTree> = {
  title: 'Explorer/FileTree',
  component: FileTree,
  args: {
    onFileSelect: () => {},
    selectedFilePath: null,
    gitStatus: [],
  },
}
export default meta
type Story = StoryObj<typeof FileTree>

export const Empty: Story = {
  args: {
    directory: '/Users/test/projects/empty-dir',
  },
}

export const WithFiles: Story = {
  args: {
    directory: '/Users/test/projects/my-app',
  },
}

export const WithGitStatus: Story = {
  args: {
    directory: '/Users/test/projects/my-app',
    gitStatus: [
      { path: 'src/App.tsx', status: 'modified', staged: false, indexStatus: ' ', workingDirStatus: 'M' },
      { path: 'src/new-file.ts', status: 'added', staged: true, indexStatus: 'A', workingDirStatus: ' ' },
      { path: 'src/old-file.ts', status: 'deleted', staged: false, indexStatus: ' ', workingDirStatus: 'D' },
      { path: 'src/untracked.ts', status: 'untracked', staged: false, indexStatus: '?', workingDirStatus: '?' },
    ],
  },
}

export const NoDirectory: Story = {
  args: {
    directory: undefined,
  },
}
