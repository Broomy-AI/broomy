import type { Meta, StoryObj } from '@storybook/react'
import { StagePill } from './StagePill'

const meta: Meta<typeof StagePill> = {
  title: 'Commands/StagePill',
  component: StagePill,
}
export default meta
type Story = StoryObj<typeof StagePill>

export const Default: Story = {
  args: {
    currentStage: 'planning',
    allStages: ['new', 'building', 'planning', 'verifying'],
    onSelect: () => undefined,
  },
}
