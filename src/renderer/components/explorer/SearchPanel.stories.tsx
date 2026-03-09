import type { Meta, StoryObj } from '@storybook/react'
import { SearchPanel } from './SearchPanel'

const meta: Meta<typeof SearchPanel> = {
  title: 'Explorer/SearchPanel',
  component: SearchPanel,
  args: {
    directory: '/Users/test/projects/my-app',
    onFileSelect: () => {},
  },
}
export default meta
type Story = StoryObj<typeof SearchPanel>

export const Empty: Story = {
  args: {},
}

export const NoDirectory: Story = {
  args: {
    directory: undefined,
  },
}
