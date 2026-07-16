/**
 * Themed stories.
 *
 * These are the coverage for the new palettes. We deliberately do NOT re-shoot every
 * story under every theme — that would be 264 x 4 reference images, a repo-size cost
 * no one agreed to. A handful of high-value surfaces exercises every token instead:
 * text tiers, borders, the accent and its label, the steppers, and the disabled state.
 */
import type { Meta, StoryObj } from '@storybook/react'
import { AppearanceSettings } from './AppearanceSettings'
import { DEFAULT_APPEARANCE } from '../../../shared/appearance'
import { withTheme } from '../../../../.storybook/decorators'

const meta: Meta<typeof AppearanceSettings> = {
  title: 'Settings/AppearanceSettings',
  component: AppearanceSettings,
  args: {
    appearance: DEFAULT_APPEARANCE,
    resolvedTheme: 'dark',
    onChange: () => {},
    onReset: () => {},
  },
}
export default meta

type Story = StoryObj<typeof AppearanceSettings>

export const Dark: Story = {
  decorators: [withTheme('dark')],
}

export const Light: Story = {
  args: { resolvedTheme: 'light' },
  decorators: [withTheme('light')],
}

/** Hierarchy collapse: the dimmed text tier stops existing. */
export const HighContrastLight: Story = {
  args: { resolvedTheme: 'hc-light' },
  decorators: [withTheme('hc-light')],
}

export const HighContrastDark: Story = {
  args: { resolvedTheme: 'hc' },
  decorators: [withTheme('hc')],
}

/** A magenta accent, fitted per theme — the hue holds, the lightness moves. */
export const MagentaAccentOnLight: Story = {
  args: {
    appearance: { ...DEFAULT_APPEARANCE, accent: '#ff00ff' },
    resolvedTheme: 'light',
  },
  decorators: [withTheme('light')],
}

/** Status indicators following the theme accent instead of the default green. */
export const StatusMatchAccentOnLight: Story = {
  args: {
    appearance: { ...DEFAULT_APPEARANCE, statusColor: 'accent' },
    resolvedTheme: 'light',
  },
  decorators: [withTheme('light')],
}

/** A custom magenta status colour, fitted to the non-text floor on dark. */
export const StatusCustomOnDark: Story = {
  args: {
    appearance: { ...DEFAULT_APPEARANCE, statusColor: '#ff00ff' },
  },
  decorators: [withTheme('dark')],
}
