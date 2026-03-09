import type { Meta, StoryObj } from '@storybook/react'
import { SCViewToggle } from './SCViewToggle'

const meta: Meta<typeof SCViewToggle> = {
  title: 'Explorer/SCViewToggle',
  component: SCViewToggle,
  args: {
    setScView: () => {},
  },
}
export default meta
type Story = StoryObj<typeof SCViewToggle>

export const WorkingSelected: Story = {
  args: {
    scView: 'working',
  },
}

export const BranchSelected: Story = {
  args: {
    scView: 'branch',
  },
}

export const CommitsSelected: Story = {
  args: {
    scView: 'commits',
  },
}
