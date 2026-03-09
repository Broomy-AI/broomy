import type { Meta, StoryObj } from '@storybook/react'
import { ShowWhenPicker } from './ShowWhenPicker'
import { useState } from 'react'

function ShowWhenPickerWrapper({ initial }: { initial: string[] }) {
  const [showWhen, setShowWhen] = useState(initial)
  return (
    <div style={{ width: 400 }} className="p-4 bg-bg-primary">
      <ShowWhenPicker showWhen={showWhen} onChange={setShowWhen} />
    </div>
  )
}

const meta: Meta<typeof ShowWhenPicker> = {
  title: 'UI/ShowWhenPicker',
  component: ShowWhenPicker,
}
export default meta
type Story = StoryObj<typeof ShowWhenPicker>

export const WithConditions: Story = {
  render: () => <ShowWhenPickerWrapper initial={['has-changes', '!on-main', 'ahead']} />,
}

export const Empty: Story = {
  render: () => <ShowWhenPickerWrapper initial={[]} />,
}

export const AllConditions: Story = {
  render: () => (
    <ShowWhenPickerWrapper
      initial={['has-changes', 'clean', 'merging', 'conflicts', 'no-tracking', 'ahead', 'behind']}
    />
  ),
}
