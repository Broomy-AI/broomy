import type { Meta, StoryObj } from '@storybook/react'
import { Divider } from './Divider'

const meta: Meta<typeof Divider> = {
  title: 'UI/Divider',
  component: Divider,
  decorators: [
    (Story) => (
      <div className="bg-bg-primary p-8" style={{ width: 400, height: 300 }}>
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof Divider>

export const Horizontal: Story = {
  args: {
    type: 'explorer',
    direction: 'horizontal',
    draggingDivider: null,
    onMouseDown: () => () => {},
  },
  decorators: [
    (Story) => (
      <div className="flex flex-col gap-0" style={{ height: 200 }}>
        <div className="h-20 bg-bg-secondary rounded" />
        <Story />
        <div className="h-20 bg-bg-secondary rounded" />
      </div>
    ),
  ],
}

export const Vertical: Story = {
  args: {
    type: 'sidebar',
    direction: 'vertical',
    draggingDivider: null,
    onMouseDown: () => () => {},
  },
  decorators: [
    (Story) => (
      <div className="flex gap-0" style={{ height: 200 }}>
        <div className="w-40 bg-bg-secondary rounded" />
        <Story />
        <div className="w-40 bg-bg-secondary rounded" />
      </div>
    ),
  ],
}

export const VerticalDragging: Story = {
  args: {
    type: 'sidebar',
    direction: 'vertical',
    draggingDivider: 'sidebar',
    onMouseDown: () => () => {},
  },
  decorators: [
    (Story) => (
      <div className="flex gap-0" style={{ height: 200 }}>
        <div className="w-40 bg-bg-secondary rounded" />
        <Story />
        <div className="w-40 bg-bg-secondary rounded" />
      </div>
    ),
  ],
}
