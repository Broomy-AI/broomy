import type { Meta, StoryObj } from '@storybook/react'
import PanelPicker from './PanelPicker'
import { withPanelProvider } from '../../../.storybook/decorators'
import { DEFAULT_TOOLBAR_PANELS } from '../panels/types'

const meta: Meta<typeof PanelPicker> = {
  title: 'UI/PanelPicker',
  component: PanelPicker,
  decorators: [withPanelProvider],
}
export default meta
type Story = StoryObj<typeof PanelPicker>

export const WithPanels: Story = {
  args: {
    toolbarPanels: [...DEFAULT_TOOLBAR_PANELS],
    onToolbarPanelsChange: (panels: string[]) => console.log('Changed', panels),
    onClose: () => console.log('Close'),
  },
}

export const EmptyToolbar: Story = {
  args: {
    toolbarPanels: [],
    onToolbarPanelsChange: (panels: string[]) => console.log('Changed', panels),
    onClose: () => console.log('Close'),
  },
}
