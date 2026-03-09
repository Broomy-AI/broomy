import type { Meta, StoryObj } from '@storybook/react'
import { IssuesView } from './IssuesView'
import { makeRepo } from '../../../../.storybook/mockData'

const repo = makeRepo({ id: 'repo-1', name: 'my-app', rootDir: '/Users/test/repos/my-app', defaultBranch: 'main' })

const meta: Meta<typeof IssuesView> = {
  title: 'NewSession/IssuesView',
  component: IssuesView,
}
export default meta
type Story = StoryObj<typeof IssuesView>

export const Default: Story = {
  args: {
    repo,
    onBack: () => console.log('Back'),
    onSelectIssue: (issue) => console.log('Select issue:', issue),
  },
}
