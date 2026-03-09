import type { Meta, StoryObj } from '@storybook/react'

/**
 * ContainerInfoPanel calls window.devcontainer.containerInfo() on mount.
 * We render static replicas of the different states for visual testing.
 */
function ContainerInfoRunning() {
  return (
    <div className="h-full overflow-auto p-4 text-sm text-zinc-300 bg-zinc-900" style={{ width: 400, height: 400 }}>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-4">Dev Container Isolation</h3>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-zinc-500">Status:</span>
          <span className="font-medium text-green-400">running</span>
        </div>
        <div>
          <span className="text-zinc-500">Container ID: </span>
          <code className="text-zinc-400 font-mono text-xs">abc123def456</code>
        </div>
        <div>
          <span className="text-zinc-500">Repo: </span>
          <code className="text-zinc-400 font-mono text-xs">/Users/test/projects/my-app</code>
        </div>
        <div>
          <span className="text-zinc-500">Mode: </span>
          <span className="text-zinc-400 text-xs">Dev Container (.devcontainer/devcontainer.json)</span>
        </div>
        <div className="border-t border-zinc-800 pt-3 flex gap-2">
          <button className="px-3 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-300 transition-colors">
            Refresh
          </button>
          <button className="px-3 py-1 text-xs bg-red-900/50 hover:bg-red-900/80 rounded text-red-300 transition-colors">
            Rebuild Container
          </button>
        </div>
        <div className="border-t border-zinc-800 pt-3">
          <p className="text-zinc-500 text-xs leading-relaxed">
            This session runs inside a dev container defined by .devcontainer/devcontainer.json. Edit that file to customize the container environment.
          </p>
        </div>
      </div>
    </div>
  )
}

function ContainerInfoStopped() {
  return (
    <div className="h-full overflow-auto p-4 text-sm text-zinc-300 bg-zinc-900" style={{ width: 400, height: 400 }}>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-4">Dev Container Isolation</h3>
      <p className="text-zinc-500">No container running for this session. The container will start when the agent terminal is opened.</p>
    </div>
  )
}

const meta: Meta = {
  title: 'UI/ContainerInfoPanel',
}
export default meta

export const Running: StoryObj = {
  render: () => <ContainerInfoRunning />,
}

export const NoContainer: StoryObj = {
  render: () => <ContainerInfoStopped />,
}
