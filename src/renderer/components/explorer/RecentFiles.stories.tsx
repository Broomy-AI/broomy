import type { Meta, StoryObj } from '@storybook/react'
import { RecentFiles } from './RecentFiles'

const meta: Meta<typeof RecentFiles> = {
  title: 'Explorer/RecentFiles',
  component: RecentFiles,
  args: {
    onFileSelect: () => {},
    selectedFilePath: null,
    directory: '/Users/test/projects/my-app',
  },
}
export default meta
type Story = StoryObj<typeof RecentFiles>

export const Empty: Story = {
  args: {
    recentFiles: [],
  },
}

export const WithFiles: Story = {
  args: {
    recentFiles: [
      '/Users/test/projects/my-app/src/App.tsx',
      '/Users/test/projects/my-app/src/components/Dashboard.tsx',
      '/Users/test/projects/my-app/src/utils/helpers.ts',
      '/Users/test/projects/my-app/package.json',
      '/Users/test/projects/my-app/tsconfig.json',
    ],
  },
}

export const WithSelectedFile: Story = {
  args: {
    recentFiles: [
      '/Users/test/projects/my-app/src/App.tsx',
      '/Users/test/projects/my-app/src/index.ts',
      '/Users/test/projects/my-app/README.md',
    ],
    selectedFilePath: '/Users/test/projects/my-app/src/App.tsx',
  },
}
