import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import TerminalTabBar from './TerminalTabBar'
import { withDarkTheme } from '../../../.storybook/decorators'

const meta: Meta<typeof TerminalTabBar> = {
  title: 'Layout/TerminalTabBar',
  component: TerminalTabBar,
  decorators: [withDarkTheme],
}
export default meta
type Story = StoryObj<typeof TerminalTabBar>

const noop = () => {}
const noopEvent = (_e: React.MouseEvent | React.DragEvent | React.KeyboardEvent) => {}
const noopEventTab = (_e: React.MouseEvent | React.DragEvent, _tabId: string) => {}
const noopDragTab = (_e: React.DragEvent, _tabId: string) => {}
const noopTab = (_tabId: string) => {}

const defaultRefs = {
  editInputRef: React.createRef<HTMLInputElement>(),
  dropdownRef: React.createRef<HTMLDivElement>(),
  tabsContainerRef: React.createRef<HTMLDivElement>(),
}

const defaultHandlers = {
  handleTabClick: noopTab,
  handleCloseTab: noopEventTab as (e: React.MouseEvent, tabId: string) => void,
  handleContextMenu: noopEventTab as (e: React.MouseEvent, tabId: string) => void,
  handleDoubleClick: noopTab,
  handleDragStart: noopDragTab,
  handleDragEnd: noopEvent as (e: React.DragEvent) => void,
  handleDragOver: noopDragTab,
  handleDragLeave: noop,
  handleDrop: noopDragTab,
  handleRenameSubmit: noop,
  handleRenameKeyDown: noopEvent as (e: React.KeyboardEvent) => void,
  handleDropdownSelect: noopTab,
  handleAddTab: noop,
  setEditingName: noop as (name: string) => void,
  setShowDropdown: noop as (show: boolean) => void,
  ...defaultRefs,
}

export const SingleAgentTab: Story = {
  args: {
    tabs: [{ id: 'agent', name: 'Agent' }],
    activeTabId: 'agent',
    editingTabId: null,
    editingName: '',
    dragOverTabId: null,
    isOverflowing: false,
    showDropdown: false,
    agentTabId: 'agent',
    ...defaultHandlers,
  },
}

export const MultipleTabs: Story = {
  args: {
    ...SingleAgentTab.args,
    tabs: [
      { id: 'agent', name: 'Agent' },
      { id: 'tab-1', name: 'Terminal 1' },
      { id: 'tab-2', name: 'Terminal 2' },
    ],
    activeTabId: 'tab-1',
  },
}

export const ActiveAgentTab: Story = {
  args: {
    ...MultipleTabs.args,
    activeTabId: 'agent',
  },
}

export const EditingTab: Story = {
  args: {
    ...MultipleTabs.args,
    editingTabId: 'tab-1',
    editingName: 'My Terminal',
  },
}

export const WithIsolatedTab: Story = {
  args: {
    ...MultipleTabs.args,
    tabs: [
      { id: 'agent', name: 'Agent' },
      { id: 'tab-1', name: 'Terminal 1' },
      { id: 'tab-2', name: 'Container', isolated: true },
    ],
  },
}

export const OverflowingTabs: Story = {
  args: {
    ...SingleAgentTab.args,
    tabs: [
      { id: 'agent', name: 'Agent' },
      ...Array.from({ length: 10 }, (_, i) => ({
        id: `tab-${i}`,
        name: `Terminal ${i + 1}`,
      })),
    ],
    activeTabId: 'tab-3',
    isOverflowing: true,
  },
}

export const OverflowingWithDropdown: Story = {
  args: {
    ...OverflowingTabs.args,
    showDropdown: true,
  },
}

export const DragOverTab: Story = {
  args: {
    ...MultipleTabs.args,
    dragOverTabId: 'tab-2',
  },
}

export const WithFixedTabs: Story = {
  args: {
    ...SingleAgentTab.args,
    tabs: [
      { id: 'agent', name: 'Agent' },
      { id: '__services__', name: 'Services' },
      { id: '__docker__', name: '(container)' },
      { id: 'tab-1', name: 'Terminal 1' },
    ],
    activeTabId: 'agent',
    fixedTabIds: new Set(['__services__', '__docker__']),
  },
}
