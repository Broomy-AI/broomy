import type { Meta, StoryObj, Decorator } from '@storybook/react'
import { StatusIndicator } from './StatusIndicator'
import { useSettingsStore } from '../../store/settings'
import type { SessionStatus } from '../../store/sessions'

/**
 * StatusIndicator reads `resolvedTheme` from the settings store to pick the per-theme LED
 * spec, so a story must set the STORE — not just a CSS wrapper. The `data-theme` wrapper
 * still supplies the surface tokens the dot's bezel is judged against.
 */
const themed =
  (theme: 'light' | 'dark' | 'hc' | 'hc-light'): Decorator =>
  (Story) => {
    useSettingsStore.setState({ resolvedTheme: theme })
    return (
      <div data-theme={theme} className="bg-bg-secondary text-text-primary p-6">
        <Story />
      </div>
    )
  }

const STATES: { status: SessionStatus; isUnread: boolean; label: string }[] = [
  { status: 'working', isUnread: false, label: 'working' },
  { status: 'initializing', isUnread: false, label: 'setting up' },
  { status: 'idle', isUnread: true, label: 'done / unread' },
  { status: 'idle', isUnread: false, label: 'idle' },
  { status: 'error', isUnread: false, label: 'error' },
]

/** Every LED state in a row, so a single shot regresses the whole set per theme. */
function AllStates() {
  return (
    <div className="flex items-center gap-6">
      {STATES.map((s) => (
        <div key={s.label} className="flex flex-col items-center gap-2">
          <StatusIndicator status={s.status} isUnread={s.isUnread} />
          <span className="text-3xs text-text-tertiary whitespace-nowrap">{s.label}</span>
        </div>
      ))}
    </div>
  )
}

const meta: Meta<typeof AllStates> = {
  title: 'SessionList/StatusIndicator',
  component: AllStates,
}
export default meta
type Story = StoryObj<typeof AllStates>

export const Light: Story = { decorators: [themed('light')] }
export const Dark: Story = { decorators: [themed('dark')] }
export const HighContrast: Story = { decorators: [themed('hc')] }
export const HighContrastLight: Story = { decorators: [themed('hc-light')] }
