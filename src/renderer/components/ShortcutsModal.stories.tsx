import type { Meta, StoryObj } from '@storybook/react'
import ShortcutsModal from './ShortcutsModal'

const meta: Meta<typeof ShortcutsModal> = {
  title: 'UI/ShortcutsModal',
  component: ShortcutsModal,
}
export default meta
type Story = StoryObj<typeof ShortcutsModal>

export const Open: Story = {
  args: {
    onClose: () => console.log('Close'),
  },
}
