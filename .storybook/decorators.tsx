import React from 'react'
import type { Decorator } from '@storybook/react'
import { PanelProvider } from '../src/renderer/panels/system/PanelContext'
import { DEFAULT_TOOLBAR_PANELS } from '../src/renderer/panels/system/types'
import { useSessionStore } from '../src/renderer/store/sessions'

/**
 * Wraps story in PanelProvider with default toolbar panels.
 */
export const withPanelProvider: Decorator = (Story) => (
  <PanelProvider
    toolbarPanels={[...DEFAULT_TOOLBAR_PANELS]}
    onToolbarPanelsChange={() => {}}
  >
    <Story />
  </PanelProvider>
)

/**
 * Pre-sets session store state before the story renders.
 */
export function withSessionStore(state: Record<string, unknown>): Decorator {
  return (Story) => {
    React.useEffect(() => {
      useSessionStore.setState(state)
    }, [])
    return <Story />
  }
}

/**
 * Wraps story in a dark-themed container with fixed dimensions.
 */
export const withDarkTheme: Decorator = (Story) => (
  <div
    className="bg-bg-primary text-text-primary"
    style={{ width: 1280, height: 720, overflow: 'hidden' }}
  >
    <Story />
  </div>
)

/**
 * Render a story under a specific theme.
 *
 * This works only because the themes are scoped to `[data-theme='...']` rather than
 * `:root[data-theme=...]` — so a wrapper element can carry one, and a single story
 * can be light while the rest of the page stays dark.
 */
export const withTheme =
  (theme: 'dark' | 'light' | 'hc' | 'hc-light'): Decorator =>
  (Story) => (
    <div data-theme={theme} className="bg-bg-primary text-text-primary p-4">
      <Story />
    </div>
  )
