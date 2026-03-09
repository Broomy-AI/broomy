import type { Meta, StoryObj } from '@storybook/react'

/**
 * ExperimentalPlatformModal checks window.app.platform() on mount and only
 * renders for 'win32' or 'linux'. Since Storybook mocks return 'darwin',
 * we render a static replica for visual testing.
 */
function ExperimentalPlatformModalStatic({ platformName }: { platformName: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-bg-secondary border border-border rounded-lg shadow-xl p-5 max-w-md mx-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
            Experimental
          </span>
          <h3 className="text-sm font-medium text-text-primary">
            {platformName} Support
          </h3>
        </div>
        <p className="text-xs text-text-secondary mb-4 leading-relaxed">
          Broomy on {platformName} is still experimental. You may encounter
          bugs or missing features. If you run into any issues, please let us
          know on GitHub.
        </p>
        <div className="flex items-center justify-between">
          <button className="text-xs text-accent hover:underline">
            Report an issue
          </button>
          <button className="px-3 py-1.5 text-xs rounded bg-accent text-white hover:bg-accent/80 transition-colors">
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}

const meta: Meta<typeof ExperimentalPlatformModalStatic> = {
  title: 'UI/ExperimentalPlatformModal',
  component: ExperimentalPlatformModalStatic,
}
export default meta
type Story = StoryObj<typeof ExperimentalPlatformModalStatic>

export const Windows: Story = {
  args: {
    platformName: 'Windows',
  },
}

export const Linux: Story = {
  args: {
    platformName: 'Linux',
  },
}
