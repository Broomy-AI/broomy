import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import Layout from './Layout'
import { withPanelProvider, withDarkTheme } from '../../../.storybook/decorators'

const meta: Meta<typeof Layout> = {
  title: 'Layout/Layout',
  component: Layout,
  decorators: [withPanelProvider, withDarkTheme],
}
export default meta
type Story = StoryObj<typeof Layout>

const noop = () => {}

const defaultLayoutSizes = {
  explorerWidth: 260,
  fileViewerSize: 300,
  userTerminalHeight: 200,
  diffPanelWidth: 400,
  tutorialPanelWidth: 300,
}

const mockPanels: Record<string, React.ReactNode> = {
  sidebar: (
    <div className="p-3 text-xs text-text-secondary">
      <div className="mb-2 font-medium text-text-primary">Sessions</div>
      <div className="space-y-1">
        <div className="px-2 py-1.5 rounded bg-accent/20 text-accent text-xs">feature/auth</div>
        <div className="px-2 py-1.5 rounded hover:bg-bg-tertiary text-xs">fix/rendering</div>
        <div className="px-2 py-1.5 rounded hover:bg-bg-tertiary text-xs">refactor/store</div>
      </div>
    </div>
  ),
  explorer: (
    <div className="p-3 text-xs text-text-secondary">
      <div className="mb-2 font-medium text-text-primary">Files</div>
      <div className="space-y-0.5 pl-2">
        <div>src/</div>
        <div className="pl-3">index.ts</div>
        <div className="pl-3">App.tsx</div>
        <div className="pl-3">store/</div>
      </div>
    </div>
  ),
  fileViewer: (
    <div className="h-full flex items-center justify-center text-text-secondary text-sm">
      File viewer area
    </div>
  ),
  terminal: (
    <div className="h-full flex items-center justify-center text-text-secondary text-sm bg-bg-primary">
      Terminal area
    </div>
  ),
  settings: (
    <div className="h-full flex items-center justify-center text-text-secondary text-sm">
      Settings panel
    </div>
  ),
  tutorial: (
    <div className="p-3 text-xs text-text-secondary">
      <div className="mb-2 font-medium text-text-primary">Tutorial</div>
      <p>Getting started guide content here.</p>
    </div>
  ),
}

export const Default: Story = {
  args: {
    panels: mockPanels,
    panelVisibility: { explorer: true, fileViewer: false, agent: true },
    globalPanelVisibility: { sidebar: true, settings: false, tutorial: false },
    fileViewerPosition: 'top',
    sidebarWidth: 200,
    layoutSizes: defaultLayoutSizes,
    onSidebarWidthChange: noop,
    onLayoutSizeChange: noop,
    onTogglePanel: noop,
    onToggleGlobalPanel: noop,
    platform: 'darwin',
  },
}

export const WithFileViewer: Story = {
  args: {
    ...Default.args,
    panelVisibility: { explorer: true, fileViewer: true, agent: true },
  },
}

export const FileViewerLeft: Story = {
  args: {
    ...Default.args,
    panelVisibility: { explorer: true, fileViewer: true, agent: true },
    fileViewerPosition: 'left',
  },
}

export const WithSettings: Story = {
  args: {
    ...Default.args,
    globalPanelVisibility: { sidebar: true, settings: true, tutorial: false },
  },
}

export const WithTutorial: Story = {
  args: {
    ...Default.args,
    globalPanelVisibility: { sidebar: true, settings: false, tutorial: true },
  },
}

export const WithErrorMessage: Story = {
  args: {
    ...Default.args,
    errorMessage: 'Session configuration is invalid. Please check your settings.',
  },
}

export const SidebarHidden: Story = {
  args: {
    ...Default.args,
    globalPanelVisibility: { sidebar: false, settings: false, tutorial: false },
  },
}

export const AllPanelsVisible: Story = {
  args: {
    ...Default.args,
    panelVisibility: { explorer: true, fileViewer: true, agent: true },
    globalPanelVisibility: { sidebar: true, settings: false, tutorial: true },
  },
}

export const WithTopBanner: Story = {
  args: {
    ...Default.args,
    topBanner: (
      <div className="px-4 py-2 bg-yellow-500/10 border-b border-yellow-500/30 text-xs text-yellow-300">
        Update available: v2.0.0. Restart to apply.
      </div>
    ),
  },
}

export const CustomTitle: Story = {
  args: {
    ...Default.args,
    title: 'My Workspace',
  },
}

export const LinuxPlatform: Story = {
  args: {
    ...Default.args,
    platform: 'linux',
  },
}
