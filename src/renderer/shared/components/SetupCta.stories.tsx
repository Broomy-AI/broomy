import type { Meta, StoryObj } from '@storybook/react'
import { SetupCta } from './SetupCta'

const meta: Meta<typeof SetupCta> = {
  title: 'Commands/SetupCta',
  component: SetupCta,
}
export default meta
type Story = StoryObj<typeof SetupCta>

export const Default: Story = { args: { onSetup: () => undefined, onStartBlank: () => undefined } }
