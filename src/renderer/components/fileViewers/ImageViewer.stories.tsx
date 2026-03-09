import type { Meta, StoryObj } from '@storybook/react'
import { ImageViewer } from './ImageViewer'

const ImageViewerComponent = ImageViewer.component

const meta: Meta<typeof ImageViewerComponent> = {
  title: 'FileViewer/ImageViewer',
  component: ImageViewerComponent,
  decorators: [
    (Story) => (
      <div className="bg-bg-primary text-text-primary" style={{ width: 600, height: 400 }}>
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof ImageViewerComponent>

export const PngImage: Story = {
  args: {
    filePath: '/Users/test/projects/my-app/logo.png',
    content: '',
  },
}

export const SvgImage: Story = {
  args: {
    filePath: '/Users/test/projects/my-app/icon.svg',
    content: '',
  },
}

export const JpegImage: Story = {
  args: {
    filePath: '/Users/test/projects/my-app/photo.jpg',
    content: '',
  },
}
