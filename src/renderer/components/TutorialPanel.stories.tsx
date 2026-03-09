import type { Meta, StoryObj } from '@storybook/react'
import TutorialPanel from './TutorialPanel'
import { useTutorialStore } from '../store/tutorial'
import type { Decorator } from '@storybook/react'

const withNoProgress: Decorator = (Story) => {
  useTutorialStore.setState({ completedSteps: [], isLoaded: true })
  return (
    <div style={{ width: 320, height: 600 }} className="border border-border">
      <Story />
    </div>
  )
}

const withSomeProgress: Decorator = (Story) => {
  useTutorialStore.setState({
    completedSteps: ['toggled-tutorial', 'created-session', 'viewed-explorer'],
    isLoaded: true,
  })
  return (
    <div style={{ width: 320, height: 600 }} className="border border-border">
      <Story />
    </div>
  )
}

const withAllComplete: Decorator = (Story) => {
  useTutorialStore.setState({
    completedSteps: [
      'toggled-tutorial', 'created-session', 'viewed-explorer', 'viewed-file',
      'viewed-recent-files', 'used-agent', 'used-terminal', 'toggled-panel',
      'learned-shortcuts', 'used-source-control', 'viewed-markdown',
      'compared-branch', 'archived-session', 'resolved-conflicts',
      'used-review', 'viewed-settings', 'contribute-extension',
    ],
    isLoaded: true,
  })
  return (
    <div style={{ width: 320, height: 600 }} className="border border-border">
      <Story />
    </div>
  )
}

const meta: Meta<typeof TutorialPanel> = {
  title: 'UI/TutorialPanel',
  component: TutorialPanel,
}
export default meta
type Story = StoryObj<typeof TutorialPanel>

export const NoProgress: Story = {
  decorators: [withNoProgress],
}

export const SomeProgress: Story = {
  decorators: [withSomeProgress],
}

export const AllComplete: Story = {
  decorators: [withAllComplete],
}
