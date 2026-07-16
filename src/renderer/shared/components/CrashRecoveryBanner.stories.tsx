import type { Meta, StoryObj } from '@storybook/react'

/**
 * CrashRecoveryBanner relies on window.app.getCrashLog() returning truthy.
 * In the Storybook Electron mock environment getCrashLog returns null by default,
 * so we render a static replica of the banner for visual testing.
 */
function CrashRecoveryBannerStatic() {
  return (
    <div className="bg-danger-deep/30 border-b border-danger-base/30 px-4 py-2 text-xs text-danger-soft flex items-center gap-2">
      <span className="font-medium">Broomy crashed unexpectedly during your last session.</span>
      <button className="text-accent hover:underline ml-1">Report Issue</button>
      <button className="text-danger-fg hover:text-danger-soft ml-1">Dismiss</button>
    </div>
  )
}

const meta: Meta<typeof CrashRecoveryBannerStatic> = {
  title: 'UI/CrashRecoveryBanner',
  component: CrashRecoveryBannerStatic,
}
export default meta
type Story = StoryObj<typeof CrashRecoveryBannerStatic>

export const Visible: Story = {}
