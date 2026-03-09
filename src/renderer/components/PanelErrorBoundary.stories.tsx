import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import PanelErrorBoundary from './PanelErrorBoundary'

function ThrowingComponent(): React.ReactNode {
  throw new Error('Something went wrong in this panel')
}

function WorkingComponent() {
  return <div className="p-4 text-text-primary">Panel content renders normally</div>
}

const meta: Meta<typeof PanelErrorBoundary> = {
  title: 'UI/PanelErrorBoundary',
  component: PanelErrorBoundary,
}
export default meta
type Story = StoryObj<typeof PanelErrorBoundary>

export const ErrorState: Story = {
  args: {
    name: 'Explorer',
    children: <ThrowingComponent />,
  },
}

export const NormalState: Story = {
  args: {
    name: 'Explorer',
    children: <WorkingComponent />,
  },
}
