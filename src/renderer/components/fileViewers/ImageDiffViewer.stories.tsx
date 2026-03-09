import type { Meta, StoryObj } from '@storybook/react'
import ImageDiffViewer from './ImageDiffViewer'

const meta: Meta<typeof ImageDiffViewer> = {
  title: 'FileViewer/ImageDiffViewer',
  component: ImageDiffViewer,
  decorators: [
    (Story) => (
      <div className="bg-bg-primary text-text-primary" style={{ width: 800, height: 400 }}>
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof ImageDiffViewer>

export const ModifiedImage: Story = {
  args: {
    filePath: '/Users/test/projects/my-app/logo.png',
    directory: '/Users/test/projects/my-app',
    fileStatus: 'modified',
  },
}

export const AddedImage: Story = {
  args: {
    filePath: '/Users/test/projects/my-app/new-icon.png',
    directory: '/Users/test/projects/my-app',
    fileStatus: 'added',
  },
}

export const DeletedImage: Story = {
  args: {
    filePath: '/Users/test/projects/my-app/old-icon.png',
    directory: '/Users/test/projects/my-app',
    fileStatus: 'deleted',
  },
}

export const UntrackedImage: Story = {
  args: {
    filePath: '/Users/test/projects/my-app/screenshot.png',
    directory: '/Users/test/projects/my-app',
    fileStatus: 'untracked',
  },
}

export const WithDiffBaseRef: Story = {
  args: {
    filePath: '/Users/test/projects/my-app/logo.png',
    directory: '/Users/test/projects/my-app',
    fileStatus: 'modified',
    diffBaseRef: 'origin/main',
  },
}

export const WithDiffCurrentRef: Story = {
  args: {
    filePath: '/Users/test/projects/my-app/logo.png',
    directory: '/Users/test/projects/my-app',
    fileStatus: 'modified',
    diffBaseRef: 'origin/main',
    diffCurrentRef: 'abc1234',
  },
}
