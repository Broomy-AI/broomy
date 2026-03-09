import type { Meta, StoryObj } from '@storybook/react'
import { WebviewViewer } from './WebviewViewer'

/**
 * WebviewViewer uses Electron's <webview> tag which is not available in Storybook.
 * These stories show the component structure but the webview will not render.
 */
const WebviewViewerComponent = WebviewViewer.component

const meta: Meta<typeof WebviewViewerComponent> = {
  title: 'FileViewer/WebviewViewer',
  component: WebviewViewerComponent,
  decorators: [
    (Story) => (
      <div className="bg-bg-primary text-text-primary" style={{ width: 800, height: 500 }}>
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof WebviewViewerComponent>

export const GitHubPr: Story = {
  args: {
    filePath: 'https://github.com/test/my-app/pull/42',
    content: '',
  },
}

export const Documentation: Story = {
  args: {
    filePath: 'https://docs.example.com/getting-started',
    content: '',
  },
}
