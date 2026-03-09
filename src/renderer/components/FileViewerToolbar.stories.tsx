import type { Meta, StoryObj } from '@storybook/react'
import FileViewerToolbar from './FileViewerToolbar'
import { withDarkTheme } from '../../../.storybook/decorators'

const meta: Meta<typeof FileViewerToolbar> = {
  title: 'FileViewer/FileViewerToolbar',
  component: FileViewerToolbar,
  decorators: [withDarkTheme],
}
export default meta
type Story = StoryObj<typeof FileViewerToolbar>

const noop = () => {}

export const LatestMode: Story = {
  args: {
    fileName: 'index.ts',
    filePath: '/Users/test/projects/my-app/src/index.ts',
    directory: '/Users/test/projects/my-app',
    isDirty: false,
    isSaving: false,
    viewMode: 'latest',
    diffSideBySide: false,
    editorActions: null,
    availableViewers: [],
    selectedViewerId: 'monaco',
    canShowDiff: false,
    position: 'top',
    onSaveButton: noop,
    onSetDiffSideBySide: noop,
    onSelectViewer: noop,
    onSetViewMode: noop,
    onClose: noop,
    onPositionChange: noop,
  },
}

export const DirtyFile: Story = {
  args: {
    ...LatestMode.args,
    isDirty: true,
  },
}

export const Saving: Story = {
  args: {
    ...LatestMode.args,
    isDirty: true,
    isSaving: true,
  },
}

export const DiffMode: Story = {
  args: {
    ...LatestMode.args,
    viewMode: 'diff',
    canShowDiff: true,
    diffSideBySide: false,
    fileStatus: 'modified',
  },
}

export const DiffSideBySide: Story = {
  args: {
    ...LatestMode.args,
    viewMode: 'diff',
    canShowDiff: true,
    diffSideBySide: true,
    fileStatus: 'modified',
  },
}

export const DeletedFileStatus: Story = {
  args: {
    ...LatestMode.args,
    fileStatus: 'deleted',
  },
}

export const WithDiffLabel: Story = {
  args: {
    ...LatestMode.args,
    viewMode: 'diff',
    canShowDiff: true,
    diffLabel: 'abc1234: Fix rendering bug',
    fileStatus: 'modified',
  },
}

export const WithPrFilesUrl: Story = {
  args: {
    ...LatestMode.args,
    viewMode: 'diff',
    canShowDiff: true,
    fileStatus: 'modified',
    prFilesUrl: 'https://github.com/test/my-app/pull/42',
  },
}

export const PositionLeft: Story = {
  args: {
    ...LatestMode.args,
    position: 'left',
  },
}

export const WithMultipleViewers: Story = {
  args: {
    ...LatestMode.args,
    availableViewers: [
      { id: 'markdown', name: 'Preview', canHandle: () => true, priority: 50, component: () => null },
      { id: 'monaco', name: 'Code', canHandle: () => true, priority: 10, component: () => null },
    ],
    selectedViewerId: 'markdown',
    canShowDiff: true,
  },
}

export const WithEditorActions: Story = {
  args: {
    ...LatestMode.args,
    editorActions: { showOutline: noop },
  },
}
