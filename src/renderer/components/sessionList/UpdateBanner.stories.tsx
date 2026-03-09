import type { Meta, StoryObj } from '@storybook/react'

/**
 * UpdateBanner uses the useUpdateState hook which initializes from window.app/update.
 * We render static replicas of each state for visual testing.
 */
function UpdateBannerAvailable() {
  return (
    <div className="mx-2 mt-2 px-2.5 py-1.5 rounded bg-accent/10 border border-accent/20 flex items-center gap-2">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent flex-shrink-0">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4" />
        <path d="M12 8h.01" />
      </svg>
      <span className="text-xs text-text-primary flex-1 truncate">v2.1.0 available</span>
      <button className="text-[10px] font-medium text-accent hover:text-accent/80 transition-colors flex-shrink-0">View</button>
      <button className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-accent text-white hover:bg-accent/80 transition-colors flex-shrink-0">Update</button>
    </div>
  )
}

function UpdateBannerDownloading() {
  return (
    <div className="mx-2 mt-2 px-2.5 py-1.5 rounded bg-accent/10 border border-accent/20">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs text-text-secondary">Downloading...</span>
        <span className="text-[10px] text-text-tertiary ml-auto">65%</span>
      </div>
      <div className="w-full h-1 bg-bg-tertiary rounded-full overflow-hidden">
        <div className="h-full bg-accent rounded-full transition-all" style={{ width: '65%' }} />
      </div>
    </div>
  )
}

function UpdateBannerReady() {
  return (
    <div className="mx-2 mt-2 px-2.5 py-1.5 rounded bg-green-500/10 border border-green-500/20 flex items-center gap-2">
      <span className="text-xs text-text-primary flex-1">Ready to install</span>
      <button className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-green-600 text-white hover:bg-green-600/80 transition-colors flex-shrink-0">Restart</button>
    </div>
  )
}

const meta: Meta = {
  title: 'UI/UpdateBanner',
}
export default meta

export const Available: StoryObj = {
  render: () => <UpdateBannerAvailable />,
}

export const Downloading: StoryObj = {
  render: () => <UpdateBannerDownloading />,
}

export const Ready: StoryObj = {
  render: () => <UpdateBannerReady />,
}
