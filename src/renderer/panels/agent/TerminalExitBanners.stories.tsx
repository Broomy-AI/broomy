import type { Meta, StoryObj } from '@storybook/react'
import { AgentExitBanner, ExitErrorBanner } from './TerminalExitBanners'

/** The banners shown above a terminal after its process exits (Terminal.tsx renders them from the hook's exitInfo). */
const meta: Meta = {
  title: 'Layout/TerminalExitBanners',
  decorators: [
    (Story) => (
      <div className="bg-bg-primary text-text-primary flex flex-col" style={{ width: 800, height: 120 }}>
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj

const noop = () => {}

export const AgentExited: Story = {
  render: () => <AgentExitBanner exitInfo={{ code: 0, message: 'Agent process has exited.' }} onRestart={noop} onDismiss={noop} />,
}

export const AgentExitedWithCode: Story = {
  render: () => <AgentExitBanner exitInfo={{ code: 1, message: 'Agent process exited with code 1.' }} onRestart={noop} onDismiss={noop} />,
}

export const ExitErrorWithDetail: Story = {
  render: () => (
    <ExitErrorBanner
      exitInfo={{
        code: 137,
        message: 'Agent killed by Docker out-of-memory killer (SIGKILL)',
        detail: 'Docker Desktop runs all containers in a shared Linux VM with a fixed memory ceiling.',
      }}
      onDismiss={noop}
    />
  ),
}
