import type { Meta, StoryObj } from '@storybook/react'
import { HomeView } from './HomeView'
import { useRepoStore } from '../../store/repos'
import React from 'react'
import type { Decorator } from '@storybook/react'
import { makeRepo } from '../../../../.storybook/mockData'

const noop = () => {}
const noopRepo = () => {}

const withPopulatedRepos: Decorator = (Story) => {
  React.useEffect(() => {
    useRepoStore.setState({
      repos: [
        makeRepo({ id: 'repo-1', name: 'my-app', rootDir: '/Users/test/repos/my-app', defaultBranch: 'main' }),
        makeRepo({ id: 'repo-2', name: 'backend', rootDir: '/Users/test/repos/backend', defaultBranch: 'main' }),
      ],
      ghAvailable: true,
    })
  }, [])
  return <Story />
}

const withEmptyRepos: Decorator = (Story) => {
  React.useEffect(() => {
    useRepoStore.setState({
      repos: [],
      ghAvailable: true,
    })
  }, [])
  return <Story />
}

const withGhUnavailable: Decorator = (Story) => {
  React.useEffect(() => {
    useRepoStore.setState({
      repos: [
        makeRepo({ id: 'repo-1', name: 'my-app', rootDir: '/Users/test/repos/my-app', defaultBranch: 'main' }),
      ],
      ghAvailable: false,
    })
  }, [])
  return <Story />
}

const meta: Meta<typeof HomeView> = {
  title: 'NewSession/HomeView',
  component: HomeView,
  args: {
    onClone: noop,
    onAddExistingRepo: noop,
    onOpenFolder: noop,
    onNewBranch: noopRepo,
    onExistingBranch: noopRepo,
    onRepoSettings: noopRepo,
    onIssues: noopRepo,
    onReviewPrs: noopRepo,
    onOpenMain: noopRepo,
    onCancel: noop,
  },
}
export default meta
type Story = StoryObj<typeof HomeView>

export const Populated: Story = {
  decorators: [withPopulatedRepos],
}

export const Empty: Story = {
  decorators: [withEmptyRepos],
}

export const GhUnavailable: Story = {
  decorators: [withGhUnavailable],
}
