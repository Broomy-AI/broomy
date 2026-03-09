import React from 'react'
import type { Decorator } from '@storybook/react'
import { PanelProvider } from '../src/renderer/panels/PanelContext'
import { DEFAULT_TOOLBAR_PANELS } from '../src/renderer/panels/types'
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
