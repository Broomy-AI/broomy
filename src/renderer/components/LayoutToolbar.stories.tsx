import type { Meta, StoryObj } from '@storybook/react'
import LayoutToolbar from './LayoutToolbar'
import { withPanelProvider, withDarkTheme } from '../../../.storybook/decorators'

const meta: Meta<typeof LayoutToolbar> = {
  title: 'Layout/LayoutToolbar',
  component: LayoutToolbar,
  decorators: [withPanelProvider, withDarkTheme],
}
export default meta
type Story = StoryObj<typeof LayoutToolbar>

const noop = () => {}

const sidebarIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="9" y1="3" x2="9" y2="21" />
  </svg>
)

const explorerIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
  </svg>
)

const settingsIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
  </svg>
)

const mockToolbarPanels = [
  {
    id: 'sidebar',
    name: 'Sessions',
    icon: sidebarIcon,
    position: 'sidebar' as const,
    defaultVisible: true,
    defaultInToolbar: true,
    shortcutKey: '1',
    isVisible: true,
  },
  {
    id: 'explorer',
    name: 'Explorer',
    icon: explorerIcon,
    position: 'left' as const,
    defaultVisible: true,
    defaultInToolbar: true,
    shortcutKey: '2',
    isVisible: true,
  },
  {
    id: 'settings',
    name: 'Settings',
    icon: settingsIcon,
    position: 'overlay' as const,
    defaultVisible: false,
    defaultInToolbar: true,
    shortcutKey: null,
    isVisible: false,
  },
]

export const Default: Story = {
  args: {
    title: 'Broomy',
    isDev: false,
    platform: 'darwin',
    toolbarPanelInfo: mockToolbarPanels,
    onToggle: noop,
    settingsPanelId: 'settings',
  },
}

export const DevMode: Story = {
  args: {
    ...Default.args,
    isDev: true,
  },
}

export const WithPanelPicker: Story = {
  args: {
    ...Default.args,
    onOpenPanelPicker: noop,
  },
}

export const WithMenuButton: Story = {
  args: {
    ...Default.args,
    onMenuButtonClick: noop,
  },
}

export const LinuxPlatform: Story = {
  args: {
    ...Default.args,
    platform: 'linux',
  },
}

export const WindowsPlatform: Story = {
  args: {
    ...Default.args,
    platform: 'win32',
  },
}

export const AllPanelsHidden: Story = {
  args: {
    ...Default.args,
    toolbarPanelInfo: mockToolbarPanels.map(p => ({ ...p, isVisible: false })),
  },
}

export const CustomTitle: Story = {
  args: {
    ...Default.args,
    title: 'My Workspace',
  },
}
